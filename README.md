# SilverCraft AI — Data Modeling Platform

An AI-assisted, multi-agent data modeling platform designed to help data architects build out Medallion Architectures (Bronze → Silver → Gold), Kimball Dimensional Models, and Data Vault 2.0 structures. 

The application utilizes a React frontend with a visual canvas and a FastAPI backend powered by LangGraph and Google's Gemini models for intelligent orchestration.

---

## 🏗️ Project Structure

Once you have arranged the folders, your structure should look like this:

```text
silvercraft-ai/
├── frontend/             # React, Vite, Zustand, TailwindCSS
│   ├── src/              # UI components, canvas state, API hooks
│   ├── package.json
│   └── .env.local        # Frontend environment variables
├── backend/              # FastAPI, Motor (MongoDB), LangGraph
│   ├── main.py           # App entry point
│   ├── orchestrator.py   # Multi-agent LangGraph workflow
│   ├── api/              # Route handlers
│   ├── models/           # Pydantic data schemas
│   ├── requirements.txt
│   └── .env              # Backend environment variables
├── README.md
└── TESTING.md            # Full UI and API testing guide
```

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed and configured:
- **Node.js** (v18 or higher)
- **Python** (v3.11 or higher)
- **MongoDB Atlas** (A free cluster or local MongoDB instance)
- **Google Gemini API Key** (For the LangGraph Orchestrator)

---

## ⚙️ Local Setup Guide

### 1. Backend Setup (FastAPI)

Open a terminal and navigate to the `backend` directory:

```bash
cd backend
```

Create a virtual environment and activate it:
```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

Install the dependencies:
```bash
pip install -r requirements.txt
```

Create an `.env` file in the `backend` folder and populate it:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
MONGODB_URI=mongodb+srv://<db_username>:<password>@<cluster-url>/?retryWrites=true&w=majority
MONGODB_DB_NAME=silvercraft
SECRET_KEY=generate_a_long_random_string_for_jwt_tokens
```
> **Note:** Ensure you replace `<db_username>` and `<password>` with actual credentials, without the bracket symbols (`< >`). Ensure your IP address is whitelisted in MongoDB Atlas.

Start the backend server:
```bash
uvicorn main:app --reload --port 8080
```
*The backend should print `✅ Connected to MongoDB: silvercraft` on a successful launch.*

---

### 2. Frontend Setup (React/Vite)

Open a new terminal and navigate to the `frontend` directory:

```bash
cd frontend
```

Install the Node modules:
```bash
npm install
```

Create an `.env.local` file in the `frontend` folder:
```env
VITE_API_URL=http://localhost:8080/api/v1
```

Start the frontend development server:
```bash
npm run dev
```

Navigate to `http://localhost:3002` (or whichever port Vite assigns, often `5173`) in your browser.

---

## 🧪 Testing the Application
For a comprehensive, step-by-step end-to-end testing guide (including UI interactions, sample inputs, and expected outputs), please refer to **[TESTING.md](./TESTING.md)**.
