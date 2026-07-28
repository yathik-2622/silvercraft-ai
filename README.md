# SilverCraft AI - ADM Agent Studio 2.0

SilverCraft AI is an enterprise-grade AI-powered data modeling platform built on the ADM 2.0 specification. It features a React/Vite frontend using ReactFlow (`xyflow`) for visual modeling, a FastAPI backend orchestrator powered by LangGraph, and a Celery/Redis task queue for asynchronous workload processing (e.g., File Parsing, Metastore Pushes, and Git integrations).

## Key Features (ADM 2.0)
- **5-Agent Architecture**: Uses `IntakeAgent`, `SourceIntelligenceAgent`, `ConceptualModelingAgent`, `LogicalModelingAgent`, and `PhysicalModelingAgent` via LangGraph subgraphs.
- **Async Execution**: Leverages Celery and Redis to run long-running background tasks without blocking the UI.
- **Real-Time WebSocket Streaming**: Real-time agent `trace_events` (`thinking`, `tool_call`, `gate_ready`) streamed via WebSockets to the chat UI.
- **Git Push & Metastore Integration**: One-click deployment to GitHub, Postgres, and Neo4j using credentials securely encrypted at rest.
- **ReactFlow Canvas**: Interactive ERD and Data Vault visualizations generated directly from physical models.

## Project Structure

```text
wireframe/
  backend/               FastAPI app, Celery tasks, MongoDB access, LangGraph orchestrators
    api/routes/          Auth, projects, skills, agents, workflows, sessions, git_push
    core/                Security, Memory, Blob Store, and runtime LLM provider settings
    tasks/               Celery tasks (file_parse_task, push_tasks, orchestration_tasks)
    models/              Pydantic models
    main.py              FastAPI entry point
    orchestrator.py      Legacy pipeline planning
    requirements.txt
  frontend/              React, Vite, React Flow, Tailwind
    src/pages/           Dashboard, settings, project setup, studio
    src/components/      Chat UI, StructuredCanvas (xyflow), etc.
    src/api/client.ts    API client (Axios & WebSockets)
    package.json
  samples/
```

## Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB local instance or Atlas cluster
- Redis (required for Celery task queuing and WebSockets)
- LLM credentials for one of the supported providers

## Getting Started & Testing

For complete instructions on configuring the environment, starting the required services (FastAPI, Celery, and React), and executing end-to-end feature tests, please refer to the **[TESTING.md](TESTING.md)** guide.

### Quick Start Overview

**1. Start FastAPI Backend**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**2. Start Celery Worker (requires Redis)**
```powershell
cd backend
.\.venv\Scripts\activate
celery -A tasks.celery_app worker --loglevel=info --concurrency=4
```

**3. Start React Frontend**
```powershell
cd frontend
npm install
npm run dev
```

## Verification Commands

Backend compile check:
```powershell
python -m py_compile backend\config.py backend\core\runtime_settings.py backend\api\routes\settings.py backend\main.py
```

Frontend build check:
```powershell
cd frontend
npm run build
```

## Current Architecture and Boundaries

- **IntakeAgent** checks Stage‑1 requests for uploaded files, source tables, or saved connection metadata before delegation.
- The master supervisor dispatches Celery tasks for the stage specialists (Source Analysis, Conceptual, Logical, or Physical/STTM).
- The WebSocket endpoint (`/api/v1/chat/{session_id}/stream`) sends visible lifecycle/activity events (`thinking`, `tool_call`, `peer_call`) back to the frontend chat UI.
- Uploaded files are immediately pushed to a Blob Store (AWS S3 / MinIO) and parsed asynchronously by Celery to extract schemas.
- Source database credentials are encrypted at rest using AES-GCM and stored securely via `/api/v1/db-connections`.
- The physical modeling stage produces artifacts that are rendered in the Canvas using `xyflow`. You can interact with the canvas to push artifacts to GitHub or execute DDL directly against target metastores.
