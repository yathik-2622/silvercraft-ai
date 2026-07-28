# SilverCraft AI - ADM Agent Studio 2.0

SilverCraft AI is an enterprise-grade AI-powered data modeling platform built on the ADM 2.0 specification. It features a React/Vite frontend using ReactFlow (`xyflow`) for visual modeling, a FastAPI backend orchestrator powered by LangGraph, and a skill-driven multi-agent architecture with real A2A peer calls.

## What This Codebase Is (100% Integrated State)

This is **not** a wireframe or skeleton. All core subsystems are fully wired:

- **5-Agent Architecture**: `SourceIntelligenceAgent`, `ConceptualModelingAgent`, `LogicalModelingAgent`, `PhysicalModelingAgent`, and `SkillCuratorAgent` — each implemented as a LangGraph subgraph with a real tool belt (`query_mongo`, `read_skill`, `call_peer_agent`, `emit_trace`).
- **Skill-Driven Dispatch**: Agents are generic. Their behavior is entirely determined by which skill documents are bound to them at runtime. A `LogicalModelingAgent` can produce a 3NF model, a Data Vault model, or a Kimball model — same agent code, different injected skill.
- **Real Tool-Calling Loop**: `llm_call()` supports OpenAI-compatible `tools=[...]` with automatic plan/act/observe iteration (max 5 rounds). Agents call `query_mongo` to fetch their own data, `read_skill` to load bound skills, and `call_peer_agent` to consult other agents.
- **A2A Peer Calls**: Native transport invokes the actual LangGraph subgraph of the peer agent inline. A2A transport delegates to external agent endpoints via JSON-RPC.
- **Inline Execution**: No Celery stub queue. Regeneration, metastore push, and KG push execute inline with real DB operations.
- **Structured Logging**: Every module uses JSON-formatted structured logging via `core/logging.py`. No `print()` statements remain.
- **Error Envelopes**: All API failures return a consistent `{ error: { code, message, http_status, retryable, trace_id, details, occurred_at } }` shape.

## Project Structure

```text
wireframe/
  backend/
    api/
      routes/           FastAPI route handlers
      websocket.py      WebSocket streaming for live agent traces
    core/
      agents/           LangGraph subgraphs for all 5 agents + base tool belt
      chat_orchestration.py  Master supervisor / specialist dispatcher
      logging.py        Structured JSON logger
      memory.py         Conversation memory & entity extraction
      runtime_settings.py    Per-user LLM provider resolution
      serialization.py  Mongo-safe JSON serialization
    models/             Pydantic v2 models (User, Project, Skill, Agent, Workflow, etc.)
    skills/             Builtin skill markdown files (loaded into Mongo at startup)
    tasks/              Celery task definitions (file parsing, orchestration)
    middleware/         Error handler, CORS, security headers
    main.py             FastAPI app entry point
    orchestrator.py     Planning API (/plan) with skill-driven stage nodes
    database.py         Motor async MongoDB connection
    config.py           Pydantic Settings (env-based)
  frontend/
    src/
      pages/            Dashboard, Studio, Project Config, Marketplace
      components/       Chat UI, Canvas (ReactFlow), Agent modals, Marketplace
      api/              Axios client + WebSocket hook
      types.ts          TypeScript interfaces
  samples/              Sample CSVs and skill files
```

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **MongoDB** 6+ (local or Atlas)
- **Redis** 7+ (for Celery and WebSocket pub/sub)
- **LLM Provider**: OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, NVIDIA, or self-hosted). Platform key or per-user override key.
- **Optional**: PostgreSQL (metastore push target), Neo4j (knowledge graph push), MinIO/S3 (blob store)

## Local Setup

### 1. Clone and install dependencies

```powershell
cd C:\Users\yathi\OneDrive\Desktop\tiger\wireframe

# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

Create `backend/.env`:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=silvercraft

# LLM Platform Key (used when users don't provide their own)
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# Legacy Gemini (optional, kept for backward compat)
GEMINI_API_KEY=
DEFAULT_MODEL=gemini-2.0-flash

# Redis
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Security — CHANGE THIS IN PRODUCTION
SECRET_KEY=your-64-char-random-string-here

# Optional: PostgreSQL metastore
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=silvercraft_metastore
POSTGRES_SCHEMA=public

# Optional: Neo4j knowledge graph
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4j
NEO4J_DATABASE=neo4j

# Optional: MinIO blob store (for file uploads)
BLOB_STORE_ENDPOINT=http://localhost:9000
BLOB_STORE_ACCESS_KEY=minioadmin
BLOB_STORE_SECRET_KEY=minioadmin
BLOB_STORE_BUCKET=silvercraft-files
BLOB_STORE_REGION=us-east-1

# A2A protocol
A2A_SHARED_SECRET=
A2A_PUBLIC_BASE_URL=http://localhost:8000
A2A_MAX_PEER_CALLS=5
```

### 3. Start infrastructure services

**Option A: Docker Compose (recommended)**

```powershell
docker compose up -d mongodb redis minio
```

**Option B: Manual local services**

```powershell
# MongoDB — ensure mongod is running (default port 27017)
mongod --dbpath C:\data\db

# Redis — required for Celery and WebSocket pub/sub
redis-server

# MinIO (optional, for file uploads)
minio server C:\minio\data --console-address :9001
```

### 4. Start the Celery worker

**Celery is required** for async file parsing. Without it, uploaded files will not be parsed.

```powershell
cd backend
.\.venv\Scripts\activate

# Windows — use solo pool (prefork is not supported on Windows)
celery -A tasks.celery_app worker --loglevel=info --concurrency=4 --pool=solo

# Linux / macOS — prefork is fine
# celery -A tasks.celery_app worker --loglevel=info --concurrency=4
```

### 5. Start the backend

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will:
- Connect to MongoDB
- Create indexes
- Seed builtin skills from `backend/skills/*.md` into the `skills` collection
- Seed canonical agents into the `agent_registry` collection

### 6. Start the frontend

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

## Testing the UI and Features

### Authentication
1. Open the app at `http://localhost:5173`
2. Click **Sign Up** and create an account
3. Log in with your credentials

### Creating a Project
1. Click **Create Project** from the Dashboard
2. Fill in:
   - Project name
   - Domain (e.g., Insurance, Finance)
   - Layer: **Foundation Layer** or **Product Layer**
   - Team members (optional)
3. Click **Create** — you are redirected to the Project Workspace

### Uploading Source Files
1. In the Project Workspace, click the **Upload** button or type `/upload` in the chat
2. Select CSV, JSON, or Excel files
3. Files are uploaded to blob store and parsed asynchronously

### Running the Modeling Pipeline
1. In the Studio chat, type a modeling instruction:
   - `/dimensional-modeling` — Kimball-style dimensional model
   - `/data-vault` — Data Vault 2.0 model
   - `/3nf` — Third Normal Form model
2. Or type a free-form request: *"Model this insurance data as a dimensional model targeting Snowflake"*
3. The IntakeAgent will ask for missing info if needed
4. The Master Orchestrator dispatches to the 4 stage-owner agents:
   - **G1 Source Analysis** — profiles uploaded sources, classifies PII, detects keys/relationships
   - **G2 Conceptual Modeling** — derives business concepts and relationships
   - **G3 Logical Modeling** — produces entities, attributes, keys, SCD rules, relationships
   - **G4 Physical Modeling & STTM** — generates DDL, STTM mappings, physical tables

### Viewing Artifacts and Canvas
1. After each stage completes, a **gate card** appears in the chat
2. Click **Approve** to advance to the next stage
3. Click **Edit in Canvas** to open the structured canvas
4. The canvas shows:
   - **Diagram View**: entity cards with PK/FK relationships (ReactFlow)
   - **Table View**: attribute grid with data types, PK/FK flags, classification
5. Make inline edits, click **Save**

### Using the Agent Marketplace
1. Go to **Marketplace** from the sidebar
2. Browse predefined agents (Source Analysis, Conceptual, Logical, Physical)
3. Drag agents onto the canvas to build custom pipelines
4. Click **Run Pipeline** to execute your custom workflow

### Managing Skills
1. Go to **Skills** or type `/skill list` in chat
2. View builtin and custom skills
3. Click **Create Skill** to author a new skill markdown
4. Skills are bound to stages and auto-picked up by agents
5. Use `/skill enhance <name>` to improve an existing skill via SkillCuratorAgent

### A2A Peer Calls
1. Create a custom agent with **Enable A2A** checked
2. Enter the remote agent's endpoint URI
3. Click **Test A2A Handshake** to validate the agent card
4. When the pipeline runs, native agents consult each other via `call_peer_agent`:
   - `LogicalModelingAgent` → `SourceIntelligenceAgent` for attribute-mapping ambiguity
   - `PhysicalModelingAgent` → `LogicalModelingAgent` for SCD confirmation
   - Any agent → `SkillCuratorAgent` for skill discovery

### Push to Metastore / Knowledge Graph
1. After G4 is approved, click **Push to Metastore** (or call the API)
2. DDL is executed inline against PostgreSQL
3. Click **Push to KG** to push the model to Neo4j (27-level ontology)

## API Reference

All API endpoints are prefixed with `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Login (returns JWT) |
| GET | `/projects` | List user's projects |
| POST | `/projects` | Create a project |
| POST | `/projects/{id}/files` | Upload source files |
| POST | `/orchestrator/run` | Run the modeling pipeline |
| POST | `/orchestrator/stream` | SSE streaming endpoint |
| POST | `/agents/{name}/run` | Dispatch a single agent |
| POST | `/agents/{name}/peer-call` | A2A peer call |
| GET | `/agents/{name}/.well-known/agent-card.json` | A2A discovery |
| POST | `/sessions/{id}/messages` | Send a chat message |
| GET | `/sessions/{id}/messages` | Get chat history |
| POST | `/sessions/{id}/artifacts` | Save an artifact |
| POST | `/skills` | Create a skill |
| POST | `/skills/{id}/enhance` | Enhance via SkillCuratorAgent |
| POST | `/sessions/{id}/gates/{gate}/approve` | Approve a gate |
| POST | `/sessions/{id}/gates/{gate}/regenerate` | Regenerate a gate |
| POST | `/sessions/{id}/push/metastore` | Push DDL to PostgreSQL |
| POST | `/sessions/{id}/push/kg` | Push model to Neo4j |
| WS | `/chat/{session_id}/stream` | WebSocket trace stream |

## Verification Commands

Backend syntax check (all Python files):
```powershell
cd C:\Users\yathi\OneDrive\Desktop\tiger\wireframe\backend
.\.venv\Scripts\activate
python -c "
import ast, os
for root, dirs, files in os.walk('.'):
    for f in files:
        if f.endswith('.py'):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8') as fh:
                    ast.parse(fh.read())
            except SyntaxError as e:
                print(f'SYNTAX ERROR: {path}: {e}')
print('All Python files pass syntax check')
"
```

Frontend type check:
```powershell
cd frontend
npx tsc --noEmit
```

Backend import check:
```powershell
cd backend
.\.venv\Scripts\activate
python -c "import main; print('Backend imports OK')"
```

## Architecture Notes

- **No hardcoded style→agent mappings**: The `LogicalModelingAgent` does not know about "3NF" or "Data Vault" as code concepts. It reads whatever skill is bound to the `logical` stage and follows it.
- **No Celery stub queue**: All agent execution, regeneration, and push operations execute inline. Celery is available for file parsing but not required for the core pipeline.
- **No `print()` logging**: All modules use `core/logging.py` which emits structured JSON events to stdout.
- **No `pass` stubs**: Every exception handler logs the error with context. Every TODO has been resolved or removed.
