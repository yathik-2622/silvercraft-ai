# SilverCraft AI — End-to-End Testing Guide

This document provides a comprehensive workflow to test every major component of the SilverCraft AI Data Modeling application from the User Interface.

---

## 1. Authentication Flow

### Scenario 1.1: User Registration
- **Navigate to:** `http://localhost:<frontend-port>/register`
- **Sample Inputs:**
  - **Full Name:** `Jane Doe`
  - **Email:** `jane.doe@silvercraft.ai`
  - **Password:** `Test@1234`
- **Action:** Click the "Sign Up" button.
- **Expected Output:** The user is successfully registered in MongoDB, an access token is generated, and the browser redirects to the `/dashboard`.

### Scenario 1.2: User Login
- **Navigate to:** `http://localhost:<frontend-port>/login`
- **Sample Inputs:**
  - **Email:** `jane.doe@silvercraft.ai`
  - **Password:** `Test@1234`
- **Action:** Click the "Log In" button.
- **Expected Output:** The system validates the hashed password, issues a JWT token (stored in Zustand/LocalStorage), and redirects to the `/dashboard`. The user's name should be visible in the top navigation bar.

---

## 2. Project Management

### Scenario 2.1: Creating a New Project
- **Navigate to:** `/dashboard`
- **Action:** Click the **"Create New Project"** card or button.
- **Sample Inputs:**
  - **Project Name:** `E-Commerce Medallion Architecture`
  - **Description:** `Transforming raw POS data into a dimensional data vault.`
- **Action:** Click "Create".
- **Expected Output:** The dashboard updates to display the new project as a selectable card. 

### Scenario 2.2: Opening a Project
- **Action:** Click on the `E-Commerce Medallion Architecture` project card.
- **Expected Output:** The browser navigates to `/project/<project_id>`. The screen splits into two main areas:
  1. **The Visual Canvas** (Left/Center)
  2. **The AI Orchestrator Chat** (Right panel)

---

## 3. Visual Data Modeling Canvas

### Scenario 3.1: Adding Nodes
- **Action:** In the top toolbar of the canvas, click the **"+" (Database)** icon.
- **Expected Output:** A "Source System" node appears on the canvas.
- **Action:** Click the **"Table"** icon twice.
- **Expected Output:** Two new Entity/Table nodes appear. 
- **Action:** Double click the text on the nodes to rename them to `raw_customers` and `stg_customers`.

### Scenario 3.2: Connecting Edges
- **Action:** Click and hold the connection point (dot) on `raw_customers` and drag it to `stg_customers`.
- **Expected Output:** A visual bezier curve or straight edge connects the two nodes, representing a data pipeline or foreign key relationship.

### Scenario 3.3: Canvas Persistence
- **Action:** Refresh the browser page (`F5`).
- **Expected Output:** Because the canvas state automatically syncs to the backend (`PUT /api/v1/projects/<id>`), all nodes, edges, and their exact coordinates should reappear perfectly intact.

---

## 4. LangGraph Multi-Agent Orchestrator

The chat interface is powered by LangGraph, steering the user through a strict 4-stage pipeline:
`1. Source Analysis` → `2. Conceptual` → `3. Logical` → `4. Physical/STTM`.

### Scenario 4.1: Source Analysis (Stage 1)
- **Current Stage:** Look at the top right of the chat window. It should indicate Stage 1 (Source Analysis).
- **Sample Input (Chat):** *"I have 3 CSV extracts from our legacy mainframe: Customers, Orders, and Order_Items. Can you profile this data?"*
- **Action:** Send message.
- **Expected Output:** The AI responds by analyzing the requested tables. It should suggest flagging columns like `Email` or `Address` for PII protection and estimating initial entity relationships. 

### Scenario 4.2: Using Slash Commands for Architecture Shifts
- **Sample Input (Chat):** ` /dimensional-modeling I want to convert the Orders data into a Kimball Star Schema.`
- **Action:** Send message.
- **Expected Output:** The `/dimensional-modeling` command is intercepted by the backend. The AI's context is updated with strict Kimball guidelines. The response should specifically mention creating a `fact_orders` table and surrogate keys (e.g., `dim_customer`, `dim_date`).

### Scenario 4.3: Stage Progression (HITL - Human in the Loop)
- **Action:** Click the **"Approve & Advance"** button located near the chat input box.
- **Expected Output:** The stage tracker updates to **Stage 2: Conceptual**. The AI may output a transitional message confirming the move to the conceptual modeling phase.

### Scenario 4.4: Injecting Data Vault Architecture
- **Sample Input (Chat):** `/data-vault Instead of Kimball, let's design this as a Data Vault 2.0 system.`
- **Action:** Send message.
- **Expected Output:** The AI immediately pivots its design philosophy. It should recommend creating `HUB_CUSTOMER`, `LNK_CUSTOMER_ORDER`, and `SAT_ORDER_DETAILS`, mentioning standard Data Vault attributes like `LOAD_DATE`, `RECORD_SOURCE`, and `HASH_DIFF`.

### Scenario 4.5: Physical STTM Generation (Stage 4)
- **Action:** Click "Approve & Advance" twice to reach **Stage 4: Physical/STTM**.
- **Sample Input:** *"Generate the final Source-to-Target mapping matrix."*
- **Expected Output:** The AI outputs physical transformation rules (e.g., `UPPER(TRIM(customer_name))`, `COALESCE(status, 'UNKNOWN')`) mapping the raw CSVs to the final Data Vault or Dimensional targets.
