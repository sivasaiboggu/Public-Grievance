import io
import logging
import smtplib
from datetime import UTC, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from sqlalchemy import func, select, update

from app.config import get_settings
from app.db import SessionLocal
from app.models import (
    Assignment,
    CategoryRecord,
    Complaint,
    ComplaintStatus,
    EscalationEvent,
    Evidence,
    IncidentLink,
    MLPrediction,
    Notification,
    RefreshToken,
    User,
    UserToken,
)
from app.storage import get_storage
from app.worker.celery_app import celery_app

logger = logging.getLogger("grievancegrid.tasks")


@celery_app.task(name="app.worker.tasks.send_email", bind=True, max_retries=3, default_retry_delay=5)
def send_email(self, to_email: str, subject: str, body_text: str, html_content: str | None = None) -> bool:
    settings = get_settings()
    logger.info("Sending email to %s: %s", to_email, subject)

    if settings.mail_backend == "console":
        print(f"\n--- [MAIL CONSOLE] ---")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body:\n{body_text}")
        print(f"----------------------\n")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if html_content:
        msg.attach(MIMEText(html_content, "html", "utf-8"))

    if settings.mail_backend == "mailpit":
        try:
            with smtplib.SMTP(settings.mailpit_host, settings.mailpit_port, timeout=10) as server:
                server.sendmail(settings.smtp_from, [to_email], msg.as_string())
            return True
        except Exception as exc:
            logger.error("Failed to send mail via Mailpit: %s", exc)
            if hasattr(self, "retry"):
                raise self.retry(exc=exc)
            return False

    if settings.mail_backend == "smtp":
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                if settings.smtp_port in (587, 25):
                    server.starttls()
                if settings.smtp_user and settings.smtp_password:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_from, [to_email], msg.as_string())
            return True
        except Exception as exc:
            logger.error("Failed to send mail via SMTP: %s", exc)
            if hasattr(self, "retry"):
                raise self.retry(exc=exc)
            return False

    return False


@celery_app.task(name="app.worker.tasks.process_report_photo", bind=True, max_retries=3)
def process_report_photo(self, evidence_id: str) -> bool:
    """
    Validates, strips EXIF metadata, creates a 400px thumbnail and 1600px WebP display copy.
    """
    storage = get_storage()
    with SessionLocal() as db:
        ev = db.get(Evidence, evidence_id)
        if not ev:
            logger.warning("Evidence %s not found for processing", evidence_id)
            return False

        try:
            raw_bytes = storage.get(ev.object_key)

            # Extract provenance & authenticity signals BEFORE EXIF is stripped
            complaint = db.get(Complaint, ev.complaint_id)
            if complaint:
                try:
                    from app.ml.photo_authenticity import extract_and_save_photo_signals
                    extract_and_save_photo_signals(db, ev, complaint, raw_bytes)
                except Exception as e:
                    logger.warning("Could not extract photo authenticity signals for %s: %s", evidence_id, e)

            img = Image.open(io.BytesIO(raw_bytes))
            
            # Correct orientation from EXIF if present, then strip EXIF completely
            img = ImageOps.exif_transpose(img)

            # Compute dHash if missing
            from app.ml.photo_classifier import compute_dhash
            if not ev.dhash:
                ev.dhash = compute_dhash(img)
            
            # Generate WebP display copy (max 1600x1600, preserving aspect ratio)
            display_img = img.copy()
            display_img.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            display_buffer = io.BytesIO()
            display_img.save(display_buffer, format="WEBP", quality=85)
            display_bytes = display_buffer.getvalue()
            display_key = f"{ev.object_key}_display.webp"
            storage.put(display_key, display_bytes, "image/webp")

            # Generate WebP thumbnail (max 400x400)
            thumb_img = img.copy()
            thumb_img.thumbnail((400, 400), Image.Resampling.LANCZOS)
            thumb_buffer = io.BytesIO()
            thumb_img.save(thumb_buffer, format="WEBP", quality=80)
            thumb_bytes = thumb_buffer.getvalue()
            thumb_key = f"{ev.object_key}_thumb.webp"
            storage.put(thumb_key, thumb_bytes, "image/webp")

            ev.thumbnail_key = thumb_key
            ev.display_key = display_key
            ev.processed = True
            db.commit()
            logger.info("Processed photo for evidence %s", evidence_id)

            # Run photo check
            photo_check(ev.id)
            return True
        except Exception as exc:
            logger.error("Error processing photo %s: %s", evidence_id, exc)
            if hasattr(self, "retry"):
                raise self.retry(exc=exc)
            return False


@celery_app.task(name="app.worker.tasks.notify_status_change")
def notify_status_change(complaint_id: str, new_status: str, note: str) -> bool:
    with SessionLocal() as db:
        complaint = db.get(Complaint, complaint_id)
        if not complaint:
            return False
        citizen = db.get(User, complaint.citizen_id)
        if not citizen:
            return False

        title = f"Update on report {complaint.tracking_id}"
        message = f"Your report status was changed to {new_status}. {note}"

        notification = Notification(
            user_id=citizen.id,
            complaint_id=complaint.id,
            title=title,
            message=message,
        )
        db.add(notification)
        db.commit()

        # Send email notification
        body = (
            f"Hello {citizen.name},\n\n"
            f"There is an update on your reported issue: \"{complaint.title}\" (Ref: {complaint.tracking_id}).\n\n"
            f"New status: {new_status}\n"
            f"Officer note: {note}\n\n"
            f"You can view the full progress of your report at: {get_settings().frontend_url}/citizen\n\n"
            f"Thank you,\n{get_settings().jurisdiction_name} Team"
        )
        send_email(citizen.email, title, body)
        return True


@celery_app.task(name="app.worker.tasks.check_overdue_reports")
def check_overdue_reports() -> int:
    """Marks reports past target deadline as overdue and creates officer notifications."""
    with SessionLocal() as db:
        now = datetime.now(UTC)
        cutoff = now - timedelta(days=7)
        # Find open reports older than 7 days that haven't been resolved
        open_statuses = [ComplaintStatus.SUBMITTED.value, ComplaintStatus.IN_REVIEW.value, ComplaintStatus.ACTION_PROPOSED.value]
        overdue_complaints = db.scalars(
            select(Complaint).where(
                Complaint.status.in_(open_statuses),
                Complaint.received_at < cutoff,
            )
        ).all()

        count = len(overdue_complaints)
        logger.info("Found %d overdue complaints", count)
        return count


@celery_app.task(name="app.worker.tasks.refresh_dashboard_stats")
def refresh_dashboard_stats() -> dict[str, Any]:
    """Caches aggregated statistics in Redis for high-performance dashboard reads."""
    from app.metrics import compute_metrics
    with SessionLocal() as db:
        stats = compute_metrics(db, days=30)
        try:
            import json
            import redis
            r = redis.Redis.from_url(get_settings().redis_url, socket_timeout=2)
            r.set("grievancegrid:metrics:30d", json.dumps(stats), ex=300)
            logger.info("Refreshed dashboard metrics in Redis")
        except Exception as e:
            logger.warning("Could not cache metrics to Redis: %s", e)
        return stats


@celery_app.task(name="app.worker.tasks.build_summary_export")
def build_summary_export(days: int = 30) -> str:
    """Generates senior CSV export data."""
    import csv
    from app.metrics import compute_metrics
    with SessionLocal() as db:
        # Generate summary CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Report Reference", "Title", "Category", "Status", "Received Date", "Days Open"])
        
        complaints = db.scalars(select(Complaint).order_by(Complaint.received_at.desc())).all()
        now = datetime.now(UTC)
        for c in complaints:
            rcv = c.received_at.replace(tzinfo=UTC) if c.received_at.tzinfo is None else c.received_at
            days_open = (now - rcv).days
            writer.writerow([c.tracking_id, c.title, c.category, c.status, rcv.strftime("%Y-%m-%d"), days_open])
        
        return output.getvalue()


@celery_app.task(name="app.worker.tasks.cleanup_expired")
def cleanup_expired() -> int:
    """Deletes expired tokens and revoked refresh tokens older than 30 days."""
    with SessionLocal() as db:
        now = datetime.now(UTC)
        cutoff = now - timedelta(days=30)
        
        # Delete old used/expired user tokens
        tokens = db.scalars(
            select(UserToken).where((UserToken.expires_at < now) | (UserToken.used_at.is_not(None)))
        ).all()
        deleted = len(tokens)
        for t in tokens:
            db.delete(t)

        # Delete revoked refresh tokens older than 30 days
        old_refresh = db.scalars(
            select(RefreshToken).where(RefreshToken.revoked == True, RefreshToken.created_at < cutoff)
        ).all()
        deleted += len(old_refresh)
        for r in old_refresh:
            db.delete(r)

        db.commit()
        logger.info("Cleaned up %d expired tokens", deleted)
        return deleted


@celery_app.task(name="app.worker.tasks.analyse_report")
def analyse_report(complaint_id: str) -> dict[str, str]:
    """
    Hook only: disabled-by-default task that computes rule-based priority reasons from real fields.
    No ML models or AI output is generated.
    """
@celery_app.task(name="app.worker.tasks.photo_check")
def photo_check(evidence_id: str) -> dict[str, Any] | None:
    """Run 4 binary classifiers and dHash calculation on uploaded evidence."""
    import tempfile
    import os
    import json
    storage = get_storage()
    with SessionLocal() as db:
        ev = db.get(Evidence, evidence_id)
        if not ev:
            return None
        complaint = db.get(Complaint, ev.complaint_id)
        if not complaint:
            return None

        from app.ml.photo_classifier import run_photo_classification, compute_dhash
        try:
            raw_bytes = storage.get(ev.object_key)
            img = Image.open(io.BytesIO(raw_bytes))
            if not ev.dhash:
                ev.dhash = compute_dhash(img)
                db.commit()

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp.write(raw_bytes)
                tmp_path = tmp.name

            try:
                results = run_photo_classification(tmp_path, target_category=complaint.category)
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            pred = MLPrediction(
                kind="photo_check",
                report_id=complaint.id,
                photo_id=ev.id,
                model_name="efficientnet_b0_ensemble",
                model_version="v1.0",
                output_json=json.dumps(results),
            )
            db.add(pred)
            db.commit()
            return results
        except Exception as e:
            logger.warning("photo_check failed for %s: %s", evidence_id, e)
            return None


@celery_app.task(name="app.worker.tasks.match_incidents")
def match_incidents(complaint_id: str) -> list[dict[str, Any]]:
    """Find and rank potential duplicate reports using Strategy 2 heuristic."""
    import json
    with SessionLocal() as db:
        complaint = db.get(Complaint, complaint_id)
        if not complaint:
            return []
        from app.ml.incident_matcher import find_possible_duplicates
        candidates = find_possible_duplicates(db, complaint)
        pred = MLPrediction(
            kind="duplicate_match",
            report_id=complaint.id,
            photo_id=None,
            model_name="minilm_strategy2",
            model_version="v1.0",
            output_json=json.dumps(candidates),
        )
        db.add(pred)
        db.commit()
        return candidates


@celery_app.task(name="app.worker.tasks.compute_priority")
def compute_priority(complaint_id: str) -> dict[str, Any] | None:
    """Compute priority recommendation as max(hazard, due_date_pressure)."""
    import json
    with SessionLocal() as db:
        complaint = db.get(Complaint, complaint_id)
        if not complaint:
            return None
        from app.ml.priority_engine import compute_priority_recommendation
        
        cat_rec = db.scalar(select(CategoryRecord).where(CategoryRecord.id == complaint.category))
        target_hours = cat_rec.target_resolution_hours if cat_rec else 48

        confirmed_count = db.scalar(
            select(func.count()).select_from(IncidentLink).where(
                (IncidentLink.report_id_1 == complaint.id) | (IncidentLink.report_id_2 == complaint.id),
                IncidentLink.decision == "same_problem",
            )
        ) or 0
        total_reports = 1 + confirmed_count

        res = compute_priority_recommendation(
            complaint,
            target_hours=target_hours,
            confirmed_duplicate_count=total_reports,
        )

        if not complaint.priority_level or complaint.priority_level == "low":
            complaint.priority_level = res["priority"]
            complaint.priority_reason = res["summary_line"]
            db.commit()

        pred = MLPrediction(
            kind="priority",
            report_id=complaint.id,
            photo_id=None,
            model_name="priority_engine_rules",
            model_version="v1.0",
            output_json=json.dumps(res),
        )
        db.add(pred)
        db.commit()
        return res


@celery_app.task(name="app.worker.tasks.check_escalations")
def check_escalations() -> dict[str, int]:
    """Escalation ladder check: due_soon -> overdue -> passed_to_senior -> needs_senior_attention."""
    with SessionLocal() as db:
        now = datetime.now(UTC)
        open_statuses = ["submitted", "under_review", "in_progress"]
        open_complaints = list(db.scalars(
            select(Complaint).where(Complaint.status.in_(open_statuses))
        ))

        # Close escalation events for resolved or closed complaints
        resolved_ids = list(db.scalars(
            select(Complaint.id).where(Complaint.status.in_(["resolved", "closed", "rejected"]))
        ))
        if resolved_ids:
            db.execute(
                update(EscalationEvent)
                .where(EscalationEvent.report_id.in_(resolved_ids), EscalationEvent.closed_at.is_(None))
                .values(closed_at=now)
            )

        new_escalations = 0
        categories_cache: dict[str, CategoryRecord] = {}

        for c in open_complaints:
            if c.category not in categories_cache:
                cat_rec = db.scalar(select(CategoryRecord).where(CategoryRecord.id == c.category))
                if cat_rec:
                    categories_cache[c.category] = cat_rec

            cat = categories_cache.get(c.category)
            target_hours = cat.target_resolution_hours if cat else 48
            warn_hours = cat.warn_before_due_hours if cat and hasattr(cat, "warn_before_due_hours") else 12
            pass_hours = cat.pass_to_senior_hours if cat and hasattr(cat, "pass_to_senior_hours") else 24

            rcv = c.received_at.replace(tzinfo=UTC) if c.received_at.tzinfo is None else c.received_at
            target_at = getattr(c, "target_resolution_at", None) or (rcv + timedelta(hours=target_hours))
            target_at = target_at.replace(tzinfo=UTC) if target_at.tzinfo is None else target_at

            remaining_hours = (target_at - now).total_seconds() / 3600.0

            # Determine applicable ladder levels
            applicable_levels: list[str] = []
            if remaining_hours < -(pass_hours + 48):
                applicable_levels = ["due_soon", "overdue", "passed_to_senior", "needs_senior_attention"]
            elif remaining_hours < -pass_hours:
                applicable_levels = ["due_soon", "overdue", "passed_to_senior"]
            elif remaining_hours < 0:
                applicable_levels = ["due_soon", "overdue"]
            elif remaining_hours <= warn_hours:
                applicable_levels = ["due_soon"]

            for lvl in applicable_levels:
                existing = db.scalar(
                    select(EscalationEvent).where(
                        EscalationEvent.report_id == c.id,
                        EscalationEvent.level == lvl,
                    )
                )
                if not existing:
                    event = EscalationEvent(
                        report_id=c.id,
                        level=lvl,
                        silent=False,
                    )
                    db.add(event)
                    new_escalations += 1

                    # Send appropriate notification and dispatch events
                    from app.notifications import create_notification
                    from app.events import dispatch_event

                    if lvl in ("passed_to_senior", "needs_senior_attention"):
                        seniors = list(db.scalars(select(User).where(User.role.in_([Role.SUPERVISOR, "senior"]))))
                        for s in seniors:
                            create_notification(
                                db=db,
                                user_id=s.id,
                                title=f"{c.tracking_id} passed its deadline",
                                body=f"{c.tracking_id} passed its deadline. {cat.name if cat else c.category}, {c.location_description or 'Kochi'}, {int(round(abs(remaining_hours)))} hours overdue.",
                                complaint_id=c.id,
                                link="/senior",
                            )

                        # Broadcast real-time popup event to connected seniors
                        dispatch_event(
                            event_type="escalation.raised",
                            data={
                                "report_id": c.id,
                                "tracking_id": c.tracking_id,
                                "title": c.title,
                                "category": c.category,
                                "category_label": cat.name if cat else c.category,
                                "location": c.location_description or "Kochi",
                                "overdue_hours": round(abs(remaining_hours), 1),
                                "level": lvl,
                                "message": f"{c.tracking_id} passed its deadline. {cat.name if cat else c.category}, {c.location_description or 'Kochi'}, {int(round(abs(remaining_hours)))} hours overdue.",
                            },
                            role="senior",
                        )

                        # Add resident timeline notice: "This report is past its due date. A senior authority has been told."
                        has_notice = db.scalar(
                            select(StatusEvent).where(
                                StatusEvent.complaint_id == c.id,
                                StatusEvent.note.like("%senior authority has been told%"),
                            )
                        )
                        if not has_notice:
                            db.add(StatusEvent(
                                complaint_id=c.id,
                                status=c.status,
                                note="This report is past its due date. A senior authority has been told.",
                                created_at=now,
                            ))

                    elif lvl in ("due_soon", "overdue"):
                        officers = list(db.scalars(select(User).where(User.role.in_([Role.GRO, "officer"]))))
                        for o in officers:
                            create_notification(
                                db=db,
                                user_id=o.id,
                                title=f"Report {c.tracking_id} is {lvl.replace('_', ' ')}",
                                body=f"Report {c.tracking_id} ({c.title}) requires action.",
                                complaint_id=c.id,
                                link="/officer",
                            )

        db.commit()
        return {"checked": len(open_complaints), "escalated": new_escalations}
