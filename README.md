# Firm RMS

Resource Management System for a ~300-person, multi-office Indian CA firm —
plans, allocates, tracks and reports deployment of partners, qualified
staff, semi-qualified staff and articled assistants across statutory
audit, internal audit, IFC, tax audit, consolidation, FDD, IPO and
forensic engagements. Built per the phased spec at the root of this repo's
originating build prompt (§0–§16); see `docs/decisions.md` for the
assumptions made where the spec deferred to firm-specific answers.

## Status: Phases P0–P8 complete

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
| P9 | Timesheets, actuals, margin | not started |
| P10 | Forecasting, scenarios, roll-forward, bench, burnout watchlist | not started |
| P11 | Mobile `/me`, ICS feed, scheduled emails, backup/restore drill | not started |

67 backend tests + 12 frontend unit tests pass, covering acceptance tests
T1–T4, T6–T13, T16 from §14 (T5 is folded into the R6 EQCR test set; T14,
T15 depend on roll-forward/full-FY report-performance work that hasn't
started yet — see `docs/business-rules.md` and the phase table above),
plus unit coverage for all of R10–R24, independence declarations, resource
requests, RP-13 and the notification service. The scheduler board (P4),
dashboards (P6), report library (P7) and the new WARN/INFO rules (P8) were
all additionally verified by scripted browser interaction (Playwright)
against the real API and a 300-staff seeded dataset — not just reviewed as
code. That process caught and fixed several real bugs along the way (a
UUID type-coercion bug in login/lookups, an Excel sheet-name restriction, a
`capacity_daily` gap for directly-seeded data, raw UUIDs leaking into
report tables instead of the paired name field, and — in P8 — the
scheduler's booking form silently dropping INFO-severity violations
instead of rendering them) — see `docs/decisions.md`.

## Quick start

See `docs/user-guide.md` for full instructions. Fastest path:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                                  # 67 passed
python -m app.jobs.startup_seed         # admin@firm.local / ChangeMe!2026
uvicorn app.main:app --reload           # http://localhost:8000/docs

cd ../frontend
npm install
npm test                                # 12 passed
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
    api/v1/       # routers, incl. scheduler.py (board read model), dashboards.py (C1-C6), capacity.py, reports.py (RP-01..09, RP-13), independence.py, resource_requests.py
    services/     # conflict_engine.py (R1-R24), capacity_materializer.py, capacity_report.py, dashboard.py, reports.py, notifications.py
    reports/      # excel_export.py + pdf_export.py — shared formatted xlsx/pdf builders (Indian number format)
    importers/    # two-phase Excel validate/commit
    jobs/         # boot-time bootstrap, capacity_job.py (nightly APScheduler recompute)
  alembic/        # migrations (0001 initial schema, 0002 Postgres EXCLUDE constraint)
  seed/           # seed_data.py (full §14 demo dataset), sample_masters.xlsx
  tests/          # pytest — acceptance tests named after their T-number in §14
frontend/
  src/
    pages/        # Login, Dashboard, Scheduler (P4), Dashboards (P6), Reports (P7)
    components/scheduler/   # SchedulerGrid (SVG board), BookingForm, FilterBar, colors/layout helpers
    components/dashboards/  # ChartCard, DashboardFilterBar, C1-C6 chart components, drill-through modals
    components/reports/     # ReportFilterBar, generic ReportTable
    lib/          # API clients (axios), date helpers, undo/redo store, PNG export, Zustand auth store
    types/        # scheduler.ts, dashboard.ts, report.ts — shapes shared with the API
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
