# Data Dictionary — Phase P0–P6

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
| `timesheets` | `models/allocation.py` | §3.11 | Schema only — workflow lands in P9 |
| `independence_declarations` | `models/allocation.py` | §3.12 | Schema + read path (used by R5) — write/approval UI lands in P8 |
| `resource_requests` | `models/allocation.py` | §3.13 | Schema only — fulfilment workflow lands in P8 |
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
