"""
Celery app — ADM_2.0_BUILD_SPEC.md §0 Principle 3.
"API never executes agents inline. API enqueues Celery tasks; workers execute;
WebSocket/Redis pub-sub streams progress back."

Configuration:
  Broker:  CELERY_BROKER_URL (Redis)
  Backend: CELERY_RESULT_BACKEND (Redis)

Start workers:
  celery -A tasks.celery_app worker --loglevel=info --concurrency=4
"""

from __future__ import annotations

from celery import Celery
from config import settings

celery_app = Celery(
    "silvercraft",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.orchestration_tasks",
        "tasks.file_parse_task",
        "tasks.push_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Retry on common transient errors
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Result expiry
    result_expires=3600,
    # Routing
    task_routes={
        "tasks.orchestration_tasks.*": {"queue": "agents"},
        "tasks.file_parse_task.*": {"queue": "files"},
        "tasks.push_tasks.*": {"queue": "push"},
    },
)
