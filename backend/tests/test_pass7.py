from datetime import UTC, datetime, timedelta
import pytest
from app.models import Notification, Role, User
from app.notifications import create_notification


def test_notifications_sync_creation_and_unread_count(client, account, db_factory):
    # Citizen account created and logged in
    citizen_headers = account(Role.CITIZEN)

    with db_factory() as db:
        citizen = db.query(User).filter(User.role == Role.CITIZEN).first()
        assert citizen is not None

        # Synchronous outbox notification creation
        notif = create_notification(
            db,
            user_id=citizen.id,
            title="Report update",
            body="Your report GG-2026-TEST is being reviewed.",
            complaint_id="comp-123",
        )
        assert notif.id is not None
        db.commit()

    # Check unread count endpoint
    res = client.get(
        "/api/v1/notifications/unread-count",
        headers=citizen_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "unread_count" in data
    assert data["unread_count"] >= 1


def test_senior_people_and_reports_endpoints(client, account):
    # Setup senior authority user
    senior_headers = account(Role.SUPERVISOR)

    # 1. GET /senior/people
    res = client.get("/api/v1/senior/people?period=30d", headers=senior_headers)
    assert res.status_code == 200
    people = res.json()
    assert isinstance(people, list)

    # 2. GET /senior/reports
    res = client.get("/api/v1/senior/reports?limit=10", headers=senior_headers)
    assert res.status_code == 200
    reports = res.json()
    assert "items" in reports
    assert "total" in reports

    # 3. Citizen cannot access senior endpoints (Role Guard)
    citizen_headers = account(Role.CITIZEN)
    res = client.get("/api/v1/senior/people", headers=citizen_headers)
    assert res.status_code == 403


def test_worker_not_required_for_in_app_notifications(account, db_factory):
    """Proves that in-app notifications are written synchronously in the same DB transaction without Celery or Redis."""
    account(Role.CITIZEN)
    with db_factory() as db:
        citizen = db.query(User).filter(User.role == Role.CITIZEN).first()
        initial_count = db.query(Notification).filter(Notification.user_id == citizen.id).count()

        create_notification(
            db,
            user_id=citizen.id,
            title="Direct in-app notification",
            body="Independent of Celery worker.",
            complaint_id="comp-456",
        )
        db.commit()

        new_count = db.query(Notification).filter(Notification.user_id == citizen.id).count()
        assert new_count == initial_count + 1
