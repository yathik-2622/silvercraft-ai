#!/usr/bin/env bash
# Boots the local Redis (docker), the FastAPI app, and a Celery worker.
# Content (skills, KB reference docs) goes in via the admin API
# (/admin/skills/upload, /admin/kb/upload) once you're logged in as an
# admin — see README "First admin user" section. There is no seed script.
set -e

cd "$(dirname "$0")/.."

echo "Starting local Redis via docker compose..."
docker compose up -d

echo "Starting Celery worker in background..."
celery -A app.celery_app.celery_app worker --loglevel=info -P solo &
CELERY_PID=$!

trap "echo 'Stopping...'; kill $CELERY_PID" EXIT

echo "Starting FastAPI (uvicorn) on :8000..."
uvicorn app.main:app --reload --port 8000