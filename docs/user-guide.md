# User Guide — current build (Phases P0–P7)

This covers what's actually usable today: authentication, master data,
engagements, leave, the allocation/conflict-engine API, the scheduler
board, capacity utilisation, the C1–C6 dashboards, and the RP-01..RP-09
report library. Timesheets and forecasting are not built yet — see the
root `README.md` for the phase roadmap.

## Running it locally

```bash
# Backend (SQLite dev DB, no Postgres needed for this)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.jobs.startup_seed        # creates admin@firm.local / ChangeMe!2026
uvicorn app.main:app --reload          # http://localhost:8000, docs at /docs

# Optional: full demo dataset (300 staff, 200 clients, 380 engagements)
python -m seed.seed_data

# Frontend
cd frontend
npm install
npm run dev                             # http://localhost:5173
```

Full stack via Docker Compose (Postgres, not SQLite):

```bash
cp backend/.env.example backend/.env    # edit RMS_JWT_SECRET_KEY at minimum
docker compose up --build
```

## Logging in

Default admin (created by `startup_seed`): `admin@firm.local` /
`ChangeMe!2026` — flagged `must_change_password`; there's no
change-password endpoint yet (P8/P11), so treat this as a dev-only
credential and rotate the DB row directly in a real deployment until that
lands.

If you ran the full `seed_data.py`, demo logins for other roles exist
too — see the bottom of `backend/seed/seed_data.py` for the list
(`rm@firm.local`, `hr@firm.local`, a sample `PARTNER` and `MANAGER`), all
with password `Demo@2026`.

## Bulk import (§10)

`backend/seed/sample_masters.xlsx` is a ready-to-use template: a Data
Dictionary sheet plus 300 sample staff rows and 200 sample client rows,
with dropdown-validated enum columns. Regenerate it with
`python -m seed.generate_sample_workbook`.

Two-phase flow, both under `/api/v1/admin/import/{staff|clients}/`:

1. `POST .../validate` — upload the file, get back `{total_rows,
   valid_count, error_count, errors: [...]}`. Nothing is written.
2. `POST .../commit` — re-validates (never trusts the earlier validate
   call) and writes. Default is all-or-nothing: any error anywhere means
   `committed: 0`. Pass `?commit_valid_only=true` to commit just the clean
   rows.
3. `POST .../validate/error-workbook` — same validation, but returns the
   error report as a downloadable `.xlsx` instead of JSON.

Re-importing a file with the same `employee_code`/`client_code` updates
the existing record rather than duplicating it.

## The conflict engine (§4)

`POST /api/v1/allocations/validate` runs R1–R9 against a proposed booking
and returns violations without saving — this is what a future scheduler UI
calls on every drag/drop. Each violation has a `severity`
(`BLOCK`/`WARN`/`INFO`), and `overridable` + `override_role` tell you
whether/how it can be pushed through.

Creating or updating an allocation (`POST`/`PATCH /api/v1/allocations`)
runs the same check server-side:

- Any `BLOCK` → `422`, always, no override path.
- Any `WARN` → `422` unless the request's `overrides` array includes a
  `{"code": "...", "reason": "..."}` entry for every WARN present. Recorded
  overrides land in `allocations.override_flags` and in `audit_log`.

See `docs/business-rules.md` for the full rule list and what's implemented
so far.

## RBAC and financial masking (§2)

Every endpoint is guarded by role at the route level
(`app/core/deps.py::require_roles`). Fee/cost/margin fields don't 403 for
roles without financial visibility (`MANAGER`, `STAFF`, `HR`, `VIEWER`) —
they come back as `null` on an otherwise-normal `200` response.

## The scheduler board (§6.1)

Log in and click "Open scheduler board" (or go straight to `/schedule`).
Staff rows are grouped by office → department, collapsible by clicking the
group header. Defaults to an 8-week window; `←`/`→` or the toolbar arrows
shift it a week, "Today" resets it.

- **Book someone**: click an empty cell in their row. Search for the
  engagement by client name or code, pick a role/%/dates, then "Check for
  conflicts" — this calls the same `/allocations/validate` the API uses,
  so what you see is exactly what would block or need an override reason
  at save time.
- **Move or resize a booking**: drag the middle of a bar to move it, or
  either edge to resize. It recolors live while dragging (red = would
  block, amber = would need an override) from the same validate call,
  debounced. Dropping on a clean slot commits immediately; dropping on a
  BLOCK reverts with a toast explaining why; dropping on a WARN reopens the
  edit form with the new dates so you type the override reason explicitly
  — nothing is ever silently overridden by a drag.
- **Edit or cancel**: click an existing bar to open it in edit mode;
  "Cancel booking" requires a reason, same as the API.
  `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo the last 20 scheduler actions (each
  replays the real API call, not just local UI state).
- **Filters**: office, department, and a staff-name search box (`/` to
  focus it) — all re-query the board server-side.
- **Zoom**: Day/Week toggle in the toolbar; Week fits the whole 8-week
  window without horizontal scrolling.

## Capacity and utilisation (§5)

`GET /api/v1/capacity/utilisation?date_from=&date_to=` returns net/allocated/
chargeable hours and utilisation % per staff member, reading only the
materialised `capacity_daily` table — fast even across the whole staff list
and a long date range. That table refreshes itself nightly and on every
allocation/leave change; `POST /api/v1/capacity/recompute` (Admin/RM only)
forces a rebuild for a range, useful right after a bulk import.

## Dashboards (§7.1)

`/dashboards` — six charts (C1 headcount by office × category, C2 office ×
grade heatmap, C3 partner-wise FTE, C4 partner portfolio bubble, C5
department FTE donut + trend, C6 department × grade), all driven by the
same filter bar at the top (date range, office, department, partner,
client group, staff category). Click any bar, heatmap cell, or bubble to
drill through to the underlying staff/allocation records. Every chart card
has two export buttons: the download icon exports a formatted `.xlsx`
(Indian number format, frozen header), the image icon exports the chart
itself as a `.png`.

## Report library (§11)

`/reports` — pick a report from the sidebar (RP-01 Deployment Register
through RP-09 Leave and Absence), set the shared filters at the top (date
range, office, department, partner, client group, staff category,
status), and the table updates. Every report has two export buttons:
Excel (formatted, Indian number grouping, frozen header) and PDF
(landscape, print-ready for a partner meeting). RP-03 (Staff Utilisation)
and RP-06 (Bench and Availability) read from the same materialised
`capacity_daily` table as `/api/v1/capacity/utilisation` — if you've just
run a bulk import that bypassed the normal allocation/leave routes, run
`POST /api/v1/capacity/recompute` first or these two reports may look
stale. RP-07 (Conflict and Exception Report) only shows allocations saved
with a recorded WARN override — nothing appears there until a scheduler
booking has actually gone through that flow.

## Nothing is ever hard-deleted (§0.1)

Every `DELETE` route soft-deletes (`is_active=false`, `deleted_at` set,
audit row written) and the record stays fully readable in a direct DB
query. Passing `?hard=true` to any `DELETE` route always returns `405` —
there is no code path that performs a real delete anywhere in the app.
