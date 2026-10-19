import io
import uuid
from datetime import UTC, datetime, timedelta

from PIL import Image
import pytest

from app.models import Assignment, CategoryRecord, Complaint, ComplaintStatus, Evidence, Role, Team, User

API = "/api/v1"


def make_test_jpeg(color=(100, 150, 200)):
    img = Image.new("RGB", (100, 100), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_category_photo_rule(client, account):
    admin = account(Role.ADMIN)

    # Admin creates category with photo_rule
    res = client.post(
        f"{API}/admin/categories",
        headers=admin,
        json={
            "code": "water_supply_test",
            "label": "Water Supply Test",
            "description": "Pipeline leakage test",
            "target_hours": 24,
            "icon": "Waves",
            "photo_rule": "required",
            "active": True,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["photo_rule"] == "required"

    # Public category listing returns photo_rule
    pub_res = client.get(f"{API}/categories")
    assert pub_res.status_code == 200
    cats = pub_res.json()
    found = next((c for c in cats if c["code"] == "water_supply_test"), None)
    assert found is not None
    assert found["photo_rule"] == "required"


def test_field_progress_requires_after_photo_for_fixed(client, account, db_factory):
    citizen = account(Role.CITIZEN)
    officer = account(Role.GRO)
    field_worker = account(Role.FIELD_OFFICER)

    # Create complaint
    with db_factory() as db:
        citizen_user = db.query(User).filter(User.role == Role.CITIZEN).first()
        field_user = db.query(User).filter(User.role == Role.FIELD_OFFICER).first()
        gro_user = db.query(User).filter(User.role == Role.GRO).first()

        c = Complaint(
            id=str(uuid.uuid4()),
            tracking_id="GG-2026-TESTP6A",
            citizen_id=citizen_user.id,
            client_request_id="test-p6-a",
            request_hash="hash-p6-a",
            jurisdiction_id="demo-municipality",
            title="Pothole in Fort Kochi test",
            description="Detailed description for testing field progress",
            category="road_damage",
            latitude=9.965,
            longitude=76.242,
            location_text="Fort Kochi",
            area_name="Fort Kochi",
            status=ComplaintStatus.UNDER_REVIEW,
            received_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(c)
        db.flush()

        db.add(Assignment(
            id=str(uuid.uuid4()),
            complaint_id=c.id,
            assigned_by_id=gro_user.id,
            assigned_to_id=field_user.id,
            status="assigned",
            notes="Please repair promptly",
            assigned_at=datetime.now(UTC),
        ))
        db.commit()
        complaint_id = c.id

    # Field worker attempts to mark fixed WITHOUT after photo -> must fail with 422
    fail_res = client.post(
        f"{API}/field/tasks/{complaint_id}/progress",
        headers=field_worker,
        data={"status": "fixed", "note": "Completed without photo"},
    )
    assert fail_res.status_code == 422
    assert "after photo" in fail_res.json()["detail"].lower()

    # Field worker marks started with before photo -> succeeds
    before_img = make_test_jpeg()
    start_res = client.post(
        f"{API}/field/tasks/{complaint_id}/progress",
        headers=field_worker,
        data={"status": "started", "note": "Work initiated on site"},
        files={"before_photo": ("before.jpg", before_img, "image/jpeg")},
    )
    assert start_res.status_code == 200
    assert start_res.json()["complaint_status"] == "in_progress"

    # Field worker marks fixed WITH after photo -> succeeds
    after_img = make_test_jpeg((50, 200, 80))
    fix_res = client.post(
        f"{API}/field/tasks/{complaint_id}/progress",
        headers=field_worker,
        data={"status": "fixed", "note": "Asphalt laid flush and compacted"},
        files={"after_photo": ("after.jpg", after_img, "image/jpeg")},
    )
    assert fix_res.status_code == 200
    assert fix_res.json()["complaint_status"] == "resolved"

    # Verify photos recorded with correct phase in complaint detail
    detail_res = client.get(f"{API}/complaints/{c.tracking_id}", headers=officer)
    assert detail_res.status_code == 200
    evidence_list = detail_res.json().get("evidence", [])
    phases = [e.get("phase") for e in evidence_list]
    assert "before" in phases
    assert "after" in phases
