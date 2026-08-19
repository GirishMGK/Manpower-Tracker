"""The conflict / business-rules engine (§4).

`validate_allocation` runs the full rule set for a proposed (or edited)
allocation and returns a list of `RuleViolation`s without persisting
anything. Callers decide what to do with the result:

- any BLOCK severity -> the caller must refuse to save
- WARN severity -> caller may save only if the request carries a typed
  override reason, which the router mirrors into `allocations.override_flags`
  and `audit_log`
- INFO -> always safe to save; shown to the user for awareness only

This module currently implements R1-R9 (Phase P3). R10-R24 land in P8.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal

from sqlmodel import Session, select

from app.models.allocation import Allocation, NonAvailability
from app.models.client import Client
from app.models.engagement import Engagement
from app.models.enums import (
    AllocationRole,
    AllocationStatus,
    NonAvailabilityStatus,
    StaffCategory,
)
from app.models.enums import QUALIFIED_SUPERVISOR_MAX_GRADE_RANK
from app.models.staff import Staff


@dataclass
class RuleViolation:
    code: str
    severity: Literal["BLOCK", "WARN", "INFO"]
    message: str
    context: dict = field(default_factory=dict)
    overridable: bool = False
    override_role: str | None = None


@dataclass
class AllocationCandidate:
    """Shape of a not-yet-persisted allocation, as posted to /validate."""

    engagement_id: uuid.UUID
    staff_id: uuid.UUID
    role_on_engagement: AllocationRole
    date_from: str
    date_to: str
    allocation_pct: float = 100
    status: AllocationStatus = AllocationStatus.CONFIRMED
    exclude_allocation_id: uuid.UUID | None = None  # when editing an existing row


def _to_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date() if isinstance(s, str) else s


def _daterange(d1: date, d2: date):
    for n in range((d2 - d1).days + 1):
        yield d1 + timedelta(n)


def _overlapping_active_allocations(
    db: Session, staff_id: uuid.UUID, date_from: str, date_to: str, exclude_id: uuid.UUID | None
) -> list[Allocation]:
    stmt = (
        select(Allocation)
        .where(Allocation.staff_id == staff_id)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.status.in_([AllocationStatus.CONFIRMED, AllocationStatus.IN_PROGRESS]))  # type: ignore[attr-defined]
        .where(Allocation.date_from <= date_to)
        .where(Allocation.date_to >= date_from)
    )
    rows = list(db.exec(stmt).all())
    if exclude_id:
        rows = [r for r in rows if r.id != exclude_id]
    return rows


def check_overallocation(db: Session, cand: AllocationCandidate) -> RuleViolation | None:
    """R1: sum of allocation_pct for a staff member on any day > 100%."""
    if cand.status not in (AllocationStatus.CONFIRMED, AllocationStatus.IN_PROGRESS):
        return None
    existing = _overlapping_active_allocations(db, cand.staff_id, cand.date_from, cand.date_to, cand.exclude_allocation_id)
    if not existing:
        return None
    d_from, d_to = _to_date(cand.date_from), _to_date(cand.date_to)
    worst_day, worst_pct = None, 0.0
    for day in _daterange(d_from, d_to):
        total = cand.allocation_pct
        for alloc in existing:
            if _to_date(alloc.date_from) <= day <= _to_date(alloc.date_to):
                total += alloc.allocation_pct
        if total > worst_pct:
            worst_pct, worst_day = total, day
    if worst_pct > 100:
        return RuleViolation(
            code="OVERALLOCATION",
            severity="BLOCK",
            message=f"Staff would be allocated {worst_pct:.0f}% on {worst_day.isoformat()}, exceeding 100%.",
            context={"date": worst_day.isoformat(), "total_pct": worst_pct},
            overridable=False,
        )
    return None


def check_leave_conflict(db: Session, cand: AllocationCandidate) -> RuleViolation | None:
    """R2: booking overlaps an APPROVED non_availability record."""
    stmt = (
        select(NonAvailability)
        .where(NonAvailability.staff_id == cand.staff_id)
        .where(NonAvailability.is_active == True)  # noqa: E712
        .where(NonAvailability.status == NonAvailabilityStatus.APPROVED.value)
        .where(NonAvailability.date_from <= cand.date_to)
        .where(NonAvailability.date_to >= cand.date_from)
    )
    leave = db.exec(stmt).first()
    if leave:
        return RuleViolation(
            code="LEAVE_CONFLICT",
            severity="BLOCK",
            message=f"Overlaps approved {leave.type} from {leave.date_from} to {leave.date_to}.",
            context={"non_availability_id": str(leave.id), "type": leave.type},
            overridable=False,
        )
    return None


def check_exam_leave(db: Session, cand: AllocationCandidate, staff: Staff) -> RuleViolation | None:
    """R3: article booked inside a declared exam_leave_block."""
    if not staff.exam_leave_blocks:
        return None
    d_from, d_to = _to_date(cand.date_from), _to_date(cand.date_to)
    for block in staff.exam_leave_blocks:
        b_from, b_to = _to_date(block["from"]), _to_date(block["to"])
        if b_from <= d_to and b_to >= d_from:
            return RuleViolation(
                code="EXAM_LEAVE",
                severity="BLOCK",
                message=f"Overlaps declared exam leave ({block.get('exam', 'exam')}) {block['from']} to {block['to']}.",
                context={"exam": block.get("exam"), "from": block["from"], "to": block["to"]},
                overridable=False,
            )
    return None


def check_not_joined_or_exited(cand: AllocationCandidate, staff: Staff) -> RuleViolation | None:
    """R4: booking outside employment window."""
    d_from, d_to = _to_date(cand.date_from), _to_date(cand.date_to)
    if staff.date_of_joining and d_from < _to_date(staff.date_of_joining):
        return RuleViolation(
            code="NOT_JOINED_OR_EXITED",
            severity="BLOCK",
            message=f"Booking starts before joining date {staff.date_of_joining}.",
            context={"date_of_joining": staff.date_of_joining},
            overridable=False,
        )
    exit_boundary = staff.notice_period_end or staff.date_of_exit
    if exit_boundary and d_to > _to_date(exit_boundary):
        return RuleViolation(
            code="NOT_JOINED_OR_EXITED",
            severity="BLOCK",
            message=f"Booking extends beyond exit/notice-period end {exit_boundary}.",
            context={"exit_boundary": exit_boundary},
            overridable=False,
        )
    return None


def check_independence_conflict(db: Session, cand: AllocationCandidate, engagement: Engagement) -> RuleViolation | None:
    """R5: staff conflicted for this client, or any client in the same group."""
    from app.models.allocation import IndependenceDeclaration

    client = db.get(Client, engagement.client_id)
    if client is None:
        return None
    client_ids = {client.id}
    if client.group_id:
        group_clients = db.exec(select(Client).where(Client.group_id == client.group_id)).all()
        client_ids |= {c.id for c in group_clients}
    stmt = (
        select(IndependenceDeclaration)
        .where(IndependenceDeclaration.staff_id == cand.staff_id)
        .where(IndependenceDeclaration.client_id.in_(client_ids))  # type: ignore[attr-defined]
        .where(IndependenceDeclaration.is_conflicted == True)  # noqa: E712
        .where(IndependenceDeclaration.is_active == True)  # noqa: E712
    )
    conflict = db.exec(stmt).first()
    if conflict:
        return RuleViolation(
            code="INDEPENDENCE_CONFLICT",
            severity="BLOCK",
            message="Staff has a declared independence conflict on this client or its client group.",
            context={"declaration_id": str(conflict.id), "client_id": str(conflict.client_id)},
            overridable=False,
        )
    return None


def check_eqcr_independence(db: Session, cand: AllocationCandidate, engagement: Engagement) -> RuleViolation | None:
    """R6: the EQCR partner cannot also hold a non-EQCR role on the same engagement."""
    is_eqcr_candidate = cand.role_on_engagement == AllocationRole.EQCR or cand.staff_id == engagement.eqcr_partner_id
    if not is_eqcr_candidate:
        return None
    eqcr_staff_id = engagement.eqcr_partner_id if engagement.eqcr_partner_id else (
        cand.staff_id if cand.role_on_engagement == AllocationRole.EQCR else None
    )
    if eqcr_staff_id is None:
        return None
    stmt = (
        select(Allocation)
        .where(Allocation.engagement_id == cand.engagement_id)
        .where(Allocation.staff_id == eqcr_staff_id)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.role_on_engagement != AllocationRole.EQCR)
        .where(Allocation.status.in_([AllocationStatus.CONFIRMED, AllocationStatus.IN_PROGRESS, AllocationStatus.PROPOSED]))  # type: ignore[attr-defined]
        .where(Allocation.date_from <= cand.date_to)
        .where(Allocation.date_to >= cand.date_from)
    )
    if cand.exclude_allocation_id:
        stmt = stmt.where(Allocation.id != cand.exclude_allocation_id)
    other_role = db.exec(stmt).first()
    # Also catch the case where THIS candidate itself is a non-EQCR role for the current EQCR partner.
    if cand.role_on_engagement != AllocationRole.EQCR and cand.staff_id == engagement.eqcr_partner_id:
        return RuleViolation(
            code="EQCR_INDEPENDENCE",
            severity="BLOCK",
            message="This staff member is the engagement's EQCR partner and cannot also hold a delivery role.",
            context={"engagement_id": str(engagement.id)},
            overridable=False,
        )
    if other_role:
        return RuleViolation(
            code="EQCR_INDEPENDENCE",
            severity="BLOCK",
            message="EQCR partner already holds a non-EQCR role on this engagement for overlapping dates.",
            context={"conflicting_allocation_id": str(other_role.id)},
            overridable=False,
        )
    return None


def check_signing_partner_not_partner(cand: AllocationCandidate, staff: Staff) -> RuleViolation | None:
    """R7: signing/engagement partner must be a PARTNER with a valid ICAI membership no."""
    if cand.role_on_engagement not in (AllocationRole.SIGNING_PARTNER, AllocationRole.ENGAGEMENT_PARTNER):
        return None
    if staff.staff_category != StaffCategory.PARTNER or not staff.icai_membership_no:
        return RuleViolation(
            code="SIGNING_PARTNER_NOT_PARTNER",
            severity="BLOCK",
            message="Signing/engagement partner role requires staff_category=PARTNER with a valid ICAI membership no.",
            context={"staff_category": staff.staff_category, "icai_membership_no": staff.icai_membership_no},
            overridable=False,
        )
    return None


def check_ep_rotation(cand: AllocationCandidate, staff: Staff, engagement: Engagement, client: Client | None) -> RuleViolation | None:
    """R8: EP rotation due — WARN normally, BLOCK if the client is a PIE."""
    if cand.role_on_engagement != AllocationRole.ENGAGEMENT_PARTNER or not engagement.ep_rotation_due_fy:
        return None
    if engagement.financial_year < engagement.ep_rotation_due_fy:
        return None
    is_pie = bool(client and client.is_pie)
    return RuleViolation(
        code="EP_ROTATION_DUE",
        severity="BLOCK" if is_pie else "WARN",
        message=f"Engagement partner rotation was due by {engagement.ep_rotation_due_fy} (s.139(2)).",
        context={"ep_rotation_due_fy": engagement.ep_rotation_due_fy, "is_pie": is_pie},
        overridable=not is_pie,
        override_role="PARTNER",
    )


def check_no_qualified_supervisor(db: Session, cand: AllocationCandidate, engagement: Engagement) -> RuleViolation | None:
    """R9: an engagement with >=1 article needs a supervisor of grade <= Assistant Manager overlapping."""
    candidate_staff = db.get(Staff, cand.staff_id)
    is_article_candidate = candidate_staff is not None and candidate_staff.staff_category in (
        StaffCategory.ARTICLED_ASSISTANT,
        StaffCategory.INDUSTRIAL_TRAINEE,
    )
    if not is_article_candidate:
        return None

    stmt = (
        select(Allocation, Staff)
        .join(Staff, Allocation.staff_id == Staff.id)
        .where(Allocation.engagement_id == cand.engagement_id)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.status.in_([AllocationStatus.CONFIRMED, AllocationStatus.IN_PROGRESS, AllocationStatus.PROPOSED]))  # type: ignore[attr-defined]
        .where(Allocation.date_from <= cand.date_to)
        .where(Allocation.date_to >= cand.date_from)
        .where(Staff.grade_rank <= QUALIFIED_SUPERVISOR_MAX_GRADE_RANK)
    )
    if cand.exclude_allocation_id:
        stmt = stmt.where(Allocation.id != cand.exclude_allocation_id)
    supervisor = db.exec(stmt).first()
    if supervisor is None:
        return RuleViolation(
            code="NO_QUALIFIED_SUPERVISOR",
            severity="BLOCK",
            message="No member of grade >= Assistant Manager is booked on this engagement for the article's dates.",
            context={"engagement_id": str(engagement.id)},
            overridable=False,
        )
    return None


def validate_allocation(db: Session, cand: AllocationCandidate) -> list[RuleViolation]:
    violations: list[RuleViolation] = []

    engagement = db.get(Engagement, cand.engagement_id)
    staff = db.get(Staff, cand.staff_id)
    if engagement is None or staff is None:
        violations.append(
            RuleViolation(
                code="NOT_FOUND",
                severity="BLOCK",
                message="Engagement or staff not found.",
                overridable=False,
            )
        )
        return violations

    client = db.get(Client, engagement.client_id)

    for check in (
        lambda: check_overallocation(db, cand),
        lambda: check_leave_conflict(db, cand),
        lambda: check_exam_leave(db, cand, staff),
        lambda: check_not_joined_or_exited(cand, staff),
        lambda: check_independence_conflict(db, cand, engagement),
        lambda: check_eqcr_independence(db, cand, engagement),
        lambda: check_signing_partner_not_partner(cand, staff),
        lambda: check_ep_rotation(cand, staff, engagement, client),
        lambda: check_no_qualified_supervisor(db, cand, engagement),
    ):
        result = check()
        if result:
            violations.append(result)

    return violations


def has_blocking(violations: list[RuleViolation]) -> bool:
    return any(v.severity == "BLOCK" for v in violations)
