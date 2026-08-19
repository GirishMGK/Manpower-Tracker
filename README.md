# Firm RMS

Resource Management System for a ~300-person, multi-office Indian CA firm —
plans, allocates, tracks and reports deployment of partners, qualified
staff, semi-qualified staff and articled assistants across statutory
audit, internal audit, IFC, tax audit, consolidation, FDD, IPO and
forensic engagements. Built per the phased spec at the root of this repo's
originating build prompt (§0–§16); see `docs/decisions.md` for the
assumptions made where the spec deferred to firm-specific answers.

## Status: Phases P0–P4 complete

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Scaffold, Docker Compose, auth/RBAC, audit_log, health check | ✅ |
| P1 | Masters (offices, departments, clients, staff, skills) + Excel import/export | ✅ |
| P2 | Engagements + holiday calendar + leave (non_availability) | ✅ |
| P3 | Allocation CRUD + conflict engine R1–R9 + `/validate` | ✅ |
| P4 | Scheduler board (drag/drop/resize, filters, grouping, heat shading, live validation) | ✅ |
| P5 | Capacity materialisation (`capacity_daily`) at scale | partial — synchronous calc only (`app/services/capacity.py`) |
| P6 | Dashboards C1–C6 | not started |
| P7 | Report library RP-01..RP-09 | not started |
| P8 | Rules R10–R24, independence workflow, resource requests, notifications | not started |
| P9 | Timesheets, actuals, margin | not started |
| P10 | Forecasting, scenarios, roll-forward, bench, burnout watchlist | not started |
| P11 | Mobile `/me`, ICS feed, scheduled emails, backup/restore drill | not started |

26 backend tests + 12 frontend unit tests pass, covering acceptance tests
T1–T4, T6–T8, T11–T13, T16 from §14 (T5 is folded into the R6 EQCR test
set; T9, T10, T14, T15 depend on dashboards/roll-forward/report-performance
work that hasn't started yet — see `docs/business-rules.md` and the phase
table above). The scheduler board (P4) was additionally verified by
scripted browser interaction (Playwright) against the real API — login,
create/edit/drag/resize a booking, live BLOCK/WARN coloring, filters, zoom,
group collapse, undo, and keyboard shortcuts all exercised against a
running instance, not just reviewed as code.

## Quick start

See `docs/user-guide.md` for full instructions. Fastest path:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                                  # 26 passed
python -m app.jobs.startup_seed         # admin@firm.local / ChangeMe!2026
uvicorn app.main:app --reload           # http://localhost:8000/docs

cd ../frontend
npm install
npm test                                # 12 passed
npm run dev                             # http://localhost:5173 -> /schedule
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
    api/v1/       # routers, incl. scheduler.py (board + engagement-lookup read models)
    services/     # conflict_engine.py (R1-R9), capacity.py
    importers/    # two-phase Excel validate/commit
    jobs/         # boot-time bootstrap (admin user + app_config defaults)
  alembic/        # migrations (0001 initial schema, 0002 Postgres EXCLUDE constraint)
  seed/           # seed_data.py (full §14 demo dataset), sample_masters.xlsx
  tests/          # pytest — acceptance tests named after their T-number in §14
frontend/
  src/
    pages/        # Login, Dashboard, Scheduler (the P4 board)
    components/scheduler/  # SchedulerGrid (SVG board), BookingForm, FilterBar, colors/layout helpers
    lib/          # API client (axios), scheduler API calls, date helpers, undo/redo store, Zustand auth store
    types/        # scheduler.ts — board/allocation/violation types shared with the API
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

## Design principles this build holds to (§0)

1. **Nothing is hard-deleted.** Every table soft-deletes; every mutation
   writes an `audit_log` row in the same transaction. No hard-delete code
   path exists anywhere — see `app/core/soft_delete.py` and T16.
2. **The conflict engine is the product**, not the calendar UI. R1–R9 are
   implemented and unit-tested against the exact scenarios in §14 (T1–T7);
   R10–R24 follow in P8.
3. **Excel in, Excel out.** Bulk import is two-phase (validate, then
   commit) with a row-level error report and an all-or-nothing default —
   see `app/importers/`.
4. **Self-hosted, Postgres+SQLite dual-target.** SQLite for dev/tests
   (fast, no external dependency), Postgres for prod (needed for the
   `EXCLUDE` constraint that hard-stops 100% double-booking at the DB
   layer — alembic migration `0002`).
