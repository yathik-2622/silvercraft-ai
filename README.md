# SilverCraft AI - Data Modeling Platform

SilverCraft AI is a chat-first ADM workspace. It uses a React/Vite frontend, FastAPI, MongoDB, and a LangGraph flow with an IntakeAgent, a master supervisor, and one stage specialist per run. Projects, chats, messages, files, skills, agent-run records, and canvas artifacts are stored in MongoDB.

## Project Structure

```text
wireframe/
  backend/               FastAPI app, MongoDB access, orchestration routes
    api/routes/          Auth, projects, skills, agents, workflows, settings
    core/                Security and runtime LLM provider settings
    models/              Pydantic models
    main.py              FastAPI entry point
    orchestrator.py      Pipeline planning and runtime orchestration
    requirements.txt
  frontend/              React, Vite, React Flow, Tailwind
    src/pages/           Dashboard, settings, project setup, studio
    src/components/flow/ Workflow canvas and agent node configuration
    src/api/client.ts    API client
    package.json
  samples/
```

## Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB local instance or Atlas cluster
- LLM credentials for one of the supported providers

Supported LLM providers in Settings:

- Platform Provider
- Gateway
- Custom OpenAI-compatible endpoint
- OpenAI
- OpenRouter
- Groq
- NVIDIA

## Backend Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=silvercraft
SECRET_KEY=replace_with_a_long_random_string

# Platform/Gateway provider defaults
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o

# Optional: protect A2A calls exposed to other services
A2A_PUBLIC_BASE_URL=http://localhost:8080
A2A_SHARED_SECRET=
```

Start the backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8080
```

Backend API docs:

```text
http://localhost:8080/docs
```

## Frontend Setup

```powershell
cd frontend
npm install
```

Optional `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8080/api/v1
FASTAPI_URL=http://localhost:8080
```

Start the frontend:

```powershell
cd frontend
npm run dev
```

Open:

```text
http://localhost:3002
```

## Current UI Flow

1. Open `http://localhost:3002` and sign in with an email and password. First local sign-in creates the workspace profile.
2. On the dashboard, verify **My projects**, **Shared projects**, compact edit/delete actions, and the settings icon.
3. Keep **Platform provider** selected to use `LLM_*` values from backend `.env`. Do not enter a key in the UI for this mode.
4. Create a project with name, domain, subdomain, optional description, team emails, and Foundation/Product layer.
5. Open its card. The chat studio opens without a canvas.
6. Send “Profile my sources” before uploading files or connecting a database. The IntakeAgent should keep the answer in chat and ask you to choose **Upload files** or **Connect a database**; no canvas should open.
7. Attach one or more source files, then send a concrete Stage‑1 request. The supervisor delegates to the source specialist and the visible activity stream reports orchestration milestones.
8. When the specialist returns JSON, the canvas opens. Use **ERD** for table/entity cards and relationships, **Attributes** for columns, and **STTM / DDL** for physical mappings. Click a table/entity title to edit it, then choose **Save**.
9. Send a general question such as “What is a dimensional model?” It should stay in chat and not open the canvas.
10. Create, rename, delete, and reopen a chat. Refresh the browser to confirm messages and artifacts come back from MongoDB.
11. Type `/` in the composer, select a Markdown skill, and send a request. Skills are loaded from `backend/skills/*.md`.
12. Check `GET /api/v1/chats/{chat_id}/history` and `GET /api/v1/projects/{project_id}/history` in `/docs`.

## Verification Commands

Backend compile:

```powershell
python -m py_compile backend\config.py backend\core\runtime_settings.py backend\api\routes\settings.py backend\main.py
```

Frontend build:

```powershell
cd frontend
npm run build
```

Health check through the frontend wrapper:

```powershell
Invoke-WebRequest -Uri http://localhost:3002/api/health -UseBasicParsing
```

## Current architecture and boundaries

- `IntakeAgent` is the first LangGraph node. It checks Stage‑1 requests for uploaded files, source tables, or saved connection metadata before delegation.
- The master supervisor decides `chat` versus `delegate`. General answers remain in chat; delegated results create canvas artifacts.
- The active specialist is selected by stage: Source Analysis, Conceptual Modeling, Logical Modeling, or Physical/STTM.
- The stream endpoint sends visible lifecycle/activity events and a final result. It does **not** yet stream individual LLM tokens.
- Source database credentials are not persisted by the current connection form; it records masked metadata only.
- Canvas rendering requires the model to return the documented JSON shape. Existing Markdown artifacts should be regenerated.
