from datetime import UTC, datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Complaint, Notification, StatusEvent, User, new_id
from app.security import CurrentUser, Database

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    id: str
    complaint_id: str | None = None
    title: str
    body: str
    message: str
    link: str | None
    read: bool
    created_at: str


def create_notification(
    db: Session,
    user_id: str,
    title: str,
    body: str,
    complaint_id: str | None = None,
    link: str | None = None,
) -> Notification:
    """Create an in-app notification synchronously in the active database session."""
    notif = Notification(
        id=new_id(),
        user_id=user_id,
        title=title,
        body=body,
        link=link or (f"/citizen/reports/{complaint_id}" if complaint_id else None),
        read=False,
        created_at=datetime.now(UTC),
    )
    db.add(notif)
    
    # Broadcast event in real-time
    try:
        from app.events import dispatch_event
        dispatch_event(
            event_type="notification.created",
            data={
                "id": notif.id,
                "title": notif.title,
                "body": notif.body,
                "link": notif.link,
                "complaint_id": complaint_id,
                "created_at": notif.created_at.isoformat(),
            },
            user_ids=[user_id],
            event_id=notif.id,
        )
    except Exception:
        pass

    return notif


@router.get("/unread-count")
def get_unread_count(user: CurrentUser, db: Database):
    """Fast endpoint to poll unread count for the notification bell."""
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)
    ) or 0
    return {"unread_count": count}


@router.get("")
def list_notifications(user: CurrentUser, db: Database) -> list[NotificationOut]:
    """Retrieve up to 50 notifications for the current user."""
    items = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.read.asc(), Notification.created_at.desc())
            .limit(50)
        )
    )
    result = []
    for n in items:
        # Extract complaint tracking_id from link if possible
        cid = None
        if n.link and "reports/" in n.link:
            cid = n.link.split("reports/")[-1].strip()
        result.append(
            NotificationOut(
                id=n.id,
                complaint_id=cid,
                title=n.title,
                body=n.body,
                message=n.body,
                link=n.link,
                read=n.read,
                created_at=n.created_at.isoformat() if n.created_at else "",
            )
        )
    return result


@router.post("/{notification_id}/read")
def mark_notification_read(notification_id: str, user: CurrentUser, db: Database):
    """Mark a single notification as read."""
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read = True
    db.commit()
    return {"message": "Notification marked as read", "id": n.id}


@router.post("/read-all")
def mark_all_notifications_read(user: CurrentUser, db: Database):
    """Mark all notifications as read for current user."""
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read == False).update({"read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/backfill")
def backfill_report_notifications(user: CurrentUser, db: Database):
    """Backfills notifications for existing reports so current users have activity."""
    count = backfill_notifications(db)
    return {"message": f"Backfilled {count} notifications"}


def backfill_notifications(db: Session) -> int:
    """Creates initial notifications for existing complaints so test accounts have realistic history."""
    complaints = db.scalars(select(Complaint)).all()
    count = 0
    for c in complaints:
        existing = db.scalar(
            select(Notification).where(
                Notification.user_id == c.citizen_id,
                Notification.link.like(f"%{c.tracking_id}%"),
            )
        )
        if not existing:
            msg = {
                "submitted": f"Your report {c.tracking_id} was received.",
                "under_review": f"Your report {c.tracking_id} is being reviewed.",
                "in_progress": f"Work has started on {c.tracking_id}.",
                "resolved": f"Your report {c.tracking_id} is fixed. You can reopen it if it is not.",
                "rejected": f"Your report {c.tracking_id} was not accepted.",
            }.get(c.status, f"Update on {c.tracking_id}.")

            n = Notification(
                id=new_id(),
                user_id=c.citizen_id,
                title=f"Report {c.tracking_id}",
                body=msg,
                link=f"/citizen/reports/{c.tracking_id}",
                read=c.status == "resolved",
                created_at=c.received_at or datetime.now(UTC),
            )
            db.add(n)
            count += 1
    db.commit()
    return count
