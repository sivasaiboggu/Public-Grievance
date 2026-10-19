"""Compatibility shim for Celery application.
Re-exports the Celery instance from app.worker.celery_app so that
all CLI forms work seamlessly:
  - celery -A app.celery_app.celery worker
  - celery -A app.celery_app worker
  - celery -A app.worker.celery_app worker
"""
from app.worker.celery_app import celery_app

celery = celery_app
app = celery_app

__all__ = ["celery_app", "celery", "app"]
