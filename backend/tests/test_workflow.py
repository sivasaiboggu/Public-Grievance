import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import AuthSession, Complaint, Role, StatusEvent
from app.security import token_digest

API = "/api/v1"


def payload():
    return {
        "client_request_id": str(uuid.uuid4()),
        "title": "Pothole beside college gate",
        "description": "A visible pothole is obstructing the left side of the public road.",
        "category": "road_damage",
        "latitude": 9.85,
        "longitude": 76.9,
        "location_text": "Outside the college main gate",
        "location_source": "manual",
    }


def submit(client, headers, data=None):
    response = client.post(f"{API}/complaints", json=data or payload(), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def jpeg():
    stream = io.BytesIO()
    Image.new("RGB", (40, 30), "gray").save(stream, "JPEG")
    return stream.getvalue()


def test_manual_journey_without_ai(client, account):
    citizen, gro = account(), account(Role.GRO)
    record = submit(client, citizen)
    tracking = record["tracking_id"]
    assert tracking.startswith("GG-") and record["analysis_state"] == "disabled"
    assert record["status"] == "submitted" and len(record["events"]) == 1
    received_at = record["received_at"]
    queue = client.get(f"{API}/complaints", headers=gro).json()
    assert queue["total"] == 1
    for status in ("under_review", "in_progress", "resolved"):
        response = client.post(
            f"{API}/complaints/{tracking}/status",
            headers=gro,
            json={
                "status": status,
                "note": f"Officer has recorded status: {status}.",
                "expected_version": record["version"],
            },
        )
        assert response.status_code == 200, response.text
        record = response.json()
    final = client.get(f"{API}/complaints/{tracking}", headers=citizen).json()
    assert final["status"] == "resolved" and len(final["events"]) == 4
    assert final["received_at"] == received_at


def test_citizens_cannot_access_each_others_records(client, account):
    first, second = account(), account()
    tracking = submit(client, first)["tracking_id"]
    assert client.get(f"{API}/complaints/{tracking}", headers=second).status_code == 404
    assert client.get(f"{API}/complaints", headers=second).json()["total"] == 0
    assert client.get(f"{API}/complaints/{tracking}").status_code == 401


def test_officer_jurisdiction_is_enforced(client, account):
    tracking = submit(client, account())["tracking_id"]
    other = account(Role.GRO, "other-municipality")
    assert client.get(f"{API}/complaints/{tracking}", headers=other).status_code == 404
    assert client.get(f"{API}/complaints", headers=other).json()["total"] == 0
    assert (
        client.post(
            f"{API}/complaints/{tracking}/status",
            headers=other,
            json={
                "status": "under_review",
                "note": "Should not be accepted",
                "expected_version": 1,
            },
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "role", [Role.CITIZEN, Role.ADMIN, Role.SUPERVISOR, Role.FIELD_OFFICER, Role.APPELLATE_OFFICER]
)
def test_only_gro_can_make_disposal_decisions(client, account, role):
    citizen = account()
    record = submit(client, citizen)
    actor = citizen if role == Role.CITIZEN else account(role)
    result = client.post(
        f"{API}/complaints/{record['tracking_id']}/status",
        headers=actor,
        json={
            "status": "under_review",
            "note": "A status update with a reason",
            "expected_version": 1,
        },
    )
    assert result.status_code == 403


def test_stale_update_does_not_overwrite_or_append_event(client, account, db_factory):
    record = submit(client, account())
    gro = account(Role.GRO)
    url = f"{API}/complaints/{record['tracking_id']}/status"
    data = {"status": "under_review", "note": "Accepted for manual review", "expected_version": 1}
    assert client.post(url, headers=gro, json=data).status_code == 200
    assert client.post(url, headers=gro, json=data).status_code == 409
    with db_factory() as db:
        assert len(list(db.scalars(select(StatusEvent)))) == 2


def test_invalid_transition_and_short_notes_rejected(client, account):
    record = submit(client, account())
    gro = account(Role.GRO)
    url = f"{API}/complaints/{record['tracking_id']}/status"
    for data in (
        {"status": "resolved", "note": "No inspection yet", "expected_version": 1},
        {"status": "under_review", "note": "ok", "expected_version": 1},
    ):
        assert client.post(url, headers=gro, json=data).status_code == 422


def test_submission_retries_keep_one_tracking_id(client, account, db_factory):
    citizen = account()
    data = payload()
    first, second = submit(client, citizen, data), submit(client, citizen, data)
    assert first["tracking_id"] == second["tracking_id"]
    with db_factory() as db:
        assert len(list(db.scalars(select(Complaint)))) == 1
    data["title"] = "Different problem after retry"
    assert client.post(f"{API}/complaints", headers=citizen, json=data).status_code == 409


@pytest.mark.parametrize(
    "field,value",
    [
        ("category", "electricity"),
        ("latitude", 95),
        ("longitude", -190),
        ("description", "short"),
        ("title", "   "),
        ("location_source", "invented"),
    ],
)
def test_invalid_complaints_rejected(client, account, field, value):
    data = payload()
    data[field] = value
    assert client.post(f"{API}/complaints", headers=account(), json=data).status_code == 422


def test_public_cannot_self_assign_officer_role(client):
    result = client.post(
        f"{API}/auth/register",
        json={
            "email": "attacker@example.com",
            "name": "Example",
            "password": "a-long-password",
            "role": "gro",
        },
    )
    assert result.status_code == 422


def test_logout_and_expiry_revoke_access(client, account, db_factory):
    headers = account()
    assert client.post(f"{API}/auth/logout", headers=headers).status_code == 204
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401
    headers = account()
    with db_factory() as db:
        token = headers["Authorization"].removeprefix("Bearer ")
        session = db.get(AuthSession, token_digest(token))
        session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401


def test_password_whitespace_is_significant(client):
    password = "  long-password-with-spaces  "
    data = {"email": "spaces@example.com", "password": password}
    assert (
        client.post(f"{API}/auth/register", json={**data, "name": "Test account"}).status_code
        == 201
    )
    assert client.post(f"{API}/auth/login", json=data).status_code == 200
    assert (
        client.post(f"{API}/auth/login", json={**data, "password": password.strip()}).status_code
        == 401
    )


def test_evidence_is_private_and_duplicate_upload_is_idempotent(client, account):
    citizen, other = account(), account()
    record = submit(client, citizen)
    url = f"{API}/complaints/{record['tracking_id']}/evidence"
    result = client.post(url, headers=citizen, files={"file": ("photo.jpg", jpeg(), "image/jpeg")})
    assert result.status_code == 201, result.text
    evidence = result.json()
    repeat = client.post(url, headers=citizen, files={"file": ("photo.jpg", jpeg(), "image/jpeg")})
    assert repeat.json()["id"] == evidence["id"]
    assert "object_key" not in evidence
    download = client.get(f"{url}/{evidence['id']}", headers=citizen)
    assert download.status_code == 200 and download.headers["cache-control"] == "no-store"
    assert client.get(f"{url}/{evidence['id']}", headers=other).status_code == 404
    assert client.get(f"{url}/{evidence['id']}").status_code == 401


def test_invalid_upload_does_not_lose_complaint(client, account):
    citizen = account()
    tracking = submit(client, citizen)["tracking_id"]
    result = client.post(
        f"{API}/complaints/{tracking}/evidence",
        headers=citizen,
        files={"file": ("fake.png", b"not-a-picture", "image/png")},
    )
    assert result.status_code == 422
    assert (
        client.get(f"{API}/complaints/{tracking}", headers=citizen).json()["status"] == "submitted"
    )


def test_pagination_filter_and_guards(client, account):
    citizen = account()
    for _ in range(3):
        submit(client, citizen)
    result = client.get(f"{API}/complaints?limit=2&offset=2&status=submitted", headers=citizen)
    assert result.json()["total"] == 3 and len(result.json()["items"]) == 1
    assert client.get(f"{API}/complaints?limit=500", headers=citizen).status_code == 422
    assert client.get("/ready").status_code == 200
    assert client.get(f"{API}/config").json()["analysis_state"] == "disabled"


def test_photo_access_and_signed_urls_across_roles(client, account):
    citizen = account()
    record = submit(client, citizen)
    tracking = record["tracking_id"]
    upload = client.post(
        f"{API}/complaints/{tracking}/evidence",
        headers=citizen,
        files={"file": ("evidence.jpg", jpeg(), "image/jpeg")},
    )
    assert upload.status_code == 201
    evidence_id = upload.json()["id"]

    # 1. Citizen generates signed URL
    signed_res = client.get(f"{API}/complaints/{tracking}/evidence/{evidence_id}/signed-url", headers=citizen)
    assert signed_res.status_code == 200
    signed_data = signed_res.json()
    signed_url = signed_data["signed_url"]

    # 2. Browser loads signed URL with NO Authorization header
    img_res = client.get(signed_url)
    assert img_res.status_code == 200
    assert img_res.headers["content-type"] == "image/jpeg"

    # 3. Tampered signature is rejected
    tampered_url = signed_url.replace("sig=", "sig=invalid")
    assert client.get(tampered_url).status_code == 401

    # 4. Expired timestamp is rejected
    expired_url = signed_url.split("expires=")[0] + "expires=1000000000&sig=" + signed_url.split("&sig=")[1]
    assert client.get(expired_url).status_code == 401

    # 5. All staff roles in the same jurisdiction can generate signed URLs and view evidence
    for role in [Role.GRO, Role.FIELD_OFFICER, Role.SUPERVISOR, Role.ADMIN]:
        staff_headers = account(role)
        staff_signed = client.get(
            f"{API}/complaints/{tracking}/evidence/{evidence_id}/signed-url",
            headers=staff_headers,
        )
        assert staff_signed.status_code == 200, f"Role {role} failed to get signed URL: {staff_signed.text}"
        staff_img = client.get(staff_signed.json()["signed_url"])
        assert staff_img.status_code == 200, f"Role {role} failed to download image"

    # 6. Unrelated citizen cannot access
    other_citizen = account()
    assert client.get(
        f"{API}/complaints/{tracking}/evidence/{evidence_id}/signed-url",
        headers=other_citizen,
    ).status_code == 404

    # 7. Staff from different jurisdiction cannot access
    other_gro = account(Role.GRO, "different-municipality")
    assert client.get(
        f"{API}/complaints/{tracking}/evidence/{evidence_id}/signed-url",
        headers=other_gro,
    ).status_code == 404
