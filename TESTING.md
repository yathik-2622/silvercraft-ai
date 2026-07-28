# ADM Agent Studio 2.0 — Testing Guide

This document outlines how to test the core features of the SilverCraft AI ADM 2.0 workspace, including the newly implemented async background processing, WebSocket streaming, and frontend UI integrations.

---

## 1. Environment Setup for Testing

Before running tests, ensure your local environment is correctly configured.

1. **Redis**: Ensure Redis is running locally on port 6379. Since you are on Windows, the easiest way to run Redis is via Docker Desktop or WSL:
   ```powershell
   # If using Docker Desktop:
   docker run -d --name redis-local -p 6379:6379 redis:alpine
   ```
2. **MongoDB**: You are using a live MongoDB cluster. Ensure your `MONGODB_URI` points to it.
3. **Environment Variables**: Update `backend/.env` with your actual live Mongo URI and Tiger Analytics LLM config:
   ```env
   MONGODB_URI=mongodb+srv://<your-cluster-details>
   MONGODB_DB_NAME=silvercraft
   SECRET_KEY=your_secret_key
   ENCRYPTION_KEY=your_32_byte_encryption_key

   # Tiger Analytics AI Gateway
   LLM_BASE_URL=https://api.ai-gateway.tigeranalytics.com/v1
   LLM_API_KEY=sk-DwwX5gCMG1V6y37aU
   LLM_MODEL=gpt-4o
   DEFAULT_MODEL=gpt-4o

   # Local Redis for Celery
   REDIS_URL=redis://localhost:6379/0
   ```

   # Target Metastore / DB Push (Optional for testing Push to Target)
   METASTORE_URI=postgresql://user:pass@localhost:5432/metastore
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=password
   ```

## 2. Running the Services

You must run three separate processes to fully test the ADM 2.0 architecture.

**Terminal 1: FastAPI Backend**
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

**Terminal 2: Celery Worker (Background Tasks)**
```powershell
cd backend
venv\Scripts\activate
celery -A tasks.celery_app worker --loglevel=info --pool=solo
```

**Terminal 3: React Frontend**
```bash
cd frontend
npm run dev
```

---

## 3. End-to-End Feature Testing

### Test 1: File Upload & Async Polling
1. Open the Studio Canvas in the browser (`http://localhost:5173` or whatever port Vite uses).
2. Start a new Modeling Chat.
3. Attach a sample CSV or SQL file using the paperclip icon or Context Uploads area.
4. Click Send.
5. **Expected Result**: The Activity indicator will immediately show "Parsing [filename]...". The frontend polls the `GET /api/v1/projects/{project_id}/files/{file_id}/status` endpoint every 2 seconds until the Celery worker finishes parsing, and then the file attaches to the chat.

### Test 2: WebSocket Trace Streaming
1. In the open chat, type a prompt (e.g., "Model a sales system").
2. **Expected Result**: As the backend orchestrator processes the request, you should see italicized trace events appear inline within the chat stream.
   - 🧠 A Brain icon for "Thinking..."
   - 🔧 A Wrench icon for tool calls
   - 🔀 A Merge icon for peer delegations
   - 🛡️ A Shield icon when a gate is ready for review

### Test 3: Canvas Interaction & ERD Visualization
1. Wait for the modeling assistant to return a JSON artifact for the current stage.
2. **Expected Result**: The ReactFlow (`xyflow`) canvas will open, displaying the entities and relationships visually.
3. Click on a table/entity title to edit its details.

### Test 4: Git Push Integration
1. Ensure `GITHUB_TOKEN` is set in your `backend/.env`.
2. When viewing a generated physical model (DDL/STTM) on the Canvas, click the **Push to Git** button in the top right.
3. A modal will prompt for `Repository Name` and `Branch Name`. Fill them out and submit.
4. **Expected Result**: The UI will display a success toast. Check your GitHub account; a new private repository should be created and populated with the DDL, STTM CSV, JSON models, and an auto-generated README.

### Test 5: Deploy to Target Database (Metastore / Neo4j)
1. Ensure your `METASTORE_URI` and `NEO4J_URI` variables are set.
2. In the final Physical Model stage (Gate G4), locate the **Push to Metastore** and **Push to Neo4j** buttons on the canvas header.
3. Click **Push to Metastore**.
4. **Expected Result**: A success toast appears immediately. Check the Celery worker console (Terminal 2); you should see `push_metastore_task` execute the DDL sequentially against the target database.
