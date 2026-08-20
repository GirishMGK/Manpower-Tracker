# Business Rules Engine — Implementation Status

Source of truth for rule logic: `backend/app/services/conflict_engine.py`.
This file tracks which of §4's R1–R24 are implemented, in which phase, and
any implementation notes that go beyond what the spec states verbatim.

## Implemented (Phase P3)

| Code | Severity | Function | Notes |
|---|---|---|---|
| R1 `OVERALLOCATION` | BLOCK | `check_overallocation` | Sums `allocation_pct` day-by-day across CONFIRMED/IN_PROGRESS bookings in the candidate's date range. Not overridable — this is the one rule with no escape hatch, by design. |
| R2 `LEAVE_CONFLICT` | BLOCK | `check_leave_conflict` | Only checks APPROVED leave, per spec. Response names the conflicting `non_availability` record so the caller can act on it (T3). |
| R3 `EXAM_LEAVE` | BLOCK | `check_exam_leave` | Reads `staff.exam_leave_blocks` JSON. |
| R4 `NOT_JOINED_OR_EXITED` | BLOCK | `check_not_joined_or_exited` | Uses `notice_period_end` when set, else `date_of_exit`, as the exit boundary. |
| R5 `INDEPENDENCE_CONFLICT` | BLOCK | `check_independence_conflict` | Expands to every client in the same `client_group` (T7). |
| R6 `EQCR_INDEPENDENCE` | BLOCK | `check_eqcr_independence` | Catches both directions: booking the EQCR partner into a delivery role, and booking a delivery-role holder as EQCR. |
| R7 `SIGNING_PARTNER_NOT_PARTNER` | BLOCK | `check_signing_partner_not_partner` | Requires `staff_category=PARTNER` **and** a non-empty `icai_membership_no`. |
| R8 `EP_ROTATION_DUE` | WARN / BLOCK if PIE | `check_ep_rotation` | BLOCK (non-overridable) when `client.is_pie`; WARN (overridable by PARTNER) otherwise. |
| R9 `NO_QUALIFIED_SUPERVISOR` | BLOCK | `check_no_qualified_supervisor` | "Qualified supervisor" = any staff with `grade_rank <= grade_rank(ASSISTANT_MANAGER)` booked on the same engagement for overlapping dates. |

## Implemented (Phase P8)

| Code | Severity | Function | Notes |
|---|---|---|---|
| R10 `EQCR_MISSING` | WARN | `check_eqcr_missing` | `engagement.eqcr_required` set but `eqcr_partner_id` still null; clears once any EQCR allocation is booked. |
| R11 `SKILL_GAP` | WARN | `check_skill_gap` | Compares `engagement.requires_specialist_skills` (skill codes) against the staff member's `staff_skills` rows. |
| R12 `GRADE_MIX_BREACH` | WARN | `check_grade_mix_breach` | Article:qualified ratio on the engagement vs. `app_config.max_article_ratio`; a zero qualified-staff count always violates. |
| R13 `ICAI_TRAINING_LIMIT` | WARN | `check_icai_training_limit` | Approximated via `SECONDMENT`-type `non_availability` rows (no dedicated secondment table) — see docs/decisions.md. Checks both the aggregate-months cap and the per-principal cap. |
| R14 `ARTICLE_HOURS_BREACH` | WARN | `check_article_hours_breach` | 35-hr/week article norm (§5); sums the candidate + overlapping bookings per ISO week. |
| R15 `SUSTAINED_OVERLOAD` | WARN | `check_sustained_overload` | >=90% allocated for `app_config.burnout_weeks` consecutive weeks — the same threshold the P10 burnout watchlist will read. |
| R16 `OUTSTATION_BREACH` | WARN | `check_outstation_breach` | Per-calendar-month outstation days vs. `staff.max_outstation_days_per_month`; only counts days where the booking office differs from `base_office_id`. |
| R17 `LOCATION_MISMATCH` | INFO | `check_location_mismatch` | Booking office != staff's base office. |
| R18 `BUDGET_OVERRUN` | WARN | `check_budget_overrun` | Projected staff-cost / fee ratio for the whole engagement team vs. `app_config.max_cost_ratio`; hours estimated at 8 hrs/business-day. |
| R19 `DEADLINE_RISK` | WARN | `check_deadline_risk` | Booking's `date_to` falls after `reporting_deadline`/`statutory_due_date`. |
| R20 `NO_EXPOSURE_DIVERSITY` | INFO | `check_no_exposure_diversity` | Article's cumulative days on one client vs. `app_config.max_days_single_client`. |
| R21 `EXITING_STAFF` | WARN | `check_exiting_staff` | Booking starts within the final 20% of notice period — approximated against a standard 30-day notice length since the schema has no `notice_start` field (see docs/decisions.md). |
| R22 `UNAPPROVED_PIPELINE` | INFO | `check_unapproved_pipeline` | Engagement still `PIPELINE` or client `acceptance_status != ACCEPTED`. |
| R23 `DUPLICATE_ROLE` | BLOCK | `check_duplicate_role` | Signing partner / EP / EQCR / engagement manager can only have one active holder per engagement at a time. |
| R24 `COOLING_OFF` | WARN | `check_cooling_off` | Presence-based on `independence_declarations.held_employment_last_2yrs` (boolean, not a date) — see docs/decisions.md. |

All fourteen are unit-tested in `tests/test_conflict_engine.py` (both as
standalone `check_*` calls and, for R10/R17, wired through
`validate_allocation`).

`resource_requests` and `independence_declarations` write/approval flow
(§9.1/§9.4) — only the read side existed before P8 — lands as a separate
P8 task; see the phase table in the root README.

## Enforcement mechanics

- `validate_allocation(db, candidate)` runs every implemented rule and
  returns `list[RuleViolation]` without writing anything — this is what
  `POST /api/v1/allocations/validate` calls directly (for the UI's
  drag-hover preview, per §6.1) and what `POST/PATCH /allocations` call
  before persisting.
- **BLOCK** violations always reject the write (`422`), full stop — no
  override path exists at any role.
- **WARN** violations require a typed override: the caller must include
  `{"code": "<rule code>", "reason": "<free text>"}` in the request's
  `overrides` list for every WARN present, or the write is rejected
  (`422`) naming which ones are still unresolved. Recorded overrides are
  stamped with `by`/`on` and appended to `allocations.override_flags`,
  which is exactly what RP-07 (Conflict and Exception report, the
  SQC1/ISQM1 evidence report) will read from once P7 report library
  ships.
- **INFO** violations never block a write; they exist for the UI to
  surface as an FYI.
- Every rule function takes the DB session and the same
  `AllocationCandidate` shape, so adding R10–R24 in P8 is additive — no
  change to the calling convention in the router.
