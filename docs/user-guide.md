# User Guide — current build (Phases P0–P11, spec complete)

This covers what's actually usable today: authentication, master data,
engagements, leave, the allocation/conflict-engine API (R1–R24), the
scheduler board, capacity utilisation, the C1–C6 dashboards, the
RP-01..RP-14 report library, independence declarations, resource requests,
best-effort email notifications (incl. a scheduled weekly digest),
timesheets with actuals and engagement margin, what-if scenario planning,
engagement roll-forward, a mobile self-service `/me` view with an ICS
calendar feed, and backup/restore. Every phase in the original P0–P11
roadmap is built — see the root `README.md` for the full history.

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

### GitHub Codespaces

`.devcontainer/` makes the repo runnable straight from GitHub with no local
setup: **Code → Codespaces → Create codespace on this branch**. On first
build, `.devcontainer/setup.sh` installs the backend venv + frontend
`node_modules` and seeds the full demo dataset (SQLite); `.devcontainer/start.sh`
then starts both dev servers bound to `0.0.0.0` (required for Codespaces'
port forwarding) every time the codespace starts or resumes — it's
idempotent, so reopening an existing codespace won't spawn duplicates.

Codespaces will pop up a notification once port **5173** is listening —
click "Open in Browser". You don't need port 8000 forwarded too unless you
want to hit the API directly (Swagger UI at `/docs`): the frontend's own
Vite dev server proxies `/api/*` to the backend over `localhost` *inside*
the container, so the single forwarded frontend URL serves the whole app,
API calls included — verified end to end while building this
(`curl` through the forwarded-equivalent port for `/api/v1/auth/login`
returned a real JWT). Logs for both servers, if something looks off:
`/tmp/firm-rms-logs/{backend,frontend}.log`.

### Windows desktop app

`desktop/` packages firm-rms as a normal Windows program — a double-click
`.exe`, no Python, Node, terminal, or Docker involved. Under the hood it's
still the same FastAPI backend and React frontend: `app.main` serves the
built frontend's static files itself when `RMS_STATIC_DIR` is set
(`desktop/launcher.py` does this), so the packaged app is one process on
one port instead of two dev servers.

**Getting the installer** (built on GitHub, since PyInstaller has to run on
the target OS — it can't cross-compile a Windows binary from Linux/macOS):
go to this repo's **Actions** tab → **"Build Windows desktop app"** → **Run
workflow**. When it finishes, open the run and download the `FirmRMS-Setup`
artifact (a zip containing `FirmRMS-Setup.exe`). Pushing a tag like `v1.0.0`
also attaches the installer to a GitHub Release, if you'd rather hand
people a direct download link than a workflow run.

**Installing and running it:** run `FirmRMS-Setup.exe`, accept the
defaults (Start Menu shortcut, optional desktop icon), then launch "Firm
RMS". A console window opens (that's the running server — closing it stops
the app) and your browser opens to `http://127.0.0.1:8000` automatically.
First launch creates the database and a default admin login
(`admin@firm.local` / `ChangeMe!2026`, forced password change) — the same
idempotent bootstrap Codespaces and docker-compose use, *not* the 300-person
demo dataset, since a firm install should start empty.

**Where your data lives:** a per-user SQLite database and a generated JWT
signing key, under `%LOCALAPPDATA%\FirmRMS\` — kept outside the (often
read-only) install folder under Program Files, and untouched by
reinstalling or upgrading the app. Uninstalling via "Add or Remove
Programs" removes the program files only; delete `%LOCALAPPDATA%\FirmRMS\`
yourself if you also want the data gone.

This is a single-user/single-machine packaging aimed at trying the tool out
or a very small firm — for a real multi-office, multi-user deployment use
the docker-compose (Postgres) setup instead, so everyone hits one shared
database over the network.

To build the installer yourself instead of via Actions, see the build
commands at the top of `desktop/firm_rms.spec` (PyInstaller) and
`desktop/installer.iss` (Inno Setup) — both require Windows.

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

## Staff &amp; clients — adding and importing (§10)

**`/masters`** (also linked as "Manage staff & clients" from the home
page) is the screen for this — add one record at a time via the form, or
import a spreadsheet in bulk. This exists purely as a frontend for the API
described below; ADMIN, HR and RESOURCE_MANAGER roles can use it (matches
`IMPORT_ROLES`/`WRITE_ROLES` on the backend).

The Add-staff form is: Designation (Partner/Senior Manager/Manager/
Executive/Article), Name, Employee code, Status (Active/Left), Work
location (Hyderabad/Bangalore/Mumbai/Chennai/Delhi), Date of joining — a
firm-specific subset of the fuller `Designation`/`StaffCategory` vocabulary
the backend still carries for everything else (reports, the conflict
engine). "Mark exited" on a staff row is the explicit admin action for
"this person resigned" (sets `employment_status=EXITED` + today's date);
there's deliberately no generic edit-status dropdown for this — it's a
one-way action, same as a real offboarding.

The Add-client form covers: Name, Entity type (Listed/Non-Listed —
`is_listed`), Nature (legal structure — `entity_class`, extended with
Section 8/Co-operative society/Sole proprietorship/Partnership/Others),
Type of engagement (`primary_service_type`), Status (Active/Inactive —
`relationship_status`), Partner responsible (a fixed list of named
partners — typing one that doesn't exist yet auto-creates that Staff
record as a PARTNER), Priority (`priority`), MNC status (`is_mnc`), Group
(free text — resolves/creates a `ClientGroup` by name), Firm (BCO/KSR —
`practicing_firm`), Nature of business (stored in the existing `sector`
field). `is_listed`/`priority`/`is_mnc`/`practicing_firm`/
`primary_service_type` were added to the `clients` table for this — see
`alembic/versions/0003_client_masters_fields.py`. Existing SQLite
databases (the desktop app, a bare local dev checkout — anything that
doesn't run `alembic upgrade head` the way docker-compose does) pick up
new columns like these automatically on next start via a small self-heal
in `app.db.session.init_db()`, since `create_all()` alone never alters an
already-existing table.

**A client with several services at once** (e.g. Limited review +
Statutory audit + Tax audit + Consultancy) isn't a case for the Add-client
form's "Type of engagement" field — that field is `primary_service_type`,
a single summary value. Each real service a client receives is its own
`Engagement` record instead (the entity bookings, timesheets and billing
actually attach to), and a client can have any number of them. An
"Engagements" button on each row of the clients table opens a checklist of
the same service-type vocabulary as "Type of engagement"; ticking one
creates the `Engagement` — auto-resolving/creating its Department (Audit,
Tax, Indirect Tax, Advisory, ...) by service type, auto-generating an
`engagement_code` (`{client_code}-{service abbreviation}-{financial
year}`), and defaulting to the current Indian financial year (April–March).
Already-added services show ticked and can't be unticked here, since a
booking or timesheet may already exist against that engagement by the time
you'd want to remove it. No backend changes were needed for this — it's a
frontend screen (`ClientEngagementsPanel` in `frontend/src/pages/Masters.tsx`,
resolvers in `frontend/src/lib/mastersApi.ts`) over the pre-existing
`POST /api/v1/engagements` and `GET/POST /api/v1/departments` endpoints.

**"Download staff/clients template (.xlsx)"** in each import panel is the
easiest way to get a file in the right shape — it's generated on the fly
(`GET /api/v1/admin/import/{staff|clients}/template`,
`app.importers.templates`), blank apart from one greyed-out example row,
with the same dropdown choices as the Add-one form (Designation, Work
location, Nature, Partner responsible, ...). Fill it in and upload it
straight back through the same panel.

The importers, the downloadable template, and the Add-one form's dropdown
options all come from one place — `app.importers.friendly_values` — so a
value typed into any of the three always means the same thing to the
other two. Work location / Partner responsible / Group all resolve
case-insensitively to an existing Office/Staff/ClientGroup record, or
create one on first use (`app.importers.resolvers`), exactly like the
Add-one form's own resolvers in `frontend/src/lib/mastersApi.ts` — so a
freshly-typed office city or a new partner's name in row 1 of your
spreadsheet works without setting anything up first.

`backend/seed/sample_masters.xlsx` is a separate thing: pre-filled demo
data (300 staff / 200 client rows, same column format as the template
above) for trying the tool out, not something you'd fill in yourself.
Regenerate it with `python -m seed.generate_sample_workbook`.
`read_workbook_rows` looks for a sheet named "staff"/"clients" first and
falls back to the first sheet otherwise, so a plain single-sheet export
(the common real-world case, including the downloadable template above)
works too — only this named-sheet demo file needs the lookup at all.

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

## Manpower Allocation tab

`/allocation-board` (from the dashboard's "Manpower allocation" tile) is a
second, simpler way to create the same `Allocation` rows the scheduler
board does — built for staffing a job off a booking already received or
off an oral discussion, rather than dragging bars on a calendar. Every
staff member except partners appears as a roster row (search by name/code,
filter to Articles-only or non-article staff); each row lists its current
bookings as removable chips — client, date range, an "oral" badge when the
booking is tentative — and a "+ Add booking" form: client + assignment
(service type) picked from the masters, date range, basis (**Booking
received** → `booking_type=HARD`, **Oral discussion** → `SOFT`), partner
(required select — every booking made here must name the partner
responsible) and manager (optional select), and a remarks field
(`allocations.notes`).

The client + assignment dropdown resolves to an `Engagement` the same way
the per-client Engagements checklist does (reusing an existing one for
that client/service if there is one, creating it against the current
financial year otherwise) — so this tab and the Masters page's Engagements
panel never create duplicate engagements for the same client/service.

**Concurrent-client cap (R25 `CONCURRENT_CLIENT_CAP`)**: an article can be
on at most 3 clients at once, any other non-partner staff member at most
4 (partners are exempt) — counting distinct clients with overlapping
dates, not distinct engagements, so a client's several services (see
"Multiple services per client" below) still count as one. The "+ Add
booking" button disables itself once a row is at its cap; the same rule
also runs server-side in `validate_allocation()`, so it can't be bypassed
by calling the API directly — it applies to the scheduler board's bookings
too. The two caps are tunable via `app_config`
(`max_concurrent_clients_article` / `max_concurrent_clients_ca`), same as
every other rule threshold (see `docs/business-rules.md`).

The right-hand **client-wise summary** panel rolls up every active
booking by client: how many staff are on it, total calendar days across
their date ranges, and total hours assuming an 8-hour day
(`hours = days × 8`).

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

## What-if scenario planning (§8)

`/api/v1/scenarios` — create a named sandbox (`name`, `date_from`,
`date_to`), then add lines (`POST .../lines`: staff, engagement, role,
dates, %) without booking anything real. `GET .../impact` runs the real
conflict engine (R1–R24) against each line — since lines reference real
staff/engagements, the check is exact, not a guess — plus a check across
the scenario's *own* lines for a staff member (`SCENARIO_OVERALLOCATION`,
since committed-data checks can't see sibling scenario lines), and a
per-staff utilisation delta (current, from `capacity_daily`, vs.
projected). `POST .../promote` writes real `DRAFT` allocations for every
line with zero BLOCK/WARN violations (INFO doesn't block promotion) and
reports which lines it skipped and why — nothing is ever silently forced
through. A promoted or discarded scenario can't be edited further.

## Engagement roll-forward (§8/§9)

`POST /api/v1/engagements/{id}/roll-forward` (Admin/RM/Partner) —
`{"new_engagement_code": "...", "new_financial_year": null, "date_shift_years": 1, "copy_team": true}`.
Creates next year's engagement (client/department/service/team/budget
copied; fee, OOP budget, billing milestones, UDIN and report-signed date
reset for renegotiation; `prior_year_engagement_id` set), then copies the
source engagement's CONFIRMED/IN_PROGRESS/COMPLETED team as `DRAFT`
allocations shifted a year. Each line is checked through the real conflict
engine first — a line with any BLOCK or WARN is skipped and reported with
its reasons (in the response's `skipped` list) rather than silently
carried forward with a real conflict baked in.

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
RP-11 Timesheet Summary, RP-12 Capacity Forecast, RP-13 Independence and
Rotation, and RP-14 Bench and Burnout Watchlist), set the shared filters
at the top (date range, office, department, partner, client group, staff
category, status), and the table updates. Every report has two export
buttons: Excel (formatted, Indian number grouping, frozen header) and PDF
(landscape, print-ready for a partner meeting). RP-03 (Staff Utilisation)
and RP-06 (Bench and Availability) read from the same materialised
`capacity_daily` table as `/api/v1/capacity/utilisation` — if you've just
run a bulk import that bypassed the normal allocation/leave routes, run
`POST /api/v1/capacity/recompute` first or these two reports (and RP-12,
RP-14, which read the same table) may look stale or empty for a future
window. RP-07 (Conflict and Exception Report) only shows allocations
saved with a recorded WARN override — nothing appears there until a
scheduler booking has actually gone through that flow. RP-13
(Independence and Rotation) is point-in-time, not date-ranged — it lists
every active engagement's EP, EP tenure, rotation-due FY, EQCR, open
independence conflicts and declaration status regardless of the date
filter (accepted for consistency with the rest of the library, just not
applied). RP-10 (Engagement Profitability) is the same way — fee and
margin are to-date figures, not a period slice — while RP-11 (Timesheet
Summary) genuinely is date-ranged. Both RP-10 and RP-11 only count
`APPROVED` timesheet hours; log time and get it approved (see above)
before expecting either to show anything. RP-12 (Capacity Forecast) is a
monthly office/department utilisation trend — it's only as far forward as
`capacity_daily` has actually been materialised (the nightly job keeps a
rolling 180-day-forward window; further out reads as empty, not zero
demand). RP-14 (Bench and Burnout Watchlist) lists staff *currently* on
bench (`>= bench_days` consecutive working days ending at the report's
`date_to`) or in a sustained-overload streak (`>= burnout_weeks`
consecutive weeks at >=90% utilisation, mirroring R15) — a trailing
streak, not the longest one anywhere in the window.

## Notifications (§9)

Confirming a booking (`POST /allocations/{id}/approve`) or cancelling one
(`DELETE /allocations/{id}`) sends a best-effort email to the booked staff
member. It's a no-op unless `RMS_SMTP_HOST` is set in the backend's `.env`
— nothing to configure for local/dev use, and a down or unconfigured mail
server never blocks the booking itself (the send happens after the write
has already committed, and any failure is logged, not raised). A second,
independent scheduled job sends each staff member (with an email on file
and at least one confirmed booking that week) a digest of their upcoming
week's bookings every Monday at 07:00 IST — same no-op-if-unconfigured
behaviour, and it skips anyone with nothing booked rather than emailing an
empty digest.

## Mobile self-service — /me (§10.2)

`/me` — a single-column, phone-width page: your own profile, leave
balance for the current financial year (1 Apr–31 Mar), upcoming bookings
(next 60 days), and timesheet entries from the last 30 days. Nothing here
is editable — booking/leave/timesheet actions still go through the
scheduler, leave and timesheet APIs; this is a read-only "what's coming
up" view. The underlying API (`GET /api/v1/me`, `/me/allocations`,
`/me/leave-balance`, `/me/timesheets`) is scoped to whoever's logged in —
there's no way to ask it for anyone else's data. A login with no linked
staff record (a pure admin/system account) sees a short "nothing to show"
message instead.

"Download .ics" on the bookings card pulls a calendar file
(`GET /me/calendar.ics`, ±30 days/1 year of the booking window) you can
import into any calendar app. It's authenticated the same way as the rest
of the API, which means an actual calendar app's "subscribe by URL"
feature can't pull it directly (those don't send a login token) — treat
it as a one-time export for now, not a live-syncing subscription.

## Backup and restore

`backend/scripts/backup.sh` / `restore.sh` — auto-detect Postgres vs.
SQLite from `RMS_DATABASE_URL` (reads `backend/.env` if present).

```bash
cd backend
./scripts/backup.sh                    # writes backups/firm_rms_<timestamp>.{dump,db}
./scripts/restore.sh backups/firm_rms_20260101T000000Z.dump [--yes]
```

Postgres uses `pg_dump --format=custom` / `pg_restore --clean --if-exists`
against whatever `RMS_DATABASE_URL` points at (the docker-compose `db`
service by default) — restoring **overwrites the target database**, which
is why it prompts for confirmation unless you pass `--yes` (for a
scripted drill or CI). SQLite is a plain file copy; restoring moves the
existing `.db` file aside with a `.bak-<timestamp>` suffix first rather
than deleting it. `backup.sh` keeps the last 30 backups in its output
directory and prunes older ones, and verifies the backup it just wrote is
actually readable before finishing (`pg_restore --list` / a SQLite
integrity check).

Both paths were actually drilled while building this, not just written:
seed the full 300-staff dataset, back it up, destroy the live data
(`TRUNCATE ... CASCADE` for Postgres, deleting the file for SQLite),
restore, and confirm every table's row count matches — see
`docs/decisions.md` for the exact numbers and a bug the drill caught.

## Nothing is ever hard-deleted (§0.1)

Every `DELETE` route soft-deletes (`is_active=false`, `deleted_at` set,
audit row written) and the record stays fully readable in a direct DB
query. Passing `?hard=true` to any `DELETE` route always returns `405` —
there is no code path that performs a real delete anywhere in the app.
