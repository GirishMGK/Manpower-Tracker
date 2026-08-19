"""Acceptance tests T1, T2, T3, T4, T5, T6, T7 (§14) against the conflict engine."""
import uuid

from app.models.allocation import Allocation, IndependenceDeclaration, NonAvailability
from app.models.enums import (
    AllocationRole,
    AllocationStatus,
    Designation,
    StaffCategory,
)
from app.services.conflict_engine import AllocationCandidate, validate_allocation
from tests.factories import make_client, make_client_group, make_department, make_engagement, make_staff


def _confirmed_allocation(session, engagement, staff, date_from, date_to, pct=100, role=AllocationRole.TEAM_MEMBER):
    row = Allocation(
        engagement_id=engagement.id,
        staff_id=staff.id,
        role_on_engagement=role,
        date_from=date_from,
        date_to=date_to,
        allocation_pct=pct,
        status=AllocationStatus.CONFIRMED,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _setup_engagement(session):
    dept = make_department(session)
    client = make_client(session)
    engagement = make_engagement(session, client.id, dept.id)
    return dept, client, engagement


def test_t1_overallocation_blocked(session):
    _, _, engagement = _setup_engagement(session)
    staff = make_staff(session)
    _confirmed_allocation(session, engagement, staff, "2026-09-01", "2026-09-30", pct=100)

    cand = AllocationCandidate(
        engagement_id=engagement.id, staff_id=staff.id, role_on_engagement=AllocationRole.TEAM_MEMBER,
        date_from="2026-09-10", date_to="2026-09-15", allocation_pct=100,
    )
    violations = validate_allocation(session, cand)
    codes = {v.code for v in violations}
    assert "OVERALLOCATION" in codes
    assert next(v for v in violations if v.code == "OVERALLOCATION").severity == "BLOCK"


def test_t2_two_50pct_ok_third_25pct_blocked(session):
    _, _, engagement = _setup_engagement(session)
    staff = make_staff(session)
    _confirmed_allocation(session, engagement, staff, "2026-09-01", "2026-09-30", pct=50)

    # second 50% booking overlapping same dates -> should be allowed (total 100%)
    cand2 = AllocationCandidate(
        engagement_id=engagement.id, staff_id=staff.id, role_on_engagement=AllocationRole.TEAM_MEMBER,
        date_from="2026-09-01", date_to="2026-09-30", allocation_pct=50,
    )
    violations2 = validate_allocation(session, cand2)
    assert not any(v.code == "OVERALLOCATION" for v in violations2)
    _confirmed_allocation(session, engagement, staff, "2026-09-01", "2026-09-30", pct=50)

    # third 25% booking overlapping -> total would be 125% -> blocked
    cand3 = AllocationCandidate(
        engagement_id=engagement.id, staff_id=staff.id, role_on_engagement=AllocationRole.TEAM_MEMBER,
        date_from="2026-09-05", date_to="2026-09-10", allocation_pct=25,
    )
    violations3 = validate_allocation(session, cand3)
    assert any(v.code == "OVERALLOCATION" and v.severity == "BLOCK" for v in violations3)


def test_t3_leave_conflict_names_the_record(session):
    _, _, engagement = _setup_engagement(session)
    staff = make_staff(session)
    leave = NonAvailability(
        staff_id=staff.id, type="PRIVILEGE_LEAVE", date_from="2026-09-10", date_to="2026-09-12",
        status="APPROVED",
    )
    session.add(leave)
    session.commit()
    session.refresh(leave)

    cand = AllocationCandidate(
        engagement_id=engagement.id, staff_id=staff.id, role_on_engagement=AllocationRole.TEAM_MEMBER,
        date_from="2026-09-11", date_to="2026-09-14", allocation_pct=100,
    )
    violations = validate_allocation(session, cand)
    leave_violation = next(v for v in violations if v.code == "LEAVE_CONFLICT")
    assert leave_violation.severity == "BLOCK"
    assert leave_violation.context["non_availability_id"] == str(leave.id)


def test_t4_article_blocked_during_exam_leave(session):
    _, _, engagement = _setup_engagement(session)
    article = make_staff(
        session,
        staff_category=StaffCategory.ARTICLED_ASSISTANT,
        designation=Designation.ARTICLE_Y2,
        grade_rank=11,
        exam_leave_blocks=[{"from": "2026-05-01", "to": "2026-05-20", "exam": "CA Final May 26"}],
    )
    cand = AllocationCandidate(
        engagement_id=engagement.id, staff_id=article.id, role_on_engagement=AllocationRole.ARTICLE,
        date_from="2026-05-10", date_to="2026-05-15", allocation_pct=100,
    )
    violations = validate_allocation(session, cand)
    assert any(v.code == "EXAM_LEAVE" and v.severity == "BLOCK" for v in violations)


def test_t5_eqcr_partner_cannot_also_be_engagement_partner(session):
    _, _, engagement = _setup_engagement(session)
    partner = make_staff(
        session, staff_category=StaffCategory.PARTNER, designation=Designation.PARTNER, grade_rank=2,
        icai_membership_no="123456",
    )
    engagement.eqcr_partner_id = partner.id
    session.add(engagement)
    session.commit()

    cand = AllocationCandidate(
        engagement_id=engagement.id, staff_id=partner.id, role_on_engagement=AllocationRole.ENGAGEMENT_PARTNER,
        date_from="2026-09-01", date_to="2026-09-30", allocation_pct=100,
    )
    violations = validate_allocation(session, cand)
    assert any(v.code == "EQCR_INDEPENDENCE" and v.severity == "BLOCK" for v in violations)


def test_t6_no_qualified_supervisor_for_articles(session):
    _, _, engagement = _setup_engagement(session)
    # Two other articles already on the engagement, no AM+ supervisor.
    other_article = make_staff(session, staff_category=StaffCategory.ARTICLED_ASSISTANT, designation=Designation.ARTICLE_Y1, grade_rank=12)
    _confirmed_allocation(session, engagement, other_article, "2026-09-01", "2026-09-30", role=AllocationRole.ARTICLE)

    article = make_staff(session, staff_category=StaffCategory.ARTICLED_ASSISTANT, designation=Designation.ARTICLE_Y2, grade_rank=11)
    cand = AllocationCandidate(
        engagement_id=engagement.id, staff_id=article.id, role_on_engagement=AllocationRole.ARTICLE,
        date_from="2026-09-05", date_to="2026-09-10", allocation_pct=100,
    )
    violations = validate_allocation(session, cand)
    assert any(v.code == "NO_QUALIFIED_SUPERVISOR" and v.severity == "BLOCK" for v in violations)

    # Now add a qualified supervisor (Assistant Manager, grade_rank=6) overlapping -> rule clears.
    supervisor = make_staff(session, staff_category=StaffCategory.EMPLOYEE_CA, designation=Designation.ASSISTANT_MANAGER, grade_rank=6)
    _confirmed_allocation(session, engagement, supervisor, "2026-09-01", "2026-09-30", role=AllocationRole.FIELD_INCHARGE)
    violations2 = validate_allocation(session, cand)
    assert not any(v.code == "NO_QUALIFIED_SUPERVISOR" for v in violations2)


def test_t7_independence_conflict_blocks_across_client_group(session):
    group = make_client_group(session)
    client_a = make_client(session, group_id=group.id)
    client_b = make_client(session, group_id=group.id)
    dept = make_department(session)
    engagement_b = make_engagement(session, client_b.id, dept.id)

    staff = make_staff(session)
    declaration = IndependenceDeclaration(
        staff_id=staff.id, client_id=client_a.id, declaration_fy="FY2026-27", is_conflicted=True,
    )
    session.add(declaration)
    session.commit()

    cand = AllocationCandidate(
        engagement_id=engagement_b.id, staff_id=staff.id, role_on_engagement=AllocationRole.TEAM_MEMBER,
        date_from="2026-09-01", date_to="2026-09-10", allocation_pct=100,
    )
    violations = validate_allocation(session, cand)
    assert any(v.code == "INDEPENDENCE_CONFLICT" and v.severity == "BLOCK" for v in violations)
