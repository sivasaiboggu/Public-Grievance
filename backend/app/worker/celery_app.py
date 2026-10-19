from celery import Celery
from celery.schedules import crontab
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "grievancegrid_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker.tasks"],
)
celery = celery_app

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "check-overdue-every-15-mins": {
            "task": "app.worker.tasks.check_overdue_reports",
            "schedule": 900.0,
        },
        "check-escalations-every-10-mins": {
            "task": "app.worker.tasks.check_escalations",
            "schedule": 600.0,
        },
        "refresh-dashboard-every-5-mins": {
            "task": "app.worker.tasks.refresh_dashboard_stats",
            "schedule": 300.0,
        },
        "cleanup-expired-daily": {
            "task": "app.worker.tasks.cleanup_expired",
            "schedule": 86400.0,
        },
    },
)
