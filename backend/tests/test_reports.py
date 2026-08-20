"""P7: report library RP-01..RP-09 — smoke coverage for every report's JSON/
xlsx/pdf endpoints, plus a couple of targeted correctness checks."""
from app.models.enums import UserRole
from seed.seed_data import seed
from tests.conftest import auth_headers, make_user

REPORT_KEYS = [f"rp0{i}" for i in range(1, 10)]


def test_list_reports(client, session):
    make_user(session, UserRole.RESOURCE_MANAGER, email="rep0@x.com")
    headers = auth_headers(client, "rep0@x.com")
    resp = client.get("/api/v1/reports", headers=headers)
    assert resp.status_code == 200
    keys = {r["key"] for r in resp.json()}
    assert keys == set(REPORT_KEYS)


def test_every_report_json_xlsx_pdf_smoke(client, session):
    seed(session)
    make_user(session, UserRole.RESOURCE_MANAGER, email="rep1@x.com")
    headers = auth_headers(client, "rep1@x.com")
    params = {"date_from": "2026-04-01", "date_to": "2026-06-30"}

    for key in REPORT_KEYS:
        json_resp = client.get(f"/api/v1/reports/{key}", headers=headers, params=params)
        assert json_resp.status_code == 200, f"{key}: {json_resp.text}"
        assert isinstance(json_resp.json(), list)

        xlsx_resp = client.get(f"/api/v1/reports/{key}/export.xlsx", headers=headers, params=params)
        assert xlsx_resp.status_code == 200, f"{key} xlsx: {xlsx_resp.text}"
        assert xlsx_resp.headers["content-type"].startswith("application/vnd.openxmlformats")
        assert len(xlsx_resp.content) > 0

        pdf_resp = client.get(f"/api/v1/reports/{key}/export.pdf", headers=headers, params=params)
        assert pdf_resp.status_code == 200, f"{key} pdf: {pdf_resp.text}"
        assert pdf_resp.headers["content-type"] == "application/pdf"
        assert pdf_resp.content[:4] == b"%PDF"


def test_rp01_deployment_register_has_rows(client, session):
    seed(session)
    make_user(session, UserRole.RESOURCE_MANAGER, email="rep2@x.com")
    headers = auth_headers(client, "rep2@x.com")
    resp = client.get(
        "/api/v1/reports/rp01", headers=headers,
        params={"date_from": "2026-04-01", "date_to": "2026-06-30"},
    )
    body = resp.json()
    assert len(body) > 0
    row = body[0]
    assert set(["staff_name", "engagement_code", "client_name", "role_on_engagement", "days"]).issubset(row.keys())


def test_rp03_matches_capacity_endpoint(client, session):
    from tests.factories import make_client, make_department, make_engagement, make_staff

    dept = make_department(session)
    cl = make_client(session)
    engagement = make_engagement(session, cl.id, dept.id)
    staff = make_staff(session, standard_hours_per_week=40)
    make_user(session, UserRole.RESOURCE_MANAGER, email="rep3@x.com")
    headers = auth_headers(client, "rep3@x.com")

    client.post(
        "/api/v1/allocations", headers=headers,
        json={
            "engagement_id": str(engagement.id), "staff_id": str(staff.id), "role_on_engagement": "TEAM_MEMBER",
            "date_from": "2026-09-07", "date_to": "2026-09-11", "allocation_pct": 100, "status": "CONFIRMED",
        },
    )
    params = {"date_from": "2026-09-07", "date_to": "2026-09-11"}
    rp03 = client.get("/api/v1/reports/rp03", headers=headers, params=params).json()
    capacity = client.get("/api/v1/capacity/utilisation", headers=headers, params=params).json()

    rp03_row = next(r for r in rp03 if r["full_name"] == staff.full_name)
    cap_row = next(r for r in capacity if r["staff_id"] == str(staff.id))
    assert rp03_row["allocated_hrs"] == cap_row["allocated_hrs"] == 40.0
    assert rp03_row["utilisation_pct"] == cap_row["utilisation_pct"] == 100.0


def test_rp07_surfaces_recorded_override(client, session):
    from tests.factories import make_client, make_department, make_engagement, make_staff

    dept = make_department(session)
    cl = make_client(session, is_pie=False)
    engagement = make_engagement(session, cl.id, dept.id, ep_rotation_due_fy="FY2025-26", financial_year="FY2026-27")
    partner = make_staff(session, staff_category="PARTNER", designation="PARTNER", grade_rank=2, icai_membership_no="777")
    make_user(session, UserRole.RESOURCE_MANAGER, email="rep4@x.com")
    headers = auth_headers(client, "rep4@x.com")

    client.post(
        "/api/v1/allocations", headers=headers,
        json={
            "engagement_id": str(engagement.id), "staff_id": str(partner.id), "role_on_engagement": "ENGAGEMENT_PARTNER",
            "date_from": "2026-09-01", "date_to": "2026-09-30", "allocation_pct": 100, "status": "CONFIRMED",
            "overrides": [{"code": "EP_ROTATION_DUE", "reason": "Interim continuation approved by MP."}],
        },
    )
    resp = client.get(
        "/api/v1/reports/rp07", headers=headers,
        params={"date_from": "2026-09-01", "date_to": "2026-09-30"},
    )
    body = resp.json()
    assert any(r["rule_code"] == "EP_ROTATION_DUE" and "MP" in r["reason"] for r in body)


def test_rp09_leave_conflict_count(client, session):
    from app.models.allocation import Allocation, NonAvailability
    from app.models.enums import AllocationRole, AllocationStatus
    from tests.factories import make_client, make_department, make_engagement, make_staff

    dept = make_department(session)
    cl = make_client(session)
    engagement = make_engagement(session, cl.id, dept.id)
    staff = make_staff(session)
    session.add(
        Allocation(
            engagement_id=engagement.id, staff_id=staff.id, role_on_engagement=AllocationRole.TEAM_MEMBER,
            date_from="2026-09-10", date_to="2026-09-12", allocation_pct=100, status=AllocationStatus.CONFIRMED,
        )
    )
    session.add(
        NonAvailability(staff_id=staff.id, type="PRIVILEGE_LEAVE", date_from="2026-09-11", date_to="2026-09-13", status="APPROVED")
    )
    session.commit()

    make_user(session, UserRole.RESOURCE_MANAGER, email="rep5@x.com")
    headers = auth_headers(client, "rep5@x.com")
    resp = client.get(
        "/api/v1/reports/rp09", headers=headers,
        params={"date_from": "2026-09-01", "date_to": "2026-09-30"},
    )
    row = next(r for r in resp.json() if r["staff_name"] == staff.full_name)
    assert row["conflicts_caused"] == 1
