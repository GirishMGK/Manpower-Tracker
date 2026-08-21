# User Guide — current build (Phases P0–P9)

This covers what's actually usable today: authentication, master data,
engagements, leave, the allocation/conflict-engine API (R1–R24), the
scheduler board, capacity utilisation, the C1–C6 dashboards, the
RP-01..RP-11 + RP-13 report library, independence declarations, resource
requests, best-effort email notifications, and timesheets with actuals and
engagement margin. Forecasting is not built yet — see the root `README.md`
for the phase roadmap.

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

`POST /api/v1/allocations/validate` runs the full R1–R24 rule set against
a proposed booking and returns violations without saving — this is what
the scheduler board calls on every drag/drop/create. Each violation has a
`severity` (`BLOCK`/`WARN`/`INFO`), and `overridable` + `override_role`
tell you whether/how it can be pushed through. The `BookingForm` renders
all three: red for BLOCK (save disabled), amber for WARN (an override
reason input appears per rule; save enables once every WARN has one), and
blue for INFO (shown, never blocks).

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

## Independence declarations (§3.12, §4, §9.4)

`/api/v1/independence-declarations` — Admin/RM/Partner/Manager/HR can
record a declaration (`POST`, staff + client + the threat checkboxes from
§3.12). It's created with `is_conflicted=false` regardless of what's
ticked; only a reviewer (Admin/Partner/HR) can set the final determination
via `POST .../{id}/review`, which stamps `reviewed_by`. R5
(`INDEPENDENCE_CONFLICT`) and R24 (`COOLING_OFF`) both read this table
directly, so a reviewed conflict starts blocking/warning on new bookings
immediately.

## Resource requests (§3.13, §9.1)

`/api/v1/resource-requests` — Admin/RM/Partner/Manager can raise a request
against an engagement (grade, skills, office, dates, headcount). Link it
to actual bookings with `POST .../{id}/fulfil` (`{"allocation_id": "..."}`,
the allocation must belong to the same engagement); `status` moves
OPEN → PARTIALLY_FILLED → FILLED automatically as fulfilments accumulate
— there's no separate "mark filled" action, so status can't drift from
what's actually booked. `POST .../{id}/reject` closes a request that
won't be filled.

## Timesheets, actuals and margin (§9)

`/api/v1/timesheets` — log time against an engagement (`staff_id`,
`engagement_id`, `work_date`, `hours`, `is_chargeable`, optional
`allocation_id`/`activity_code`/`narration`). New entries start `DRAFT`
and are only editable in that state. `POST .../{id}/submit` moves to
`SUBMITTED`; an approver (Admin/RM/Partner/Manager) then
`POST .../{id}/approve` or `.../reject`. Staff and Manager logins can only
act on their own timesheet rows (matched against their linked
`staff_id`) — Admin/RM/Partner/HR can log or edit on anyone's behalf.
Nothing counts as an actual until it's `APPROVED`: `DRAFT`/`SUBMITTED`/
`REJECTED` hours don't feed margin, RP-10, or RP-11's approved-hours
columns.

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
through RP-09 Leave and Absence, plus RP-10 Engagement Profitability,
RP-11 Timesheet Summary and RP-13 Independence and Rotation), set the
shared filters at the top (date range, office, department, partner,
client group, staff category, status), and the table updates. Every
report has two export buttons: Excel (formatted, Indian number grouping,
frozen header) and PDF (landscape, print-ready for a partner meeting).
RP-03 (Staff Utilisation) and RP-06 (Bench and Availability) read from the
same materialised `capacity_daily` table as `/api/v1/capacity/utilisation`
— if you've just run a bulk import that bypassed the normal
allocation/leave routes, run `POST /api/v1/capacity/recompute` first or
these two reports may look stale. RP-07 (Conflict and Exception Report)
only shows allocations saved with a recorded WARN override — nothing
appears there until a scheduler booking has actually gone through that
flow. RP-13 (Independence and Rotation) is point-in-time, not date-ranged
— it lists every active engagement's EP, EP tenure, rotation-due FY,
EQCR, open independence conflicts and declaration status regardless of
the date filter (accepted for consistency with the rest of the library,
just not applied). RP-10 (Engagement Profitability) is the same way —
fee and margin are to-date figures, not a period slice — while RP-11
(Timesheet Summary) genuinely is date-ranged. Both RP-10 and RP-11 only
count `APPROVED` timesheet hours; log time and get it approved
(see above) before expecting either to show anything.

## Notifications (§9)

Confirming a booking (`POST /allocations/{id}/approve`) or cancelling one
(`DELETE /allocations/{id}`) sends a best-effort email to the booked staff
member. It's a no-op unless `RMS_SMTP_HOST` is set in the backend's `.env`
— nothing to configure for local/dev use, and a down or unconfigured mail
server never blocks the booking itself (the send happens after the write
has already committed, and any failure is logged, not raised).

## Nothing is ever hard-deleted (§0.1)

Every `DELETE` route soft-deletes (`is_active=false`, `deleted_at` set,
audit row written) and the record stays fully readable in a direct DB
query. Passing `?hard=true` to any `DELETE` route always returns `405` —
there is no code path that performs a real delete anywhere in the app.
