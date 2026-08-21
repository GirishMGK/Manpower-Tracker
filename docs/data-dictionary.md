# Data Dictionary — Phase P0–P9

Full entity definitions live as SQLModel classes in `backend/app/models/`
(one file per aggregate) — that source is authoritative; this page is a
map of what's implemented and where, plus anything that deviates from or
extends §3 of the spec.

| Table | Model file | Spec ref | Status |
|---|---|---|---|
| `offices` | `models/reference.py` | §3.1 | Implemented |
| `departments` | `models/reference.py` | §3.2 | Implemented (10 seeded, see `seed/seed_data.py`) |
| `grades` | `models/reference.py` | §3.15 | Implemented |
| `skills` | `models/reference.py` | §3.7 | Implemented (20 seeded) |
| `staff_skills` | `models/reference.py` | §3.7 | Implemented |
| `activity_codes` | `models/reference.py` | §3.15 | Implemented (schema only, not seeded yet) |
| `app_config` | `models/reference.py` | §3.15 | Implemented, seeded on container boot (`app/jobs/startup_seed.py`) |
| `client_groups` | `models/client.py` | §3.4 | Implemented |
| `clients` | `models/client.py` | §3.3 | Implemented |
| `staff` | `models/staff.py` | §3.6 | Implemented |
| `engagements` | `models/engagement.py` | §3.5 | Implemented |
| `allocations` | `models/allocation.py` | §3.8 | Implemented, incl. Postgres `EXCLUDE` guard (alembic `0002`) |
| `non_availability` | `models/allocation.py` | §3.9 | Implemented + approval workflow with conflict check |
| `holiday_calendar` | `models/allocation.py` | §3.10 | Implemented |
| `timesheets` | `models/allocation.py` | §3.11 | Implemented — CRUD + DRAFT→SUBMITTED→APPROVED/REJECTED workflow (`/api/v1/timesheets`, Phase P9); only APPROVED rows count as actuals |
| `independence_declarations` | `models/allocation.py` | §3.12 | Implemented — CRUD + review workflow (`/api/v1/independence-declarations`, Phase P8); read path also feeds R5/R24 and RP-13 |
| `resource_requests` | `models/allocation.py` | §3.13 | Implemented — CRUD + fulfilment workflow (`/api/v1/resource-requests`, Phase P8); `status` is derived from `fulfilment_allocation_ids` vs. `headcount`, not directly settable |
| `audit_log` | `models/audit_log.py` | §3.14 | Implemented, append-only, no delete route anywhere |
| `users` | `models/user.py` | *not in spec* — see `docs/decisions.md` | Implemented |
| `capacity_daily` | `models/capacity.py` | §5 (named explicitly, not in §3's table list) | Implemented — materialised, not user-editable; see below |

## Deviations / additions vs. §3 (see `docs/decisions.md` for rationale)

- `users` table added for login identity, separate from `staff`.
- `staff.notice_period_end` added (needed by R21, not yet implemented).
- `engagement_code`, `client_code`, `employee_code` all enforced unique at
  the DB level, which the importer's idempotent upsert (§10) relies on.

## Scheduler read models (§6.1, Phase P4)

`GET /api/v1/scheduler/board` and `GET /api/v1/scheduler/engagements-lookup`
(`app/api/v1/scheduler.py`) are purpose-built response shapes for the
scheduler UI — they join allocation → engagement → client server-side so
the board renders from one round trip instead of N+1 client-side joins.
They're read-only projections over the same tables above; no new state.

## `capacity_daily` (§5, Phase P5)

One row per `(staff_id, date)`: `gross_capacity_hrs`, `leave_deduction_hrs`,
`net_capacity_hrs`, `allocated_hrs`, `soft_allocated_hrs`, `chargeable_hrs`,
`available_hrs`, `utilisation_pct`, `chargeable_util_pct`, `bench_flag`.
Written only by `app/services/capacity_materializer.py::recompute_range` —
nightly (rolling 30-days-back/180-days-forward window) and synchronously on
every allocation/leave mutation. Every report/dashboard reads this table,
never raw allocations, for anything beyond a single validate-time check
(§5: "Reports must never recompute from raw allocations at query time for
ranges > 90 days"). The PK column is named `capacity_date`, not `date` —
a field named the same as its own type annotation breaks SQLModel/pydantic's
model construction.

## Dashboard read models (§7.1, Phase P6)

C3–C6 all read from one shared computation,
`app/services/dashboard.py::fetch_allocation_fte_rows`: one row per
(allocation, filters) with `fte = (allocation_pct/100) × (overlap_days /
period_days)` already computed, plus every dimension (grade, office,
department, partner, client, client_group, risk_rating) a chart might
group by. C1/C2 are headcount snapshots and query `staff` directly instead
— no FTE math involved. No new tables; these are response shapes only.

## Report library read models (§11, Phase P7 + P8)

`app/services/reports.py` — one function per RP, each independent (unlike
C3-C6's shared FTE computation, since every report has its own distinct
row shape per §11's column list). Two exceptions reuse existing P5/P6
work rather than re-deriving it: RP-03 calls
`capacity_report.get_staff_utilisation` directly (same materialised
`capacity_daily` table, same numbers `/api/v1/capacity/utilisation`
returns), and RP-06 queries `capacity_daily` rows directly to find staff
with at least one fully-free working day. No new tables; RP-07 reads
`allocations.override_flags`, which is populated by the conflict engine's
WARN-override flow (§4) — it's the audit trail already being written,
not new state collected for reporting's sake.

RP-13 (Phase P8) is the one report that's deliberately *not* date-ranged
in its row selection — independence/rotation are point-in-time facts, not
a period metric, so it lists every active engagement regardless of
`date_from`/`date_to` (those params are still accepted for consistency
with the rest of the library, just unused). It reads
`engagements` (EP/EQCR/rotation-due fields) joined with `clients`
(PIE flag, client group) and `independence_declarations` (conflict/review
status) — no new tables.

## Conflict engine R10–R24 (Phase P8)

All fourteen rules live in `app/services/conflict_engine.py` alongside
R1–R9, same `check_*(db, cand, ...) -> RuleViolation | None` shape, same
`validate_allocation` orchestrator. Two additive fields were added to
`AllocationCandidate` (not persisted — mirrors the existing `Allocation`
columns) to carry data the R1–R9 checks never needed: `office_id` (R16
outstation cap, R17 location mismatch) and `work_location` (unused by any
rule yet, carried for parity with the `Allocation`/`AllocationCreate`
shape). See `docs/business-rules.md` for the full R10–R24 list and
`docs/decisions.md` for where a rule approximates a concept the schema
doesn't store exactly as named.

## Notifications (§9, Phase P8)

`app/services/notifications.py` — no new tables; a stateless best-effort
SMTP send, no-op if `RMS_SMTP_HOST` is unset (the default in dev/test).
Triggered from `app/api/v1/allocations.py` on `POST .../approve`
(confirm) and `DELETE .../{id}` (cancel), emailing the booked staff
member's `official_email`/`personal_email`. A failed or skipped send
never blocks or rolls back the allocation write — it runs after the
triggering transaction has already committed.

## Timesheets, actuals and margin (§9, Phase P9)

`/api/v1/timesheets` — DRAFT → SUBMITTED → APPROVED/REJECTED, editable
only in DRAFT. RBAC is finer than a flat role list: STAFF/MANAGER can only
act on their own `Timesheet.staff_id` (checked against `User.staff_id`),
ADMIN/RESOURCE_MANAGER/PARTNER/HR can log or edit on anyone's behalf, and
approve/reject is restricted to ADMIN/RESOURCE_MANAGER/PARTNER/MANAGER.
No new capability table — `timesheets` (§3.11) already had the shape
needed; P9 adds the workflow on top of it.

`app/services/actuals.py` reads only APPROVED timesheets — no new
tables — to compute `ActualsSummary` (hours, chargeable hours, cost via
`staff.cost_rate_per_hour`) per engagement or per staff, and
`EngagementMargin` (fee − actual cost − out-of-pocket budget, plus
budget-vs-actual hours variance) per engagement. RP-10 (Engagement
Profitability) and RP-11 (Timesheet Summary) in the report library both
read through this service rather than re-deriving the aggregation.

RP-10/RP-11 fill the gap left after RP-01..RP-09 and RP-13: this session's
retained context doesn't carry the original spec's verbatim §11 text for
RP-10 through RP-12 or RP-14 through RP-17, so these two are scoped and
named directly from the P9 deliverable ("timesheets, actuals, margin")
rather than transcribed from a report definition — see `docs/decisions.md`.
Like RP-13, RP-10 is a to-date figure, not a period slice: fee and the
out-of-pocket budget are whole-engagement numbers, so it doesn't apply the
report's date filter (accepted for parameter consistency, unused in the
row selection). RP-11 *is* date-ranged, since a timesheet total genuinely
is a period metric.

## RBAC column masking (§2)

Implemented via response-schema post-processing, not query-level
filtering, so the masked response is still a normal object with `null` in
the sensitive fields rather than a 403 on the whole record:

- `staff.cost_rate_per_hour`, `staff.bill_rate_per_hour` — masked for
  `MANAGER`, `STAFF`, `HR`, `VIEWER`.
- `engagements.fee_amount`, `engagements.out_of_pocket_budget`,
  `engagements.billing_milestones` — same mask set.

See `app/core/deps.py::can_see_financials` and
`StaffRead.from_orm_masked` / `EngagementRead.from_orm_masked`.

## Soft delete / audit (§0.1, §3.14)

Every table mixes in `TimestampSoftDeleteMixin`
(`created_at/updated_at/created_by/updated_by/is_active/deleted_at`, see
`models/base.py`). No route anywhere issues a real `DELETE FROM`; see
`app/core/soft_delete.py` and T16.

Every mutating route calls `app.core.audit.write_audit_log` in the same
DB transaction as the entity write, so a mutation and its audit row commit
or roll back together (T12).
