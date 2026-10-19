"""CLI utility to advance complaint timestamps or simulate clock advancement for testing escalations."""

import argparse
from datetime import UTC, datetime, timedelta
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Complaint, EscalationEvent, Notification
from app.worker.tasks import check_escalations


def main():
    parser = argparse.ArgumentParser(description="Simulate passage of time on complaints to test escalations")
    parser.add_argument("--hours", type=float, default=36.0, help="Number of hours to push received_at backwards into the past")
    parser.add_argument("--tracking-id", type=str, default=None, help="Specific report tracking ID to simulate (optional)")
    args = parser.parse_args()

    with SessionLocal() as db:
        query = select(Complaint).where(Complaint.status.in_(["submitted", "under_review", "in_progress"]))
        if args.tracking_id:
            query = query.where(Complaint.tracking_id == args.tracking_id)
        complaints = list(db.scalars(query))
        if not complaints:
            print("No active open complaints found to adjust.")
            return

        print(f"Advancing time: shifting received_at back by {args.hours} hours on {len(complaints)} open reports...")
        delta = timedelta(hours=args.hours)
        for c in complaints:
            if c.received_at:
                c.received_at = c.received_at - delta

        db.commit()
        print("Adjusted timestamps. Now running escalation check ladder...")

    res = check_escalations()
    print(f"Escalation check complete! Checked: {res['checked']}, New Escalations Created: {res['escalated']}")

    with SessionLocal() as db:
        events = list(db.scalars(select(EscalationEvent).order_by(EscalationEvent.created_at.desc()).limit(10)))
        print("\nLatest Escalation Events in database:")
        for ev in events:
            print(f" - Report ID {ev.report_id}: Level = {ev.level}, Silent = {ev.silent}, Created At = {ev.created_at}")

        notifs = list(db.scalars(select(Notification).order_by(Notification.created_at.desc()).limit(5)))
        print("\nLatest Notifications generated:")
        for n in notifs:
            print(f" - User {n.user_id}: [{n.title}] {n.body}")


if __name__ == "__main__":
    main()
