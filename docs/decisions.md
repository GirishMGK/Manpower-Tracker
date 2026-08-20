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
without a redeploy. R13 itself lands in Phase P8.

## 5. Timesheets — existing system / historical import

No existing timesheet system was named. Timesheets are built fresh in
Phase P9 with an import seam left open
(`/api/v1/integrations/...`, §15) for a historical backfill later.

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
is a Phase P11 deliverable (`docs/user-guide.md` restore drill, §14
mentions this as an implicit expectation via "audit_log retention ≥ 8
years"). Until P11, the operational assumption is: nightly `pg_dump` of the
`db` volume, retained per the firm's backup policy.

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
