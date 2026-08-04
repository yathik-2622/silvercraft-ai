"""
Celery app — broker/backend = local Redis (queue use only, TDS §8).
8 task types total, defined in tasks.py: orchestrator_task, plan_task,
execute_contract_task, resume_contract_task, git_push_task,
normalize_skill_task, ingest_kb_document_task, embed_skill_task.
"""
from celery import Celery

from app.config import ADM_get_settings

settings = ADM_get_settings()

ADM_celery_app = Celery(
    "adm2",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.celery_app.tasks"],
)

ADM_celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_send_task_events=True,
    timezone="UTC",
)