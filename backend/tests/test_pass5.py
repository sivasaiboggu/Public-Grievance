import io
import uuid
from datetime import UTC, datetime, timedelta

from PIL import Image
import pytest

from app.models import CategoryRecord, Role, Team, User
from app.worker.tasks import process_report_photo, send_email

API = "/api/v1"


def test_rotating_refresh_tokens_and_reuse_detection(client, account):
    # Citizen account created and logged in
    citizen_headers = account()

    # Citizen signs in again to get fresh credentials and refresh token
    res = client.post(
        f"{API}/auth/login",
        json={"email": "user1@example.com", "password": "a-long-test-password"},
    )
    assert res.status_code == 200
    token1 = res.json()["refresh_token"]
    assert token1 is not None

    # Silent refresh with valid refresh token
    refresh_res = client.post(
        f"{API}/auth/refresh",
        json={"refresh_token": token1},
    )
    assert refresh_res.status_code == 200
    data = refresh_res.json()
    token2 = data["refresh_token"]
    assert token2 != token1

    # REUSE DETECTION: Using the old token1 again must trigger immediate compromise revocation!
    reuse_res = client.post(
        f"{API}/auth/refresh",
        json={"refresh_token": token1},
    )
    assert reuse_res.status_code == 401
    assert "compromised" in reuse_res.json()["detail"].lower()

    # Even the active token2 must now be revoked because the entire family was compromised!
    token2_res = client.post(
        f"{API}/auth/refresh",
        json={"refresh_token": token2},
    )
    assert token2_res.status_code == 401


def test_admin_category_management(client, account):
    admin = account(Role.ADMIN)
    gro = account(Role.GRO)

    # GRO cannot access admin categories
    gro_res = client.get(f"{API}/admin/categories", headers=gro)
    assert gro_res.status_code == 403

    # Admin can list categories
    admin_res = client.get(f"{API}/admin/categories", headers=admin)
    assert admin_res.status_code == 200

    # Admin creates new category
    new_cat = {
        "code": "street_lighting",
        "label": "Street Lighting",
        "description": "Broken or flickering street lights in public spaces.",
        "target_hours": 48,
        "icon": "Sun",
        "active": True,
    }
    create_res = client.post(f"{API}/admin/categories", headers=admin, json=new_cat)
    assert create_res.status_code == 201
    cat_id = create_res.json()["id"]

    # Toggle category active state
    toggle_res = client.patch(f"{API}/admin/categories/{cat_id}/toggle", headers=admin)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["active"] is False


def test_staff_invite_and_acceptance(client, account, db_factory):
    admin = account(Role.ADMIN)

    # Admin invites field officer
    invite_res = client.post(
        f"{API}/admin/users/invite",
        headers=admin,
        json={
            "name": "Ravi Menon",
            "email": "ravi.menon@example.com",
            "role": "field_officer",
        },
    )
    assert invite_res.status_code == 201
    invite_token = invite_res.json()["invite_token"]
    assert invite_token is not None

    # Field officer accepts invite and sets their password
    accept_res = client.post(
        f"{API}/auth/accept-invite",
        json={
            "token": invite_token,
            "new_password": "secure-staff-password-123",
        },
    )
    assert accept_res.status_code == 200

    # Field officer can now sign in
    login_res = client.post(
        f"{API}/auth/login",
        json={
            "email": "ravi.menon@example.com",
            "password": "secure-staff-password-123",
        },
    )
    assert login_res.status_code == 200
    assert login_res.json()["user"]["role"] == "field_officer"


def test_disabled_user_instant_signout(client, account, db_factory):
    admin = account(Role.ADMIN)
    gro = account(Role.GRO)

    # Get GRO user id
    me_res = client.get(f"{API}/auth/me", headers=gro)
    gro_id = me_res.json()["id"]

    # Admin disables GRO account
    disable_res = client.post(
        f"{API}/admin/users/{gro_id}/status",
        headers=admin,
        json={"status": "disabled"},
    )
    assert disable_res.status_code == 200

    # GRO next request immediately rejected
    next_req = client.get(f"{API}/complaints", headers=gro)
    assert next_req.status_code == 401


def test_senior_metrics_and_csv_export(client, account):
    senior = account(Role.SUPERVISOR)
    citizen = account(Role.CITIZEN)

    # Citizen cannot access senior metrics
    cit_res = client.get(f"{API}/metrics/overview", headers=citizen)
    assert cit_res.status_code == 403

    # Senior can access overview
    overview_res = client.get(f"{API}/metrics/overview?days=30", headers=senior)
    assert overview_res.status_code == 200
    data = overview_res.json()
    assert "summary" in data
    assert "daily_counts" in data
    assert "category_breakdown" in data
    assert "hotspots" in data
    assert "teams_stats" in data

    # Senior can export CSV
    csv_res = client.get(f"{API}/metrics/export?days=30", headers=senior)
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "Tracking ID,Category,Title" in csv_res.text
