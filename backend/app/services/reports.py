"""RP-01..RP-09 — the mandatory report library (§11).

Standard params per §11: date range, office, department, partner, client
group, staff category, status. Each function here returns a plain
`list[dict]` of rows shaped exactly like its §11 column list, so the same
data feeds the JSON endpoint, the Excel export and the PDF export without
three separate implementations.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from sqlmodel import Session, select

from app.models.allocation import Allocation, NonAvailability
from app.models.client import Client
from app.models.engagement import Engagement
from app.models.enums import AllocationStatus, StaffCategory
from app.models.reference import Department, Office, StaffSkill
from app.models.staff import Staff
from app.services.capacity_report import get_staff_utilisation


@dataclass
class ReportFilters:
    office_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    partner_id: uuid.UUID | None = None
    client_group_id: uuid.UUID | None = None
    staff_category: str | None = None
    status: str | None = None


def _to_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _overlap_days(a_from: str, a_to: str, w_from: date, w_to: date) -> int:
    start = max(_to_date(a_from), w_from)
    end = min(_to_date(a_to), w_to)
    return max(0, (end - start).days + 1)


def _staff_lookup(db: Session) -> dict[uuid.UUID, Staff]:
    return {s.id: s for s in db.exec(select(Staff)).all()}


def _office_lookup(db: Session) -> dict[uuid.UUID, Office]:
    return {o.id: o for o in db.exec(select(Office)).all()}


def _department_lookup(db: Session) -> dict[uuid.UUID, Department]:
    return {d.id: d for d in db.exec(select(Department)).all()}


# ------------------------------------------------------------------ RP-01 --

def deployment_register(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-01: the master allocation list."""
    staff_by_id = _staff_lookup(db)
    office_by_id = _office_lookup(db)
    dept_by_id = _department_lookup(db)

    stmt = (
        select(Allocation, Engagement, Client)
        .join(Engagement, Allocation.engagement_id == Engagement.id)
        .join(Client, Engagement.client_id == Client.id)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.date_from <= date_to.isoformat())
        .where(Allocation.date_to >= date_from.isoformat())
    )
    if f.status:
        stmt = stmt.where(Allocation.status == f.status)
    if f.department_id:
        stmt = stmt.where(Engagement.department_id == f.department_id)
    if f.partner_id:
        stmt = stmt.where(Engagement.engagement_partner_id == f.partner_id)
    if f.client_group_id:
        stmt = stmt.where(Client.group_id == f.client_group_id)

    rows = []
    for alloc, engagement, client in db.exec(stmt).all():
        staff = staff_by_id.get(alloc.staff_id)
        if staff is None:
            continue
        if f.office_id and staff.base_office_id != f.office_id:
            continue
        if f.staff_category and staff.staff_category != f.staff_category:
            continue
        office = office_by_id.get(alloc.office_id or staff.base_office_id)
        dept = dept_by_id.get(alloc.department_id or engagement.department_id)
        reporting_manager = staff_by_id.get(alloc.reporting_manager_id) if alloc.reporting_manager_id else None
        partner = staff_by_id.get(alloc.partner_id) if alloc.partner_id else None
        days = _overlap_days(alloc.date_from, alloc.date_to, date_from, date_to)
        rows.append(
            {
                "staff_name": staff.full_name, "employee_code": staff.employee_code, "grade": staff.designation,
                "office_name": office.name if office else "", "client_name": client.name,
                "engagement_code": engagement.engagement_code, "service_type": engagement.service_type,
                "department_name": dept.name if dept else "", "role_on_engagement": alloc.role_on_engagement,
                "reporting_manager": reporting_manager.full_name if reporting_manager else "",
                "partner_name": partner.full_name if partner else "",
                "date_from": alloc.date_from, "date_to": alloc.date_to, "days": days,
                "allocation_pct": alloc.allocation_pct, "planned_hours": alloc.planned_hours,
                "status": alloc.status,
            }
        )
    return rows


# ------------------------------------------------------------------ RP-02 --

def engagement_team_composition(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-02: per engagement — partner/EQCR/manager, team by grade, budget vs planned."""
    staff_by_id = _staff_lookup(db)

    eng_stmt = select(Engagement, Client).join(Client, Engagement.client_id == Client.id).where(Engagement.is_active == True)  # noqa: E712
    if f.department_id:
        eng_stmt = eng_stmt.where(Engagement.department_id == f.department_id)
    if f.partner_id:
        eng_stmt = eng_stmt.where(Engagement.engagement_partner_id == f.partner_id)
    if f.client_group_id:
        eng_stmt = eng_stmt.where(Client.group_id == f.client_group_id)
    if f.status:
        eng_stmt = eng_stmt.where(Engagement.status == f.status)

    alloc_stmt = (
        select(Allocation)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.date_from <= date_to.isoformat())
        .where(Allocation.date_to >= date_from.isoformat())
    )
    allocs_by_engagement: dict[uuid.UUID, list[Allocation]] = defaultdict(list)
    for a in db.exec(alloc_stmt).all():
        allocs_by_engagement[a.engagement_id].append(a)

    rows = []
    for engagement, client in db.exec(eng_stmt).all():
        team = allocs_by_engagement.get(engagement.id, [])
        by_grade: dict[str, int] = defaultdict(int)
        planned_hours_total = 0.0
        for a in team:
            staff = staff_by_id.get(a.staff_id)
            if staff:
                by_grade[staff.designation] += 1
            planned_hours_total += a.planned_hours or 0

        required_skill_ids = engagement.requires_specialist_skills or []
        covered_skill_ids = set()
        if required_skill_ids:
            team_staff_ids = [a.staff_id for a in team]
            skill_rows = db.exec(
                select(StaffSkill)
                .where(StaffSkill.staff_id.in_(team_staff_ids))  # type: ignore[attr-defined]
                .where(StaffSkill.skill_id.in_(required_skill_ids))  # type: ignore[attr-defined]
                .where(StaffSkill.proficiency >= 3)
            ).all()
            covered_skill_ids = {s.skill_id for s in skill_rows}
        skill_coverage = f"{len(covered_skill_ids)}/{len(required_skill_ids)}" if required_skill_ids else "n/a"

        partner = staff_by_id.get(engagement.engagement_partner_id) if engagement.engagement_partner_id else None
        eqcr = staff_by_id.get(engagement.eqcr_partner_id) if engagement.eqcr_partner_id else None
        manager = staff_by_id.get(engagement.engagement_manager_id) if engagement.engagement_manager_id else None

        rows.append(
            {
                "engagement_code": engagement.engagement_code, "client_name": client.name,
                "partner_name": partner.full_name if partner else "", "eqcr_name": eqcr.full_name if eqcr else "",
                "manager_name": manager.full_name if manager else "",
                "team_by_grade": ", ".join(f"{k}:{v}" for k, v in sorted(by_grade.items())),
                "team_size": len(team), "budget_hours_total": engagement.budget_hours_total,
                "planned_hours_total": round(planned_hours_total, 2), "skill_coverage": skill_coverage,
                "status": engagement.status,
            }
        )
    return rows


# ------------------------------------------------------------------ RP-03 --

def staff_utilisation(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-03: reads capacity_daily (§5) — never raw allocations."""
    rows = get_staff_utilisation(db, date_from, date_to, office_id=f.office_id, department_id=f.department_id)
    out = []
    for r in rows:
        target = r["target_chargeability_pct"]
        variance = round(r["chargeable_util_pct"] - target, 2) if target is not None else None
        out.append({**r, "variance_pct": variance})
    return out


# ------------------------------------------------------------------ RP-04 --

def partner_portfolio(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-04: partner, clients, engagements, fee under mgmt, FTE, fee/FTE, avg risk, overdue reports."""
    staff_by_id = _staff_lookup(db)
    today = date.today()

    stmt = select(Engagement, Client).join(Client, Engagement.client_id == Client.id).where(Engagement.is_active == True)  # noqa: E712
    if f.client_group_id:
        stmt = stmt.where(Client.group_id == f.client_group_id)

    alloc_stmt = (
        select(Allocation)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.status.in_([AllocationStatus.CONFIRMED, AllocationStatus.IN_PROGRESS]))  # type: ignore[attr-defined]
        .where(Allocation.date_from <= date_to.isoformat())
        .where(Allocation.date_to >= date_from.isoformat())
    )
    period_days = (date_to - date_from).days + 1
    fte_by_partner: dict[uuid.UUID, float] = defaultdict(float)
    for a in db.exec(alloc_stmt).all():
        if a.partner_id:
            overlap = _overlap_days(a.date_from, a.date_to, date_from, date_to)
            fte_by_partner[a.partner_id] += (a.allocation_pct / 100) * (overlap / period_days)

    by_partner: dict[uuid.UUID, dict] = defaultdict(lambda: {"clients": set(), "engagements": 0, "fee": 0.0, "risks": [], "overdue": 0})
    risk_score = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "SIGNIFICANT": 4}
    for engagement, client in db.exec(stmt).all():
        pid = engagement.engagement_partner_id
        if pid is None or (f.partner_id and pid != f.partner_id):
            continue
        bucket = by_partner[pid]
        bucket["clients"].add(client.id)
        bucket["engagements"] += 1
        bucket["fee"] += engagement.fee_amount or 0
        bucket["risks"].append(risk_score.get(client.risk_rating, 2))
        if engagement.reporting_deadline and engagement.status not in ("COMPLETED", "LOST", "ON_HOLD"):
            if _to_date(engagement.reporting_deadline) < today:
                bucket["overdue"] += 1

    rows = []
    for pid, bucket in by_partner.items():
        partner = staff_by_id.get(pid)
        fte = round(fte_by_partner.get(pid, 0), 2)
        rows.append(
            {
                "partner_name": partner.full_name if partner else "Unknown", "clients": len(bucket["clients"]),
                "engagements": bucket["engagements"], "fee_under_management": round(bucket["fee"], 2),
                "fte_deployed": fte, "fee_per_fte": round(bucket["fee"] / fte, 2) if fte else 0,
                "avg_risk_rating": round(sum(bucket["risks"]) / len(bucket["risks"]), 2) if bucket["risks"] else 0,
                "overdue_reports": bucket["overdue"],
            }
        )
    return sorted(rows, key=lambda r: -r["fee_under_management"])


# ------------------------------------------------------------------ RP-05 --

def office_resourcing(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-05: office, headcount by category, FTE deployed, in/out deputation, util%."""
    offices = list(db.exec(select(Office).where(Office.is_active == True)).all())  # noqa: E712
    staff_list = list(db.exec(select(Staff).where(Staff.is_active == True)).all())  # noqa: E712
    staff_by_id = {s.id: s for s in staff_list}

    headcount_by_office: dict[uuid.UUID, int] = defaultdict(int)
    category_by_office: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for s in staff_list:
        if s.base_office_id:
            headcount_by_office[s.base_office_id] += 1
            category_by_office[s.base_office_id][s.staff_category] += 1

    alloc_stmt = (
        select(Allocation)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.status.in_([AllocationStatus.CONFIRMED, AllocationStatus.IN_PROGRESS]))  # type: ignore[attr-defined]
        .where(Allocation.date_from <= date_to.isoformat())
        .where(Allocation.date_to >= date_from.isoformat())
    )
    period_days = (date_to - date_from).days + 1
    fte_deployed: dict[uuid.UUID, float] = defaultdict(float)
    inbound: dict[uuid.UUID, int] = defaultdict(int)
    outbound: dict[uuid.UUID, int] = defaultdict(int)
    for a in db.exec(alloc_stmt).all():
        staff = staff_by_id.get(a.staff_id)
        if staff is None or a.office_id is None:
            continue
        overlap = _overlap_days(a.date_from, a.date_to, date_from, date_to)
        fte_deployed[a.office_id] += (a.allocation_pct / 100) * (overlap / period_days)
        if staff.base_office_id and staff.base_office_id != a.office_id:
            inbound[a.office_id] += 1
            outbound[staff.base_office_id] += 1

    util_rows = get_staff_utilisation(db, date_from, date_to)
    util_pct_by_staff = {r["staff_id"]: r["utilisation_pct"] for r in util_rows}
    avg_util_by_office: dict[uuid.UUID, float] = {}
    for o in offices:
        members = [s for s in staff_list if s.base_office_id == o.id]
        pcts = [util_pct_by_staff[m.id] for m in members if m.id in util_pct_by_staff]
        avg_util_by_office[o.id] = round(sum(pcts) / len(pcts), 2) if pcts else 0.0

    rows = []
    for o in offices:
        if f.office_id and o.id != f.office_id:
            continue
        rows.append(
            {
                "office_name": o.name, "headcount": headcount_by_office.get(o.id, 0),
                "headcount_by_category": ", ".join(f"{k}:{v}" for k, v in sorted(category_by_office.get(o.id, {}).items())),
                "fte_deployed": round(fte_deployed.get(o.id, 0), 2), "inbound_deputation": inbound.get(o.id, 0),
                "outbound_deputation": outbound.get(o.id, 0), "avg_utilisation_pct": avg_util_by_office.get(o.id, 0),
            }
        )
    return rows


# ------------------------------------------------------------------ RP-06 --

def bench_and_availability(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-06: staff, available from, available days, grade, skills, base office, last engagement."""
    from app.models.capacity import CapacityDaily

    staff_by_id = _staff_lookup(db)
    office_by_id = _office_lookup(db)

    stmt = select(Staff).where(Staff.is_active == True)  # noqa: E712
    if f.office_id:
        stmt = stmt.where(Staff.base_office_id == f.office_id)
    if f.department_id:
        stmt = stmt.where(Staff.primary_department_id == f.department_id)
    if f.staff_category:
        stmt = stmt.where(Staff.staff_category == f.staff_category)
    staff_list = list(db.exec(stmt).all())
    staff_ids = [s.id for s in staff_list]
    if not staff_ids:
        return []

    cap_rows = list(
        db.exec(
            select(CapacityDaily)
            .where(CapacityDaily.staff_id.in_(staff_ids))  # type: ignore[attr-defined]
            .where(CapacityDaily.capacity_date >= date_from)
            .where(CapacityDaily.capacity_date <= date_to)
            .order_by(CapacityDaily.capacity_date)
        ).all()
    )
    by_staff: dict[uuid.UUID, list] = defaultdict(list)
    for c in cap_rows:
        by_staff[c.staff_id].append(c)

    skills_by_staff: dict[uuid.UUID, list[str]] = defaultdict(list)
    from app.models.reference import Skill

    skill_names = {s.id: s.name for s in db.exec(select(Skill)).all()}
    for ss in db.exec(select(StaffSkill).where(StaffSkill.staff_id.in_(staff_ids))).all():  # type: ignore[attr-defined]
        if ss.skill_id in skill_names:
            skills_by_staff[ss.staff_id].append(skill_names[ss.skill_id])

    last_engagement_by_staff: dict[uuid.UUID, str] = {}
    for a in db.exec(
        select(Allocation)
        .where(Allocation.staff_id.in_(staff_ids))  # type: ignore[attr-defined]
        .where(Allocation.is_active == True)  # noqa: E712
        .order_by(Allocation.date_to.desc())
    ).all():
        if a.staff_id not in last_engagement_by_staff:
            eng = db.get(Engagement, a.engagement_id)
            if eng:
                last_engagement_by_staff[a.staff_id] = eng.engagement_code

    rows = []
    for s in staff_list:
        my_cap = by_staff.get(s.id, [])
        available_days = sum(1 for c in my_cap if c.net_capacity_hrs > 0 and c.available_hrs >= c.net_capacity_hrs)
        if available_days == 0:
            continue  # not on the bench in this window
        available_from = next((c.capacity_date.isoformat() for c in my_cap if c.available_hrs >= c.net_capacity_hrs and c.net_capacity_hrs > 0), None)
        office = office_by_id.get(s.base_office_id) if s.base_office_id else None
        rows.append(
            {
                "staff_name": s.full_name, "employee_code": s.employee_code, "grade": s.designation,
                "available_from": available_from, "available_days": available_days,
                "skills": ", ".join(skills_by_staff.get(s.id, [])[:5]),
                "base_office": office.name if office else "", "last_engagement": last_engagement_by_staff.get(s.id, ""),
            }
        )
    return sorted(rows, key=lambda r: -r["available_days"])


# ------------------------------------------------------------------ RP-07 --

def conflict_and_exception_report(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-07: every WARN/BLOCK override in the period — the ISQM/SQC1 evidence report."""
    staff_by_id = _staff_lookup(db)
    engagement_by_id = {e.id: e for e in db.exec(select(Engagement)).all()}
    client_by_id = {c.id: c for c in db.exec(select(Client)).all()}

    stmt = (
        select(Allocation)
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.date_from <= date_to.isoformat())
        .where(Allocation.date_to >= date_from.isoformat())
    )
    if f.department_id:
        stmt = stmt.where(Allocation.department_id == f.department_id)

    user_by_id = {}

    rows = []
    for alloc in db.exec(stmt).all():
        for override in alloc.override_flags or []:
            staff = staff_by_id.get(alloc.staff_id)
            engagement = engagement_by_id.get(alloc.engagement_id)
            client = client_by_id.get(engagement.client_id) if engagement else None
            approver_id = override.get("by")
            approver_name = user_by_id.get(approver_id)
            if approver_name is None and approver_id:
                from app.models.user import User

                try:
                    user = db.get(User, uuid.UUID(approver_id))
                except ValueError:
                    user = None
                approver_name = user.full_name if user else approver_id
                user_by_id[approver_id] = approver_name
            rows.append(
                {
                    "staff_name": staff.full_name if staff else "",
                    "engagement_code": engagement.engagement_code if engagement else "",
                    "client_name": client.name if client else "",
                    "rule_code": override.get("code"), "reason": override.get("reason"),
                    "approved_by": approver_name or "", "occurred_on": override.get("on"),
                    "allocation_dates": f"{alloc.date_from} to {alloc.date_to}",
                }
            )
    return rows


# ------------------------------------------------------------------ RP-08 --

def article_training_record(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-08: article, principal, clients served, service types, days, exposure diversity, leave, Form 103/108."""
    staff_by_id = _staff_lookup(db)
    client_by_id = {c.id: c for c in db.exec(select(Client)).all()}

    stmt = select(Staff).where(Staff.is_active == True).where(Staff.staff_category == StaffCategory.ARTICLED_ASSISTANT)  # noqa: E712
    if f.office_id:
        stmt = stmt.where(Staff.base_office_id == f.office_id)
    articles = list(db.exec(stmt).all())
    if not articles:
        return []
    article_ids = [a.id for a in articles]

    alloc_stmt = (
        select(Allocation, Engagement)
        .join(Engagement, Allocation.engagement_id == Engagement.id)
        .where(Allocation.staff_id.in_(article_ids))  # type: ignore[attr-defined]
        .where(Allocation.is_active == True)  # noqa: E712
        .where(Allocation.date_from <= date_to.isoformat())
        .where(Allocation.date_to >= date_from.isoformat())
    )
    by_article: dict[uuid.UUID, list] = defaultdict(list)
    for alloc, engagement in db.exec(alloc_stmt).all():
        by_article[alloc.staff_id].append((alloc, engagement))

    leave_stmt = (
        select(NonAvailability)
        .where(NonAvailability.staff_id.in_(article_ids))  # type: ignore[attr-defined]
        .where(NonAvailability.is_active == True)  # noqa: E712
        .where(NonAvailability.status == "APPROVED")
        .where(NonAvailability.date_from <= date_to.isoformat())
        .where(NonAvailability.date_to >= date_from.isoformat())
    )
    leave_days_by_article: dict[uuid.UUID, int] = defaultdict(int)
    for lv in db.exec(leave_stmt).all():
        leave_days_by_article[lv.staff_id] += _overlap_days(lv.date_from, lv.date_to, date_from, date_to)

    rows = []
    for art in articles:
        pairs = by_article.get(art.id, [])
        client_ids = {e.client_id for _, e in pairs}
        service_types = {e.service_type for _, e in pairs}
        days_by_client: dict[uuid.UUID, int] = defaultdict(int)
        for alloc, e in pairs:
            days_by_client[e.client_id] += _overlap_days(alloc.date_from, alloc.date_to, date_from, date_to)
        principal = staff_by_id.get(art.articleship_principal_id) if art.articleship_principal_id else None
        exposure_score = round(len(client_ids) + len(service_types) * 0.5, 1)
        rows.append(
            {
                "article_name": art.full_name, "employee_code": art.employee_code,
                "principal_name": principal.full_name if principal else "",
                "clients_served": len(client_ids), "service_types": len(service_types),
                "days_by_client": ", ".join(
                    f"{client_by_id[cid].name if cid in client_by_id else 'Unknown'}:{d}d"
                    for cid, d in list(days_by_client.items())[:3]
                ),
                "exposure_diversity_score": exposure_score,
                "leave_days_taken": leave_days_by_article.get(art.id, 0),
                "leave_entitlement_days": art.leave_entitlement_days,
                "form_103_filed": bool(art.icai_form_103_date), "form_108_filed": bool(art.icai_form_108_date),
            }
        )
    return rows


# ------------------------------------------------------------------ RP-09 --

def leave_and_absence(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-09: staff, type, days, balance, conflicts caused."""
    staff_by_id = _staff_lookup(db)

    stmt = (
        select(NonAvailability)
        .where(NonAvailability.is_active == True)  # noqa: E712
        .where(NonAvailability.date_from <= date_to.isoformat())
        .where(NonAvailability.date_to >= date_from.isoformat())
    )
    leaves = list(db.exec(stmt).all())
    if f.office_id or f.department_id or f.staff_category:
        leaves = [
            lv for lv in leaves
            if (staff := staff_by_id.get(lv.staff_id)) is not None
            and (not f.office_id or staff.base_office_id == f.office_id)
            and (not f.department_id or staff.primary_department_id == f.department_id)
            and (not f.staff_category or staff.staff_category == f.staff_category)
        ]

    rows = []
    for lv in leaves:
        staff = staff_by_id.get(lv.staff_id)
        if staff is None:
            continue
        days = _overlap_days(lv.date_from, lv.date_to, date_from, date_to)
        conflicts = 0
        if lv.status == "APPROVED":
            overlapping = db.exec(
                select(Allocation)
                .where(Allocation.staff_id == lv.staff_id)
                .where(Allocation.is_active == True)  # noqa: E712
                .where(Allocation.status.in_(["CONFIRMED", "IN_PROGRESS"]))  # type: ignore[attr-defined]
                .where(Allocation.date_from <= lv.date_to)
                .where(Allocation.date_to >= lv.date_from)
            ).all()
            conflicts = len(overlapping)
        rows.append(
            {
                "staff_name": staff.full_name, "employee_code": staff.employee_code, "type": lv.type,
                "date_from": lv.date_from, "date_to": lv.date_to, "days": days, "status": lv.status,
                "leave_entitlement_days": staff.leave_entitlement_days, "conflicts_caused": conflicts,
            }
        )
    return rows


# ------------------------------------------------------------------ RP-13 --

def independence_and_rotation_report(db: Session, date_from: date, date_to: date, f: ReportFilters) -> list[dict]:
    """RP-13: client, EP, EP tenure, rotation due FY, EQCR, open conflicts, declaration status (§4 R5/R8/R24, §9.4).

    One row per active engagement whose period overlaps the filter window —
    the same "as of this window" convention as the other RP reports, even
    though rotation/independence are point-in-time facts rather than a
    date-ranged metric, so a partner meeting can filter it alongside
    everything else in the library.
    """
    staff_by_id = _staff_lookup(db)
    from app.models.allocation import IndependenceDeclaration

    eng_stmt = select(Engagement, Client).join(Client, Engagement.client_id == Client.id).where(Engagement.is_active == True)  # noqa: E712
    if f.department_id:
        eng_stmt = eng_stmt.where(Engagement.department_id == f.department_id)
    if f.partner_id:
        eng_stmt = eng_stmt.where(Engagement.engagement_partner_id == f.partner_id)
    if f.client_group_id:
        eng_stmt = eng_stmt.where(Client.group_id == f.client_group_id)
    if f.status:
        eng_stmt = eng_stmt.where(Engagement.status == f.status)

    engagements = list(db.exec(eng_stmt).all())
    if not engagements:
        return []

    declarations = list(db.exec(select(IndependenceDeclaration).where(IndependenceDeclaration.is_active == True)).all())  # noqa: E712
    decls_by_client: dict[uuid.UUID, list[IndependenceDeclaration]] = defaultdict(list)
    for d in declarations:
        decls_by_client[d.client_id].append(d)

    def _fy_start_year(fy: str | None) -> int | None:
        # "FY2026-27" -> 2026
        if not fy or len(fy) < 6:
            return None
        try:
            return int(fy[2:6])
        except ValueError:
            return None

    rows = []
    for engagement, client in engagements:
        partner = staff_by_id.get(engagement.engagement_partner_id) if engagement.engagement_partner_id else None
        eqcr = staff_by_id.get(engagement.eqcr_partner_id) if engagement.eqcr_partner_id else None

        fy_start = _fy_start_year(engagement.financial_year)
        ep_tenure_years = (
            fy_start - engagement.first_year_of_appointment
            if fy_start is not None and engagement.first_year_of_appointment is not None
            else None
        )

        client_ids = {client.id}
        if client.group_id:
            client_ids |= {c.id for c in db.exec(select(Client).where(Client.group_id == client.group_id)).all()}
        relevant_decls = [d for cid in client_ids for d in decls_by_client.get(cid, [])]
        open_conflicts = sum(1 for d in relevant_decls if d.is_conflicted)

        ep_decl = next(
            (d for d in relevant_decls if partner and d.staff_id == partner.id and d.declaration_fy == engagement.financial_year),
            None,
        )
        if ep_decl is None:
            declaration_status = "Not Filed"
        elif ep_decl.reviewed_by:
            declaration_status = "Reviewed"
        else:
            declaration_status = "Pending Review"

        rows.append(
            {
                "client_name": client.name, "engagement_code": engagement.engagement_code,
                "ep_name": partner.full_name if partner else "",
                "ep_tenure_years": ep_tenure_years,
                "ep_rotation_due_fy": engagement.ep_rotation_due_fy,
                "firm_rotation_due_fy": engagement.rotation_due_fy,
                "eqcr_name": eqcr.full_name if eqcr else "",
                "open_conflicts": open_conflicts,
                "declaration_status": declaration_status,
                "is_pie": client.is_pie,
            }
        )
    return rows
