from app.models.enums import UserRole
from tests.conftest import auth_headers, make_user


def test_login_success_and_me(client, session):
    make_user(session, UserRole.ADMIN, email="admin@x.com")
    headers = auth_headers(client, "admin@x.com")
    resp = client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "ADMIN"


def test_login_wrong_password(client, session):
    make_user(session, UserRole.ADMIN, email="admin2@x.com")
    resp = client.post("/api/v1/auth/login", json={"email": "admin2@x.com", "password": "wrong"})
    assert resp.status_code == 401


def test_unauthenticated_request_rejected(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_role_enforcement_403(client, session):
    make_user(session, UserRole.VIEWER, email="viewer@x.com")
    headers = auth_headers(client, "viewer@x.com")
    resp = client.post(
        "/api/v1/staff",
        headers=headers,
        json={
            "employee_code": "E1",
            "full_name": "A",
            "staff_category": "EMPLOYEE_CA",
            "designation": "ASSOCIATE",
            "grade_rank": 8,
        },
    )
    assert resp.status_code == 403
