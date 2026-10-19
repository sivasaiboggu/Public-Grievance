# GrievanceGrid Local Setup & Operations Guide

> For complete Windows backend infrastructure instructions (Docker Compose, Redis, Postgres, Celery background worker, Mailpit, and migrations), see [BACKEND_SETUP.md](BACKEND_SETUP.md).

## Quick Start (Windows PowerShell)

### 1. Start the FastAPI Backend

Open a PowerShell terminal at repository root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Verify backend health at `http://127.0.0.1:8000/api/v1/config`.

#### Troubleshooting Port 8000 Conflicts

If you see `[Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000)`:

```powershell
# 1. Identify the process locking port 8000
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess, State

# 2. Terminate the blocking process
Stop-Process -Id <OwningProcessId> -Force

# 3. Restart uvicorn
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Start the Next.js Web App

Open a second PowerShell terminal:

```powershell
cd apps/web
npm run dev
```

Open `http://localhost:3000` in your browser. Next.js automatically proxies `/api/v1/*` requests to `http://127.0.0.1:8000/api/v1/*`.

### 3. Start the Expo Mobile App

Open a third PowerShell terminal:

```powershell
cd apps/mobile
npm run start
```

Press `a` for Android emulator or scan QR code via Expo Go.

---

## Seeded Test Accounts

The local database (`backend/grievancegrid.db`) is pre-seeded with test accounts:

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Citizen (Resident)** | `citizen@grievancegrid.test` | `Citizen@12345` | File complaints, track status, attach photos |
| **Grievance Redressal Officer (GRO)** | `officer@grievancegrid.test` | `Officer@12345` | Municipal queue, triage, action transitions, audit rationale |
| **Field Officer** | `field@grievancegrid.test` | `Field@12345` | Field duty status, ward roster |
| **Supervisor (Senior)** | `senior@grievancegrid.test` | `Senior@12345` | Jurisdictional governance, SLA target benchmarks |
| **Administrator** | `admin@grievancegrid.test` | `Admin@12345` | Municipal parameters, service categories, system telemetry |

---

## Role-Based Route Architecture

GrievanceGrid strictly segregates roles across independent routes:

- `/sign-in` & `/sign-up`: Public authentication with 3D interactive cube grid.
- `/citizen`: Resident report directory and tracking.
- `/citizen/report`: 5-step compact reporting stepper.
- `/citizen/reports/[trackingId]`: Official action log and evidence attachment.
- `/officer`: 3-pane desktop triage workspace and mobile standalone view (`/officer/reports/[trackingId]`).
- `/field`: On-duty dashboard with honest empty state for unassigned work orders.
- `/senior`: Executive governance and statutory SLA benchmarks.
- `/admin`: Real municipal configuration parameters from `/config`.

Direct navigation to unauthorized routes automatically redirects to the user's role designated home with a warning notification.
