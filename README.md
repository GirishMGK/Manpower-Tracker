# Firm RMS

Resource Management System for a ~300-person, multi-office Indian CA firm —
plans, allocates, tracks and reports deployment of partners, qualified
staff, semi-qualified staff and articled assistants across statutory
audit, internal audit, IFC, tax audit, consolidation, FDD, IPO and
forensic engagements. Built per the phased spec at the root of this repo's
originating build prompt (§0–§16); see `docs/decisions.md` for the
assumptions made where the spec deferred to firm-specific answers.

## Status: Phases P0–P11 complete — the full §13 build is done

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Scaffold, Docker Compose, auth/RBAC, audit_log, health check | ✅ |
| P1 | Masters (offices, departments, clients, staff, skills) + Excel import/export | ✅ |
| P2 | Engagements + holiday calendar + leave (non_availability) | ✅ |
| P3 | Allocation CRUD + conflict engine R1–R9 + `/validate` | ✅ |
| P4 | Scheduler board (drag/drop/resize, filters, grouping, heat shading, live validation) | ✅ |
| P5 | Capacity materialisation (`capacity_daily`), nightly job, sync invalidation | ✅ |
| P6 | Dashboards C1–C6 + drill-through + Excel/PNG export | ✅ |
| P7 | Report library RP-01..RP-09 + Excel/PDF export | ✅ |
| P8 | Rules R10–R24, independence workflow, resource requests, RP-13, notifications | ✅ |
| P9 | Timesheets, actuals, margin | ✅ |
| P10 | Forecasting, scenarios, roll-forward, bench, burnout watchlist | ✅ |
| P11 | Mobile `/me`, ICS feed, scheduled emails, backup/restore drill | ✅ |

104 backend tests + 18 frontend unit tests pass, covering acceptance tests
T1–T4, T6–T13, T16 from §14 (T5 is folded into the R6 EQCR test set; T14/
T15 reference roll-forward and full-FY report performance — roll-forward
now exists (P10), but this session's retained context doesn't carry T14/
T15's exact assertions to confirm against, so they're not claimed passing
here — see `docs/business-rules.md`), plus unit coverage for all of
R10–R24, independence declarations, resource requests, RP-10 through
RP-14, the notification service, the P9 timesheet/actuals/margin
workflow, the P10 scenario-planning/roll-forward workflow, and P11's
`/me`/ICS/digest/backup-restore work. The scheduler board (P4), dashboards
(P6), report library (P7), the new WARN/INFO rules (P8) and the mobile
`/me` page (P11) were all verified by scripted browser interaction
(Playwright) against the real API and a 300-staff seeded dataset; P9 and
P10 were verified the same way minus the browser step, since both were
backend-only phases. That process caught and fixed several real bugs
along the way (a UUID type-coercion bug in login/lookups, an Excel
sheet-name restriction, a `capacity_daily` gap for directly-seeded data,
raw UUIDs leaking into report tables instead of the paired name field; in
P8, the scheduler's booking form silently dropping INFO-severity
violations instead of rendering them; in P10, a real SQLAlchemy
expire-on-commit footgun — `.model_dump()` on an object expired by a
*later* commit than its last `db.refresh()` silently returns an empty
dict rather than lazy-loading; and in P11, a `(str, Enum)` f-string
formatting gotcha that leaked `AllocationRole.FIELD_INCHARGE` instead of
`FIELD_INCHARGE` into the ICS feed and digest emails) — see
`docs/decisions.md`. P11's backup/restore scripts were drilled for real
against a genuine local Postgres 16 instance and the SQLite dev DB alike
— seed, back up, destroy the live data, restore, confirm every row count
matches — not just written and left untested.

## Quick start

See `docs/user-guide.md` for full instructions. Fastest path:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                                  # 104 passed
python -m app.jobs.startup_seed         # admin@firm.local / ChangeMe!2026
uvicorn app.main:app --reload           # http://localhost:8000/docs

cd ../frontend
npm install
npm test                                # 18 passed
npm run dev                             # http://localhost:5173 -> /schedule, /dashboards, /reports
```

Or the full stack with Postgres:

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

## Repo layout

```
backend/
  app/
    core/         # config, security (JWT/bcrypt), deps (RBAC), audit, soft-delete
    models/       # SQLModel entities — one file per aggregate
    schemas/      # pydantic request/response, incl. RBAC field masking
    api/v1/       # routers, incl. scheduler.py (board read model), dashboards.py (C1-C6), capacity.py, reports.py (RP-01..14), independence.py, resource_requests.py, timesheets.py, scenarios.py, me.py
    services/     # conflict_engine.py (R1-R24), capacity_materializer.py, capacity_report.py, dashboard.py, reports.py, notifications.py, actuals.py, scenario_service.py, roll_forward.py, me_service.py, ics_export.py, digest.py
    reports/      # excel_export.py + pdf_export.py — shared formatted xlsx/pdf builders (Indian number format)
    importers/    # two-phase Excel validate/commit
    jobs/         # boot-time bootstrap, capacity_job.py (nightly recompute), digest_job.py (weekly booking digest)
  alembic/        # migrations (0001 initial schema, 0002 Postgres EXCLUDE constraint)
  scripts/        # backup.sh / restore.sh — Postgres/SQLite backup+restore
  seed/           # seed_data.py (full §14 demo dataset), sample_masters.xlsx
  tests/          # pytest — acceptance tests named after their T-number in §14
frontend/
  src/
    pages/        # Login, Dashboard, Scheduler (P4), Dashboards (P6), Reports (P7), Me (P11)
    components/scheduler/   # SchedulerGrid (SVG board), BookingForm, FilterBar, colors/layout helpers
    components/dashboards/  # ChartCard, DashboardFilterBar, C1-C6 chart components, drill-through modals
    components/reports/     # ReportFilterBar, generic ReportTable
    lib/          # API clients (axios), date helpers, undo/redo store, PNG export, Zustand auth store, meApi/meFormat
    types/        # scheduler.ts, dashboard.ts, report.ts, me.ts — shapes shared with the API
docs/
  decisions.md          # §16 assumptions, recorded rather than blocking the build
  data-dictionary.md
  business-rules.md     # R1-R24 status, one row each
  user-guide.md
docker-compose.yml       # db (Postgres), api, web, nginx
nginx/nginx.conf
```

## The scheduler board (P4)

`/schedule` — rows grouped by office → department (collapsible), an 8-week
default window with Day/Week zoom, and a custom SVG timeline (no Gantt
library, per §1). Built and verified against the real API:

- **Create**: click an empty cell → search-select an engagement → pick
  role/dates/% → "Check for conflicts" calls `/allocations/validate` live
  → BLOCK violations shown and block Save; WARN violations require a typed
  override reason per rule before Save enables; clean → Save.
- **Move/resize**: drag a bar's body to move it, or its edges to resize;
  the bar recolors live (red=BLOCK, amber=WARN) from a debounced
  `/validate` call as you drag. On drop: BLOCK reverts the bar and toasts
  why; a WARN reopens the edit form with the dragged dates so the override
  reason is explicit, never silently applied; clean commits via `PATCH` and
  pushes an undo entry.
- **Filters**: office, department, staff-name search — all re-query
  `/api/v1/scheduler/board` server-side, not client-side filtering.
- **Heat/shading**: per-day utilisation tint (green scaling to 100%, red
  above), diagonal hatch for approved leave, tint columns for
  weekends/holidays, a today marker.
- **Undo/redo**: last 20 actions (Ctrl+Z / Ctrl+Shift+Z), each replaying
  the actual API call rather than mutating local state.
- **Keyboard**: `n` new booking on the selected staff row, `/` focuses
  search, `←`/`→` shift the window a week.

Deferred from §6.1's fuller spec: Month/Quarter zoom (Day/Week cover the
default 8-week working set), three-level Office→Department→**Grade**
sub-grouping (currently two levels), multi-select bulk actions, and the
prior-year roll-forward copy (needs P8/P10's engagement-rotation and
scenario groundwork first).

## Capacity materialisation (P5)

`capacity_daily` (§5) is a per-staff-per-day table with net capacity,
allocated/soft-allocated/chargeable hours, utilisation %, and a bench
flag. `app/services/capacity_materializer.py` computes it batch-wise (one
handful of queries for the whole staff set + date range, then an
in-Python day loop keyed per staff) rather than per-staff-per-day queries
— that's what makes the read side fast. Two write paths, both calling the
same function:

- **Nightly** (`app/jobs/capacity_job.py`, APScheduler in-process): a
  rolling 30-days-back to 180-days-forward window, every night at 2 AM IST.
- **Synchronous** on every allocation/leave mutation (create, move,
  resize, approve, cancel): recomputes just the affected staff member over
  the union of old + new dates, so the table is never stale after a save.

Reports/dashboards read only `capacity_daily` (`app/services/capacity_report.py`),
never raw allocations — verified by a perf test seeding the full 300-staff
dataset and confirming the utilisation query for 300 staff × 90 days
returns in under 2 seconds (the exact P5 DoD wording).

## Dashboards (P6)

`/dashboards` — the six mandatory charts (C1–C6), a shared filter bar
(date range, office, department, partner, client group, staff category)
that every chart re-queries against, drill-through to the underlying
records, and Excel/PNG export on every chart:

- **C1** headcount by office × category (stacked bar, absolute/% toggle)
  and **C2** office × grade (heatmap table) are pure headcount snapshots —
  no date range, straight `GROUP BY` over active staff.
- **C3** partner-wise FTE, **C4** partner portfolio (fee/FTE/engagement-count
  bubble), **C5** department-wise FTE (donut + 12-month trend), and **C6**
  department × grade are all FTE-over-a-period metrics. One shared function
  (`fetch_allocation_fte_rows`) computes `(allocation_pct/100) × (overlap_days
  / period_days)` per allocation once; every chart just groups those same
  rows differently — so a person on two 50% bookings for the whole window
  shows 0.5 FTE against each partner, never 1.0 against both.
- **Export**: Excel via `xlsxwriter` with the Indian number format, frozen
  header and autofilter (§10/§11); PNG by serialising the chart's own
  rendered SVG onto a canvas client-side — no extra dependency, no
  screenshot service.

Verified against the live API and the seeded 300-staff dataset: all 6
charts render, the office filter narrows every chart in sync, clicking a
bar/cell/point opens the correct drill-through record list, and both
export buttons fire real file downloads.

## Report library (P7)

`/reports` — RP-01 through RP-09, one shared filter bar (§11's standard
params: date range, office, department, partner, client group, staff
category, status), a generic table that renders whatever columns a report
returns, and Excel + PDF export on every report:

- **RP-01** deployment register, **RP-02** engagement team composition,
  **RP-04** partner portfolio (clients/engagements/fee/FTE/fee-per-FTE/
  overdue-reports), **RP-05** office resourcing (headcount, FTE deployed,
  inbound/outbound deputation, avg utilisation), **RP-08** article training
  record (clients served, exposure diversity score, leave vs entitlement,
  Form 103/108 status) and **RP-09** leave and absence all read allocations/
  engagements/staff directly for their own row shape.
- **RP-03** staff utilisation reads only `capacity_daily` (§5) — the same
  materialised table P5 built, not raw allocations.
- **RP-06** bench and availability also reads `capacity_daily`, flagging
  any staff member with at least one fully-free working day in the window.
- **RP-07** conflict and exception report reads `allocations.override_flags`
  — literally the audit trail §4's WARN-override flow writes — making it
  the ISQM/SQC1 evidence report by construction, not a bolted-on log.
- **Export**: Excel reuses P6's `xlsxwriter` builder; PDF is new
  (`app/reports/pdf_export.py`, reportlab platypus) — landscape A4, Indian
  number formatting, a repeating header row, print-ready for a partner
  meeting.

Verified against the live API and the seeded dataset: all 9 reports render
real rows (RP-07 is legitimately empty against the seed data specifically
— seeding inserts allocations directly and bypasses the conflict engine,
so no overrides ever get recorded; `tests/test_reports.py` proves the
report itself works by recording a real override through the API first),
filtering narrows results, and both export buttons produce valid files
(`%PDF` header checked, not just a 200 status).

## Phase P8 — rules R10–R24, independence/resource-request workflow, RP-13, notifications

- **Conflict engine**: all fourteen remaining rules from §4 —
  `EQCR_MISSING`, `SKILL_GAP`, `GRADE_MIX_BREACH`, `ICAI_TRAINING_LIMIT`,
  `ARTICLE_HOURS_BREACH`, `SUSTAINED_OVERLOAD`, `OUTSTATION_BREACH`,
  `LOCATION_MISMATCH`, `BUDGET_OVERRUN`, `DEADLINE_RISK`,
  `NO_EXPOSURE_DIVERSITY`, `EXITING_STAFF`, `UNAPPROVED_PIPELINE`,
  `DUPLICATE_ROLE`, `COOLING_OFF` — same `check_*` shape and
  `validate_allocation` orchestrator as R1–R9, so every existing call site
  (`/allocations/validate`, `POST`/`PATCH /allocations`, the scheduler's
  live drag-hover preview) picked them up with no caller changes. See
  `docs/business-rules.md` for what each one checks and
  `docs/decisions.md` for the handful that approximate a concept (a
  secondment record, a notice-period start date, days remaining in a
  cooling-off window) the fixed §3 schema doesn't store exactly as named.
- **Independence declarations** (`/api/v1/independence-declarations`):
  create records the threat checkboxes from §3.12 with `is_conflicted`
  always false; only a review action (Admin/Partner/HR) can set the final
  determination, so R5/R24 and RP-13 always have a named reviewer behind
  any conflict they surface.
- **Resource requests** (`/api/v1/resource-requests`): create against an
  engagement, link real bookings via `/fulfil`, and `status` — OPEN →
  PARTIALLY_FILLED → FILLED — is computed from the fulfilment list rather
  than settable directly.
- **RP-13** (Independence and Rotation): client, EP, EP tenure,
  EP/firm rotation-due FY, EQCR, open conflicts, declaration status — one
  row per active engagement, point-in-time rather than date-ranged like
  the rest of the library.
- **Notifications** (`app/services/notifications.py`): best-effort SMTP
  email on allocation confirm/cancel, no-op unless `RMS_SMTP_HOST` is
  configured, never blocks or rolls back the triggering write.

Verified against the live API, the seeded dataset and the real scheduler
UI (Playwright): unit tests for all 14 new rules plus the independence/
resource-request/RP-13/notification flows (67 backend tests total), and a
live scheduler check that deliberately hit three severities in one booking
(`OVERALLOCATION` BLOCK, `EQCR_MISSING` + `SUSTAINED_OVERLOAD` WARN,
`UNAPPROVED_PIPELINE` INFO) — which is how the scheduler's booking form
was caught silently dropping INFO-severity violations (only BLOCK/WARN
had a render branch) and fixed; see `docs/decisions.md`.

## Phase P9 — timesheets, actuals, margin

- **Timesheets** (`/api/v1/timesheets`): DRAFT → SUBMITTED →
  APPROVED/REJECTED, editable only in DRAFT. RBAC is finer-grained than a
  flat role list — `STAFF`/`MANAGER` logins can only act on their own
  linked `staff_id`; `ADMIN`/`RESOURCE_MANAGER`/`PARTNER`/`HR` can log or
  edit on anyone's behalf; approve/reject is restricted to
  `ADMIN`/`RESOURCE_MANAGER`/`PARTNER`/`MANAGER`, so a self-service login
  can never approve its own hours.
- **Actuals** (`app/services/actuals.py`): only `APPROVED` timesheets ever
  count — hours, chargeable hours and cost (via `staff.cost_rate_per_hour`)
  aggregated per engagement or per staff member.
- **Margin**: `engagement_margin()` computes fee − actual cost − the
  out-of-pocket budget (no actual-OOP tracking exists yet, so the budget
  figure is a conservative proxy), plus budget-vs-actual hours variance.
- **RP-10** (Engagement Profitability) and **RP-11** (Timesheet Summary)
  join the report library on the existing dispatch table, reusing the
  same Excel/PDF export builders unchanged. This session's retained
  context didn't carry the original spec's verbatim §11 text for this
  numbering range, so both are scoped from the P9 deliverable description
  rather than transcribed — see `docs/decisions.md` for the exact caveat
  and what to do if the real RP-10/RP-11 definitions surface later.

Verified against the live API and a seeded dataset end to end: unit tests
across the new router, the actuals/margin service and both reports (80
backend tests total), plus a real seeded server hit directly with curl —
create a DRAFT timesheet → submit → approve → confirm RP-10's actual
cost/margin and RP-11's approved-hours both reflect it correctly → pull
real `.xlsx`/`.pdf` exports off the running server. No frontend changes
this phase (no scheduler/dashboard/report UI needed updating), so no
Playwright pass was needed here — see `docs/decisions.md`.

## Phase P10 — forecasting, scenarios, roll-forward, bench/burnout watchlist

- **Scenarios** (`/api/v1/scenarios`, new tables `scenarios` +
  `scenario_allocations` — §8, not in §3's list, added the same way
  `capacity_daily` was in P5): a named sandbox of hypothetical bookings
  that reference real staff/engagements (so the real conflict engine can
  evaluate them accurately) but never touch `allocations` until
  `/promote`. `GET .../impact` runs R1-R24 against real data, a
  from-scratch overallocation check against sibling scenario lines
  (`SCENARIO_OVERALLOCATION`, since committed-data checks can't see
  those), and a per-staff utilisation delta reusing
  `capacity_report.get_staff_utilisation` and C3-C6's FTE formula.
  `/promote` writes real `DRAFT` allocations for every BLOCK/WARN-free
  line (INFO doesn't block) and reports exactly what it skipped and why.
- **Engagement roll-forward** (`POST /engagements/{id}/roll-forward`):
  `Engagement.prior_year_engagement_id` (§3.5) existed precisely for
  this. Clones an engagement into the next FY — team/role continuity and
  delivery config copied, financial terms/UDIN/report-signed date reset
  for renegotiation — then copies the source team as date-shifted `DRAFT`
  allocations one line at a time through the real conflict engine,
  skipping (and reporting) anything that isn't clean rather than carrying
  a conflict forward silently.
- **RP-12** (Capacity Forecast) and **RP-14** (Bench and Burnout
  Watchlist) join the report library, both reading only `capacity_daily`
  (§5). Like RP-10/RP-11 in P9, this session's retained context doesn't
  carry the original §11 text for this numbering range, so both are
  scoped from the P10 deliverable description rather than transcribed —
  see `docs/decisions.md`.

Verified against the live API and a seeded dataset end to end: unit tests
across scenarios, roll-forward and both new reports (92 backend tests
total), plus a real seeded server hit directly with curl — a scenario
line that correctly caught real conflicts (BLOCK `OVERALLOCATION`, WARN
`EQCR_MISSING`/`SUSTAINED_OVERLOAD`, INFO `UNAPPROVED_PIPELINE`) against
an already-overbooked seeded staff member, a second scenario that
promoted cleanly, a roll-forward that correctly skipped lines with a
genuine deadline/overload conflict in the source data rather than
copying it forward blind, and real RP-12/RP-14 exports. That process
caught two real bugs — see `docs/decisions.md`: an overly strict
scenario-promote check that treated INFO violations as blocking (fixed
to check BLOCK/WARN only), and a SQLAlchemy expire-on-commit ordering bug
where a later `recompute_range()` commit silently emptied an
already-`refresh()`-ed object's `.model_dump()`. No frontend changes this
phase either, so no Playwright pass — same posture as P9.

## Phase P11 — mobile /me, ICS feed, scheduled emails, backup/restore

The last phase in the §13 roadmap — every phase P0 through P11 is now built.

- **Mobile `/me`** (`/api/v1/me`, `frontend/src/pages/Me.tsx`): a
  single-column, phone-width self-service view — profile, current-FY leave
  balance, upcoming bookings (60 days), recent timesheets (30 days). Every
  route is scoped to the caller's own `staff_id` by construction (no
  `staff_id` parameter exists anywhere on the router), and a login with no
  linked staff record gets a clear "nothing to show" rather than an empty
  profile.
- **ICS calendar feed** (`GET /me/calendar.ics`, `app/services/ics_export.py`):
  hand-rolled RFC 5545 — no new dependency, same posture as P6's
  client-side PNG export. All-day `VEVENT`s with a correctly-exclusive
  `DTEND`. JWT-authenticated like the rest of the API, which real calendar
  apps can't satisfy for a live "subscribe by URL" — documented as a real
  limitation, not glossed over, in `docs/decisions.md`.
- **Scheduled weekly digest** (`app/jobs/digest_job.py`): a second,
  independent APScheduler instance (Monday 07:00 IST) emailing each staff
  member with an email on file and at least one confirmed booking that
  week — reusing P8's already-no-op-safe `notifications.py`.
- **Backup/restore** (`backend/scripts/backup.sh`/`restore.sh`): auto-detects
  Postgres vs. SQLite from `RMS_DATABASE_URL`. Postgres uses
  `pg_dump --format=custom` / `pg_restore --clean --if-exists`; SQLite is a
  file copy that moves the existing file aside (never deletes it outright,
  extending §0.1's soft-delete posture to an ops script). Both were
  **actually drilled**, not just written: a real local Postgres 16
  instance, seeded with the full 300-staff dataset, backed up, `TRUNCATE`'d
  to simulate data loss, restored — every table's row count matched
  exactly. Same drill for the SQLite dev path (delete the file entirely,
  restore, row counts match).

Two real bugs found via live verification (both in `docs/decisions.md`):
a `(str, Enum)` f-string formatting gotcha that leaked
`AllocationRole.FIELD_INCHARGE` into the ICS feed and digest emails
instead of `FIELD_INCHARGE` (Python's well-known str-mixin-enum
formatting inconsistency — pydantic response models had always serialized
these correctly, masking the bug everywhere else in the codebase; this
was the first place to format them as raw text), and the `/me` page
showing the login's synthetic `full_name` ("e0001") instead of the
roster's real name ("Aarav Roy") — caught from the actual Playwright
screenshot, not a passing test.

Verified against the live API, a seeded dataset, and the real frontend:
12 new backend tests (104 total) plus 6 new frontend unit tests (18
total) for the /me endpoints, ICS builder and digest content; a
Playwright pass logging in as a real seeded manager and confirming the
`/me` page renders correctly (profile, leave balance, bookings,
timesheets, working `.ics` download) with no enum-leak regressions; and
the full backup/restore drill described above.

## Design principles this build holds to (§0)

1. **Nothing is hard-deleted.** Every table soft-deletes; every mutation
   writes an `audit_log` row in the same transaction. No hard-delete code
   path exists anywhere — see `app/core/soft_delete.py` and T16.
2. **The conflict engine is the product**, not the calendar UI. All of
   R1–R24 are implemented and unit-tested — R1–R9 against the exact
   scenarios in §14 (T1–T7), R10–R24 (P8) against a targeted case per rule.
3. **Excel in, Excel out.** Bulk import is two-phase (validate, then
   commit) with a row-level error report and an all-or-nothing default —
   see `app/importers/`.
4. **Self-hosted, Postgres+SQLite dual-target.** SQLite for dev/tests
   (fast, no external dependency), Postgres for prod (needed for the
   `EXCLUDE` constraint that hard-stops 100% double-booking at the DB
   layer — alembic migration `0002`).
