# User Guide — current build (Phases P0–P3)

This covers what's actually usable today: authentication, master data,
engagements, leave, and the allocation/conflict-engine API. The scheduler
board, dashboards and report library (§6, §7, §11) are not built yet — see
the root `README.md` for the phase roadmap.

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

## Nothing is ever hard-deleted (§0.1)

Every `DELETE` route soft-deletes (`is_active=false`, `deleted_at` set,
audit row written) and the record stays fully readable in a direct DB
query. Passing `?hard=true` to any `DELETE` route always returns `405` —
there is no code path that performs a real delete anywhere in the app.
