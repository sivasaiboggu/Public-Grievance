# GrievanceGrid

A production-grade civic grievance redressal platform connecting citizens, municipal triage officers, field workers, and senior authorities across four essential infrastructure categories: **Road Damage**, **Garbage Dumping**, **Waterlogging**, and **Manhole Defects**.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │          GrievanceGrid Core           │
                      └──────────────────┬────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
  apps/web (Next.js)             apps/mobile (Expo)             backend (FastAPI)
  ├── Citizen Portal             ├── Resident Stepper           ├── PostgreSQL / SQLite
  ├── Officer Triage             ├── Mobile Triage & Assign     ├── Redis Pub/Sub & Celery
  ├── Senior Executive           ├── Field Worker Crew          ├── SSE Live Events (/events/stream)
  ├── Admin Console              └── SecureStore Sessions       ├── Photo Authenticity & ML
  └── Slideshow Auth (/login)                                   └── Audit Logs & System Settings
```

---

## Core Capabilities (Pass 10 Complete)

1. **Resident Reporting & Service Charter**:
   - Step-by-step reporting with automatic reverse geocoding, optional photos, and retry-safe submissions.
   - Transparent Service Charter guarantees (e.g., Road damage: 24h review, 72h fix).
   - Real-time status timeline and nearby cluster updates.

2. **Officer Triage Workspace**:
   - Keyboard-navigable queue with dual SLA timers (First Response & Fix target).
   - Combobox field assignment grouped by matching team and active workload.
   - Advisory software suggestions: category defect classification, deduplication, and priority rationale.
   - Layered Photo Authenticity: flags generative tags (Midjourney, DALL-E) and editing metadata (Photoshop, Canva) with "Look closer" advisory cards.
   - Incident Clustering: category radii (30m manhole, 60m road, 100m garbage, 200m waterlogging) with 3 officer choices: *Same problem*, *Different problem*, *Came back*.

3. **Field Worker Execution**:
   - Turn-by-turn navigation links to reported coordinates.
   - Completion photo capture and status transition to *Fixed* with mandatory resident progress notes.

4. **Senior Authority Oversight**:
   - 5-column executive metric bar with "Answered on time" SLA compliance percentage.
   - Interactive Leaflet density bubble map distinguishing confirmed incidents from suggested clusters.
   - Instant real-time modal on deadline breach with one-click officer reminder.

5. **Administrative Control**:
   - Full-width console for configuring response times, notification triggers, and suggestion toggles.
   - Sticky unsaved-changes bar and tamper-resistant audit logs in `admin_audit_logs`.

6. **Real-time Infrastructure**:
   - Server-Sent Events (SSE) via `/api/v1/events/stream` backed by Redis Pub/Sub with automatic 15s HTTP polling fallback.
   - Instant bell badge updates (<2s) and live supervisor escalation pop-ups without page reloads.

---

## Technology Stack

| Component | Technology | Version |
| :--- | :--- | :--- |
| **Web Frontend** | Next.js, React, CSS Modules / Design Tokens | 16.4 / 19.2 |
| **Mobile App** | React Native, Expo SDK, TypeScript | Expo 57 / React 19.2 |
| **Backend API** | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 | Python 3.11+ |
| **Database** | PostgreSQL 17 + PostGIS (Production) / SQLite (Local) | SQLAlchemy |
| **Background & Queue** | Celery 5.4, Redis 7 | Redis Pub/Sub |
| **Inference Runtime** | ONNX Runtime (CPU), Sentence-Transformers | PyTorch offline |
| **Authentication** | JWT Bearer, HTTP-only cookies, HMAC Signed URLs | 300s photo URLs |

---

## Quickstart (Local Windows Setup)

### 1. Prerequisites
- **Python 3.11+** installed and added to PATH.
- **Node.js 20+** installed.
- **Docker Desktop** (optional for Mailpit/Redis, or run standalone).

### 2. Backend Setup
From the repository root:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.lock
pip install --no-deps -e .
alembic upgrade head
python -m app.seed_demo
```

Start the API server:
```powershell
uvicorn app.main:app --reload --port 8000
```
*The startup banner will verify your active municipality, database, emergency helpline (112), and security guardrails.*

### 3. Web Frontend Setup
In a new terminal:
```powershell
cd apps/web
npm install
npm run build
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 4. Background Celery Worker (Optional for Escalation & Email)
In a new terminal:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
celery -A app.worker.celery_app worker -l info -P solo
```

---

## Test Accounts

All accounts use standard passwords for rapid local testing:

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Citizen** | Aarav Sharma | `citizen@grievancegrid.test` | `Citizen@12345` |
| **Officer (GRO)** | Priya Patel | `officer@grievancegrid.test` | `Officer@12345` |
| **Field Worker** | Rajesh Kumar | `field@grievancegrid.test` | `Field@12345` |
| **Senior Authority** | S. Ramanathan | `senior@grievancegrid.test` | `Senior@12345` |
| **Admin** | System Administrator | `admin@grievancegrid.test` | `Admin@12345` |

---

## Documentation Index

- [Manual Testing Guide](docs/MANUAL_STEPS.md): Step-by-step instructions for testing every screen and workflow.
- [Municipal Demo Walkthrough Script](docs/DEMO_SCRIPT.md): Presentation script for live stakeholder demos.
- [Configuration Guide](docs/CONFIGURATION.md): Complete environment variables, dynamic settings, and security rules.
- [Release Verification Checklist](docs/RELEASE_CHECKLIST.md): 10-point production readiness verification.
- [Machine Learning & Suggestions Guide](docs/ML_INTEGRATION.md): Defect classifiers, photo authenticity checks, and offline evaluation.
- [Third-Party Credits & Licenses](docs/THIRD_PARTY.md): Open-source packages and CC BY-SA photo attributions.
- [Public Credits Page](http://localhost:3000/credits): Live web credits for photographers and open-source libraries.

---

## Security & Truth Rules

- **Strict Isolation**: `apps/web` and `apps/mobile` do not share UI components; shared code lives solely in pure TypeScript libraries (`packages/core`, `packages/tokens`).
- **Production Guardrail**: The backend refuses to boot in production (`GG_ENVIRONMENT=production`) if default secret keys are detected.
- **Evidence Protection**: Citizen photos are stored outside public web roots and accessed strictly via short-lived (300s) HMAC-signed URLs.
- **Human Authority**: Software never automatically closes complaints, changes priority, or links incidents without officer sign-off.
