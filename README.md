# SilverCraft AI - Data Modeling Platform

SilverCraft AI is a multi-agent data modeling platform for source analysis, conceptual modeling, logical modeling, physical/STTM generation, and knowledge graph handoff. The app uses a React/Vite frontend with a workflow canvas and a FastAPI backend with MongoDB-backed projects, skills, agents, workflows, settings, uploads, exports, and orchestrator endpoints.

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

# Existing Gemini orchestrator path
GEMINI_API_KEY=
DEFAULT_MODEL=gemini-2.0-flash
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

1. Register or log in.
2. Open Settings from the dashboard gear.
3. Choose an LLM provider.
4. Enter the API key or base URL required for that provider.
5. Click `Save Settings`; model discovery runs only after saving.
6. Create a project from the dashboard.
7. Click the project card. The first page is mode selection:
   - Default Modeling
   - Orchestrator Modeling
   - Custom Modeling
8. Select a mode. The next page is source configuration plus the workflow canvas.
9. Configure source inputs:
   - CSV / XLSX / JSON uploads
   - Database connection form with read-only credentials
   - Existing model files
   - Standard naming rules or `/skill` selection
10. In Custom or Orchestrator mode, drag marketplace agents onto the canvas or use the add button.
11. Click any agent node to configure model, prompt, skills, HITL, A2A, inputs, KB/context files, and KG opt-in.
12. Click `Run Pipeline` to persist the workflow and enter Studio.

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

## Notes

- Default mode uses the fixed four-agent pipeline and does not show marketplace agents.
- Custom and Orchestrator modes support dragging marketplace agents onto the canvas.
- Local agent labels are hidden on canvas nodes; remote agents still show the A2A tag.
- Settings intentionally contains only LLM provider configuration.
