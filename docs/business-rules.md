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

## Not yet implemented (Phase P8)

R10 `EQCR_MISSING` (WARN), R11 `SKILL_GAP` (WARN), R12 `GRADE_MIX_BREACH`
(WARN), R13 `ICAI_TRAINING_LIMIT` (WARN), R14 `ARTICLE_HOURS_BREACH` (WARN),
R15 `SUSTAINED_OVERLOAD` (WARN), R16 `OUTSTATION_BREACH` (WARN), R17
`LOCATION_MISMATCH` (INFO), R18 `BUDGET_OVERRUN` (WARN), R19
`DEADLINE_RISK` (WARN), R20 `NO_EXPOSURE_DIVERSITY` (INFO), R21
`EXITING_STAFF` (WARN), R22 `UNAPPROVED_PIPELINE` (INFO), R23
`DUPLICATE_ROLE` (BLOCK), R24 `COOLING_OFF` (WARN).

`resource_requests`, `independence_declarations` write flow (only the read
side exists so far, via seed/direct writes), and the approval workflow in
§9.1/§9.4 also land in P8.

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
