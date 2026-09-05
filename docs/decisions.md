# Decisions & Assumptions

§16 of the build prompt asks 8 firm-specific questions before starting.
Given the scale of this build (11 phases) and that the spec itself already
gives concrete defaults for every one of them, the build proceeded using
those defaults — recorded here — rather than blocking on firm-specific
answers. **All of these are editable** (via `app_config`, the `grades`
table, or a config file) without a code change; treat this page as the
starting position to correct once the firm's actuals are known.

## 1. Designation ladder / grade ranks / target pyramid

Used the ladder exactly as listed in §3.6 (`Designation` enum), with
`grade_rank` 1 (Managing Partner) through 12 (Article Year 1) assigned per
the ordering implied there — see `app/models/enums.py::DESIGNATION_GRADE_RANK`.
No target pyramid per office was specified; none is enforced yet (a future
report, not a blocking rule).

## 2. Chargeability targets by grade

Seeded from the examples explicitly given in §5 ("partner 45, manager 75,
article 90") and extrapolated sensibly for the ranks in between — see
`DEFAULT_CHARGEABILITY_TARGET_PCT` in `app/models/enums.py`, materialised
into the `grades` reference table on seed. "Chargeable" = `is_chargeable`
flag on the allocation/timesheet line, keyed off `activity_codes.is_chargeable`.

## 3. Cost rates: per-person or per-grade, and visibility

Modelled per-person (`staff.cost_rate_per_hour`, `staff.bill_rate_per_hour`)
as §3.6 specifies, with a per-grade *default* on the `grades` table for
staff where an individual rate hasn't been set. Visibility: masked (returned
as `null`, not a 403) for `MANAGER`, `STAFF`, `HR`, `VIEWER` — exactly the
column-level masking §2 describes — visible to `ADMIN`, `RESOURCE_MANAGER`,
`PARTNER`.

## 4. ICAI Reg. 43 article entitlement position

No firm-specific current entitlement position was available. Used the
figures given directly in §4 (R13): secondment cap of 2 per principal,
aggregate secondment ≤ 12 months. Both are `app_config` rows
(`article_secondment_cap`, `article_secondment_months_cap`), editable
without a redeploy. R13 (implemented in Phase P8) approximates this
against `SECONDMENT`-type `non_availability` rows, since the schema has no
dedicated secondment record — see the P8 entry below.

## 5. Timesheets — existing system / historical import

No existing timesheet system was named. Timesheets were built fresh in
Phase P9 (`/api/v1/timesheets`, DRAFT→SUBMITTED→APPROVED/REJECTED). No
historical-backfill import endpoint exists yet — a §15
`/api/v1/integrations/...` seam for that remains a gap, not something P9
needed to close, since there's no existing system named to import from.

## 6. Authoritative source of client/engagement master today

Assumed Excel is the current system of record (§0.3 "Excel in, Excel out"
is a non-negotiable design principle), and that this RMS becomes the new
system of record once cut over. The importer is built idempotent
(re-import updates rather than duplicates, keyed on `client_code` /
`employee_code`) specifically so a transition period of "Excel is still
being edited too" doesn't corrupt data.

## 7. Deployment target and DR expectation

The stack (§1) is fixed to Docker Compose specifically to keep the
deployment single-box and portable across on-premise, Azure India, or a
hybrid setup — no code decision here favours one over the others. Backup/DR
is delivered in Phase P11: `backend/scripts/backup.sh`/`restore.sh`
(§14 mentions this as an implicit expectation via "audit_log retention ≥ 8
years") — see the P11 section below for what was actually drilled and
verified, not just written.

## 8. Google Workspace SSO availability

Built JWT auth (email + password, bcrypt via passlib) as the guaranteed
path per §1, with Google OAuth config fields present but unused
(`RMS_GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` in `.env.example`) — wiring the
actual OAuth flow is deferred until confirmed available, since building it
against a guess of tenant/consent-screen configuration would likely need
rework anyway.

---

## Other decisions made without an explicit spec answer

- **A `users` table was added** (not in §3) to separate login credentials
  from the HR roster record (`staff`). `users.staff_id` links the two
  (nullable, so pure system/admin accounts can exist without a roster
  entry). Rationale: the spec's RBAC roles (§2) are login-time concepts;
  putting `hashed_password`/`role` on `staff` would conflate "is on the
  roster" with "can log in", and would force every contractor/support
  person to get a login.
- **`staff.notice_period_end`** was added (not explicitly in §3.6) because
  R21 (`EXITING_STAFF`, "booked past 80% of notice period") needs a
  concrete end date to compute against; `date_of_exit` alone doesn't
  distinguish "exited" from "serving notice."
- **Hard-delete semantics for T16**: every DELETE route accepts an
  optional `?hard=true` query flag that always 405s — there is no route
  that can perform a real hard delete. The bare `DELETE` (no flag)
  soft-deletes. See `app/core/soft_delete.py`.
- **Login email validation uses a plain syntactic regex, not pydantic's
  `EmailStr`.** `email-validator` (which backs `EmailStr`) rejects
  "special-use or reserved" TLDs — `.local`, `.test`, `.internal` — by
  default. That's exactly what an on-premise firm's internal mail domain
  looks like (§0.4), and login is an internal identifier, not something
  we're checking deliverability for. Found via manual browser testing
  against the seed data's `@firm.local` demo accounts (P4 verification);
  regression-tested in `tests/test_auth.py`.
- **The Postgres `EXCLUDE` constraint** (§3.8) only guards the exact case
  it can express — two 100%, CONFIRMED/IN_PROGRESS bookings overlapping.
  Partial-percentage overlaps (two 50% bookings, a 50%+60%, etc.) are
  arithmetic sums across an arbitrary number of rows, which `EXCLUDE`
  cannot express — that direction of R1 is enforced in
  `app/services/conflict_engine.py` at the service layer, which every
  write path (including `/allocations/validate`) goes through.
- **`seed.seed_data.seed()` doesn't materialise `capacity_daily` by
  default.** It inserts allocations directly via `session.add()` for
  speed, bypassing the synchronous invalidation hook that lives in the
  allocation/leave routers (§5) — so RP-03/RP-06 and anything else reading
  `capacity_daily` would see an empty table after a fresh seed otherwise.
  Found via live Playwright verification of the report library (P7):
  RP-03 returned 300 correct rows when queried directly against the
  service function and via `curl`, but 0 through a from-scratch seeded
  dev instance. `seed()` now takes an optional `capacity_window` the CLI
  entrypoint passes (a 180-day window around "today" — materialising the
  full ~2-year span the seeded engagement dates can land in took over a
  minute, too slow to have every test that calls `seed()` pay for it).
- **Report tables never show a bare `*_id` in the UI.** Every RP function
  returns a raw id (`staff_id`, `engagement_id`, ...) paired with a
  human-readable field (`full_name`, `engagement_code`, ...) for API/
  drill-through use; the frontend's generic `ReportTable` filters out any
  `*_id`-suffixed key before rendering columns. Caught two real gaps this
  way during P7 verification — RP-03 showed a raw `staff_id` column (no
  full_name pairing issue, just an unfiltered display) and RP-07 returned
  bare `engagement_id` with *no* readable pairing at all — fixed by
  joining Engagement/Client into RP-07's rows.

## Phase P8 — rule approximations against the existing schema

Several of R10–R24 target a concept the spec names but the schema (fixed
by §3, not renegotiated mid-build) doesn't store as a distinct field.
Each is a deliberate, documented approximation rather than a schema
change, and each is called out in the matching row of
`docs/business-rules.md`:

- **R13 `ICAI_TRAINING_LIMIT`** — there's no dedicated secondment table.
  Approximated against `non_availability` rows of `type=SECONDMENT`:
  aggregate approved days (÷30) against `article_secondment_months_cap`,
  and a same-principal sibling count (via `staff.articleship_principal_id`
  + `secondment_flag`) against `article_secondment_cap`.
- **R21 `EXITING_STAFF`** ("booked past 80% of notice period") — the
  schema has `staff.notice_period_end` but no `notice_start`. Approximated
  against a standard 30-day notice length counted back from
  `notice_period_end` (`STANDARD_NOTICE_PERIOD_DAYS` in
  `conflict_engine.py`), not the staff member's actual contractual notice
  length. Revisit if/when a real `notice_start` field is added.
- **R24 `COOLING_OFF`** — `independence_declarations.held_employment_last_2yrs`
  is a boolean, not a date the employment ended, so the check is
  presence-based (any active declaration with the flag set) rather than
  computing days remaining in the `cooling_off_months` window.
- **R18 `BUDGET_OVERRUN`** — no per-allocation actual-hours figure exists
  pre-timesheets (P9), so projected cost is estimated at 8 hrs/business-day
  × `allocation_pct` × `staff.cost_rate_per_hour`, compared against
  `engagement.fee_amount` via the `max_cost_ratio` config. Once P9 lands
  actual timesheet hours, this should switch to actuals-to-date plus
  forecast-remaining rather than a pure allocation-based estimate.
- **R16/R17 `OUTSTATION_BREACH`/`LOCATION_MISMATCH`** need `office_id` on
  the candidate booking. The conflict engine and `/allocations` API both
  accept and check it, but the scheduler UI (P4) doesn't collect an office
  per booking yet — so these two rules are fully exercised by the API/
  import paths and unit tests, but won't fire from a scheduler drag/drop
  until office selection is added to `BookingForm`.
- **The scheduler's booking form dropped INFO-severity violations
  entirely** (only BLOCK/WARN had a render branch) until this phase —
  found via live Playwright verification of R10/R22 together (a
  PIPELINE-status test engagement surfaced both an EQCR_MISSING WARN and
  an UNAPPROVED_PIPELINE INFO in the same check). Fixed by adding a third,
  non-blocking INFO panel to `BookingForm.tsx`.
- **`independence_declarations.is_conflicted` is reviewer-set, not
  self-declared.** `POST /independence-declarations` always creates with
  `is_conflicted=false` regardless of the threat flags submitted; only
  `POST .../{id}/review` (Admin/Partner/HR) can flip it, so there's always
  a named reviewer of record for R5's BLOCK to point back to — matching
  the audit-evidence posture of the rest of this build (§0.1).
- **Resource request status is derived, not settable.** `status` on
  `resource_requests` is computed from
  `len(fulfilment_allocation_ids) vs. headcount` inside `/fulfil` — there's
  no direct "set status" endpoint, so the field can't drift from what's
  actually been booked against the request.

## Phase P9 — timesheets, actuals, margin

- **RP-10/RP-11 titles and column sets were designed, not transcribed.**
  This session's retained context carries §11's exact definitions for
  RP-01..RP-09 and (from the P8 turn) RP-13, but not the original text for
  RP-10 through RP-12 or RP-14 through RP-17. Rather than guess at a
  numbering/title that might collide with what the spec actually says,
  RP-10 (Engagement Profitability) and RP-11 (Timesheet Summary) were
  scoped directly from the P9 deliverable description ("timesheets,
  actuals, margin") and built to fit the existing report-library shape
  (`ReportFilters`, the same Excel/PDF export builders). If the original
  §11 text for this range surfaces later and disagrees, treat these two as
  provisional and reconcile the column list/title, not the underlying
  `engagement_margin`/`timesheet_summary` computation.
- **Only APPROVED timesheets count as actuals**, anywhere (`actuals.py`,
  RP-10, RP-11's `chargeable_hours_approved`). A DRAFT or SUBMITTED entry
  is work in progress, not evidence — same posture as the WARN-override
  audit trail (§4) and the reviewer-gated independence declarations (P8).
- **RP-10 (Engagement Profitability) doesn't apply the report's date
  filter**, matching RP-13's precedent: `fee_amount` and
  `out_of_pocket_budget` are whole-engagement figures, so computing a
  margin against a date-sliced actual-cost figure would misstate
  `margin_pct` for anything short of the engagement's full life. It's a
  to-date figure, always. RP-11 (Timesheet Summary) *is* date-ranged,
  since a timesheet total is genuinely a period metric.
- **No actual out-of-pocket expense tracking exists.** `engagement_margin`
  subtracts `out_of_pocket_budget` (the planned figure, §3.5) rather than
  an actual OOP spend, since no table captures actual OOP transactions.
  This is a conservative proxy, not a real actuals figure — margin will
  read low if actual OOP came in under budget, and high if it came in
  over. Revisit once/if OOP expense tracking is added.
- **R18 `BUDGET_OVERRUN` was deliberately left as its P8 estimate**, not
  switched to read actual timesheet cost now that P9 makes that possible.
  `check_budget_overrun` scopes its projected-cost sum to allocations
  overlapping the *candidate's own date window* on the engagement, not the
  engagement's full life; naively adding engagement-wide actual cost
  on top would double-count days that are both already logged as an
  actual and still inside the projected window. Doing this properly needs
  actual-cost-to-date scoped to *before* the candidate's window plus a
  projected estimate for the window itself and beyond — deferred rather
  than shipped half-integrated with a real double-counting risk.
- **Timesheet RBAC is finer-grained than a flat role list** (§2's 3-layer
  model, layer 2): `STAFF`/`MANAGER` can only create, edit or submit their
  own `Timesheet.staff_id` (matched against `User.staff_id`); a `MANAGER`
  or `STAFF` login with no linked `staff_id` can't log time at all, by
  construction. `ADMIN`/`RESOURCE_MANAGER`/`PARTNER`/`HR` can act for
  anyone. Approve/reject is a separate check
  (`ADMIN`/`RESOURCE_MANAGER`/`PARTNER`/`MANAGER`) so a `STAFF` login can
  never approve their own submitted hours, including via the generic
  update path (blocked separately by the DRAFT-only edit rule).

## Phase P10 — forecasting, scenarios, roll-forward, bench/burnout watchlist

- **`scenarios`/`scenario_allocations` are new tables**, the same
  "add a table when a later spec section needs one" precedent as
  `capacity_daily` (P5) — §8 names scenario planning but §3's table list
  doesn't include it. No new Alembic migration was written, also matching
  `capacity_daily`'s precedent: the model is registered in
  `app/db/base.py`, so a *fresh* install picks it up automatically via
  migration `0001`'s dynamic `metadata.create_all()`. An already-deployed
  instance that has only run `0001`+`0002` would need a hand-written
  incremental migration before upgrading — a known limitation of this
  single-box/demo-oriented build, not something P10 newly introduced.
- **Scenario promotion is INFO-tolerant, BLOCK/WARN-strict.** A scenario
  line promotes only if it has zero BLOCK or WARN violations; a pure INFO
  violation (e.g. `UNAPPROVED_PIPELINE` on a PIPELINE-status engagement)
  does not block promotion, matching §4's own INFO semantics ("always
  safe to save"). Caught by an early version of this code being *too*
  strict — a test with a freshly-created (therefore PIPELINE-status)
  engagement failed to promote a conflict-free line purely because of the
  INFO row; fixed by checking `severity in ("BLOCK", "WARN")` rather than
  "any violations at all."
- **Roll-forward validates each copied line as if it were CONFIRMED, but
  writes it as DRAFT.** R1 `OVERALLOCATION` (and nothing else) is gated to
  only fire for CONFIRMED/IN_PROGRESS candidates by original P3 design —
  reasonable for the live scheduler (draft ideas shouldn't block each
  other), wrong for a bulk copy meant to surface real conflicts up front.
  Found via a test that booked a real overlapping CONFIRMED allocation in
  the shifted window and expected the roll-forward to skip that line; it
  didn't, because the candidate's status defaulted to DRAFT. Fixed by
  building the conflict-check candidate with `status=CONFIRMED` while the
  row actually written stays `status=DRAFT` — check as it will eventually
  be used, save as what it actually is.
- **A real SQLAlchemy footgun**: after `db.commit()`, every object in that
  `Session` is expired (SQLAlchemy's `expire_on_commit=True` default) —
  the *next* attribute access re-triggers a SELECT and works fine, but
  only through paths that access attributes one at a time (e.g. FastAPI's
  automatic `response_model` serialization via `model_validate(obj,
  from_attributes=True)`, or an explicit `db.refresh()`). Calling
  `SomeSQLModel.model_dump()` directly on an object that's expired but not
  refreshed returns an **empty dict**, not a lazy-loaded one. Roll-forward
  hit this for real: `recompute_range()` (§5's capacity-invalidation path)
  commits internally, which re-expired the just-built `Engagement` even
  though it had already been `db.refresh()`-ed once earlier in the same
  function — the *earlier* refresh doesn't protect against a *later*
  commit. Fixed by moving the roll-forward's final `db.refresh()` to
  strictly after the last commit in the function (i.e., after
  `recompute_range`, not before it) rather than assuming one refresh call
  covers the rest of the function. Worth checking for the same ordering
  bug anywhere else a function refreshes an object and *then* calls
  something that commits again before returning it.
- **RP-12/RP-14 continue RP-10/RP-11's precedent**: no verbatim §11 text
  for this numbering range was retained in this session's context, so
  both are scoped and named from the P10 deliverable description rather
  than transcribed. Reconcile against the real §11 definitions if they
  surface later, the same caveat as RP-10/RP-11.
- **RP-12's month bucketing is done in Python, not SQL `GROUP BY`**,
  specifically to stay portable: `strftime`-style month extraction isn't
  portable between SQLite and Postgres (the dual dev/prod target, §1), and
  the codebase has no existing portable-date-truncation helper to reach
  for. `capacity_report.get_staff_utilisation`'s SQL-level `GROUP BY` for
  per-staff totals is a different, still-fine pattern (no date truncation
  involved there) — RP-12 isn't a wholesale departure from that style, just
  avoiding the one part of it that isn't cross-dialect-safe.
- **RP-14 reports the trailing streak, not the longest streak in the
  window.** "Bench and burnout watchlist" is meant to answer "who needs
  attention right now," not "who was ever benched/overloaded this
  quarter" — so both BENCH and BURNOUT rows count consecutive days/weeks
  counting backward from the report's `date_to`, stopping at the first
  non-qualifying day/week.

## Phase P11 — mobile /me, ICS feed, scheduled emails, backup/restore

- **`/me/calendar.ics` is JWT-authenticated like the rest of the API,
  which real calendar apps can't satisfy.** Google/Apple/Outlook Calendar
  "subscribe by URL" sends no Bearer header — a production deployment
  would need a separate long-lived per-user feed token issued specifically
  for this one endpoint (a `?token=` query param checked against a stored
  secret, not the session JWT). Out of scope here: building that token
  scheme without a concrete auth requirement to build it against would be
  guessing. The endpoint today is meant to be pulled by something that
  *can* attach a header — the `/me` page's own download button, a script,
  `curl` — not subscribed to directly from a calendar app yet.
- **A real, live-verified bug**: `(str, Enum)` mixins (every enum column
  in this app) format as `"ClassName.MEMBER"` in an f-string on Python
  < 3.12 — a well-known gotcha, and one the codebase had quietly avoided
  until now because every other place that touches these fields either
  goes through a pydantic response model (which serializes them correctly
  via its own machinery) or a SQL `WHERE` clause (which compares by value,
  not string form). `app/services/ics_export.py`'s plain-text
  SUMMARY/DESCRIPTION and `app/services/digest.py`'s plain-text email body
  are the first places in the whole build to format these fields as raw
  text — found by actually reading the `.ics` output of a live curl
  request (`AllocationRole.FIELD_INCHARGE` instead of `FIELD_INCHARGE`),
  not by unit tests, which happened not to exercise a code path where the
  gotcha bit (test fixtures' freshly-constructed rows vs. a live server's
  round-tripped-through-SQLite rows apparently differ in exactly whether
  the ORM hands back the enum member or the raw string). Fixed with a
  `_plain()` helper in `me_service.py` that unwraps `.value` explicitly,
  applied at the one place (`MeAllocationRow` construction) both the ICS
  feed and the digest email read from — not patched separately in each
  consumer.
- **The `/me` page shows the staff roster record's name, not the login's
  own `full_name`.** Found via the live Playwright screenshot: the seeded
  demo logins set `User.full_name` to the email's local part (`"e0001"`,
  from `seed_data.py`), which is a login-identity artifact, not a person's
  name — the roster (`staff.full_name`, `"Aarav Roy"`) is the real
  identity for a self-service view. Fixed by preferring
  `profile.staff.full_name` in the frontend, falling back to
  `profile.full_name` only for a system/admin login with no linked staff
  record.
- **Backup/restore was actually drilled, not just scripted.** Both paths
  in `backend/scripts/backup.sh`/`restore.sh` were run for real in this
  build's sandbox: a genuine local Postgres 16 instance (seeded with the
  full 300-staff/200-client/380-engagement dataset, 800 allocations),
  `pg_dump`'d, the database `TRUNCATE`'d to simulate real data loss, then
  `pg_restore`'d back — every table's row count matched the pre-loss
  baseline exactly. The SQLite dev path got the same drill (seed → backup
  → delete the `.db` file entirely → restore → row counts matched). The
  SQLite integrity-check step in `backup.sh` originally shelled out to the
  `sqlite3` CLI, which isn't guaranteed to be installed everywhere this
  script runs (it wasn't, in this same sandbox) — fixed to use Python's
  stdlib `sqlite3` module instead, since Python is guaranteed to be
  present (it's the app's own runtime). `restore.sh` never deletes the
  SQLite file it's replacing outright — it's moved aside with a
  `.bak-<timestamp>` suffix first, extending §0.1's "nothing is ever
  hard-deleted" posture to this operational script too, not just the
  application's own data model.
