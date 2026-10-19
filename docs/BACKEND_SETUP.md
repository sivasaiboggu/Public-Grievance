# GrievanceGrid — Backend & Background Infrastructure Setup Guide (Windows)

This document provides exact, step-by-step Windows PowerShell instructions to set up, run, and verify the GrievanceGrid backend, database, Redis broker, background workers, and email system.

---

## 1. Prerequisites Installation & Verification

Ensure the following tools are installed on your Windows machine:

| Tool | Minimum Version | Installation Link | Verification Command |
| :--- | :--- | :--- | :--- |
| **Docker Desktop** | 4.25+ | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) | `docker --version` |
| **Python** | 3.11 or 3.12 | [python.org/downloads](https://www.python.org/downloads/) | `python --version` |
| **Node.js** | 20 LTS or 22 LTS | [nodejs.org](https://nodejs.org/) | `node --version` |
| **npm** | 10+ | Bundled with Node.js | `npm --version` |

Open PowerShell and verify:
```powershell
docker --version
docker compose version
python --version
node --version
```

---

## 2. Environment Configuration

1. Copy the example configuration to `.env` at the repository root:
```powershell
Copy-Item .env.example .env
```

2. Generate a secure 32+ character secret key for JWTs and signed URLs:
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```
Paste this string into your `.env` file as `GG_SECRET_KEY`.

### Environment Variables Reference Table

| Variable | Default Value | Description | Action Required |
| :--- | :--- | :--- | :--- |
| `GG_DATABASE_URL` | `sqlite:///./var/grievancegrid.db` | SQLAlchemy connection string. Set to PostgreSQL URI if running Docker Postgres. | Keep SQLite for host runs or uncomment Postgres. |
| `GG_SECRET_KEY` | `dev-secret-key-change-in-production...` | Secret key for signing access tokens and photo URLs. | **Generate random string.** |
| `GG_REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection URL for rate limiting, cache, & Celery broker. | Default works with Docker Redis. |
| `GG_MAIL_BACKEND` | `mailpit` | Email delivery mechanism: `mailpit`, `console`, or `smtp`. | Use `mailpit` locally; `smtp` in prod. |
| `GG_MAILPIT_HOST` | `127.0.0.1` | Mailpit SMTP host. | Default works with Docker Mailpit. |
| `GG_MAILPIT_PORT` | `1025` | Mailpit SMTP port. | Default works with Docker Mailpit. |
| `GG_SMTP_HOST` | `""` | Outbound SMTP host (e.g., `smtp.gmail.com`). | Leave empty in local dev. |
| `GG_SMTP_PORT` | `587` | SMTP TLS port. | Set to 587 if using SMTP. |
| `GG_SMTP_USER` | `""` | SMTP username. | Set if using SMTP. |
| `GG_SMTP_PASSWORD`| `""` | SMTP app password. | Set if using SMTP. |
| `GG_SMTP_FROM` | `no-reply@grievancegrid.test` | Outbound Sender address. | Set if using custom domain. |
| `GG_FRONTEND_URL` | `http://localhost:3000` | Web application base URL. | Matches Next.js dev server. |
| `GG_JURISDICTION_ID`| `demo-municipality` | Primary administrative jurisdiction ID. | Standardized identifier. |
| `GG_JURISDICTION_NAME`| `City Municipality` | Human-readable name for public display. | Shown in page subtitles. |

---

## 3. Start Supporting Infrastructure (Docker Compose)

Start Redis (cache & queue broker), PostgreSQL (optional production-grade database), and Mailpit (local mail testing):

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Verify service health:
```powershell
docker compose -f docker-compose.dev.yml ps
```
All three containers (`grievancegrid-redis`, `grievancegrid-postgres`, `grievancegrid-mailpit`) should report status `Up` or `Up (healthy)`.

---

## 4. Python Environment, Migrations & Database Seeding

1. Navigate to the backend directory and set up the virtual environment:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:
```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

3. Run Alembic migrations to create all database tables:
```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

4. Seed the database with initial categories, teams, users, generated sample photos, and historical reports:
```powershell
.\.venv\Scripts\python.exe -m app.seed_demo
```
*(The seed script is strictly idempotent and safe to run multiple times).*

---

## 5. Starting Application Services (Step-by-Step)

Each service runs in its own separate Windows PowerShell terminal.

### Terminal 1: FastAPI Web API
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
**Expected Output:**
```text
INFO:     Started server process [PID]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

### Terminal 2: Celery Background Worker (Windows Solo Pool)
> **IMPORTANT (Windows):** Celery on Windows requires the `--pool=solo` or `--pool=threads` execution pool. Standard fork-based pools will fail.
```powershell
cd backend
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app worker --loglevel=info --pool=solo
```
**Expected Output:**
```text
[tasks]
  . app.worker.tasks.send_email
  . app.worker.tasks.process_report_photo
  . app.worker.tasks.notify_status_change
  . app.worker.tasks.check_overdue_reports
  . app.worker.tasks.refresh_dashboard_stats
  . app.worker.tasks.build_summary_export
  . app.worker.tasks.cleanup_expired
  . app.worker.tasks.analyse_report
[INFO] celery@hostname ready.
```

### Terminal 3: Celery Periodic Beat Scheduler
```powershell
cd backend
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app beat --loglevel=info
```
**Expected Output:**
```text
[INFO] beat: Starting...
[INFO] Scheduler: Sending due task check_overdue_reports...
```

### Terminal 4: Next.js Frontend Web Application
```powershell
cd apps/web
npm run dev
```
**Expected Output:**
```text
▲ Next.js 16.4.1 (Turbopack)
- Local:        http://localhost:3000
- Environments: .env.local
✓ Starting...
✓ Ready in 1.2s
```

### Terminal 5: Mobile App (Expo)
```powershell
cd apps/mobile
npm run start
```
Press `a` to open in Android Emulator or scan QR code with Expo Go.

---

## 6. Email Delivery & Verification

### Local Testing with Mailpit
When `GG_MAIL_BACKEND=mailpit`, all verification emails, password resets, staff invitation links, and status notifications are captured locally:
- Open your browser to: **`http://localhost:8025`**
- Inspect subject, HTML body, plain text, and click verification links directly from the Mailpit interface.

### Switching to Production SMTP
Set the following in `.env`:
```ini
GG_MAIL_BACKEND=smtp
GG_SMTP_HOST=smtp.sendgrid.net
GG_SMTP_PORT=587
GG_SMTP_USER=apikey
GG_SMTP_PASSWORD=your_actual_api_key
GG_SMTP_FROM=support@yourmunicipality.gov
```
For production domain delivery, ensure your DNS provider has configured:
1. **SPF Record**: `v=spf1 include:sendgrid.net ~all`
2. **DKIM Record**: CNAME or TXT keys provided by your mail provider.
3. **DMARC Record**: `v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourmunicipality.gov`

---

## 7. Creating the First Admin Account (CLI Bootstrap)

When demo accounts are disabled for production deployments, create the first administrator account via Python:

```powershell
cd backend
.\.venv\Scripts\python.exe -c "from app.db import get_engine, get_session; from app.models import User; from app.auth import get_password_hash; engine = get_engine(); s = get_session(engine); u = User(name='Lead Administrator', email='lead.admin@city.gov', password_hash=get_password_hash('ChangeMe@123456'), role='admin', jurisdiction_id='demo-municipality', status='active', email_verified=True); s.add(u); s.commit(); print('Created administrator successfully.')"
```

---

## 8. Test Credentials Table

| Role | Name | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Citizen** | Aarav Sharma | `citizen@grievancegrid.test` | `Citizen@12345` | Citizen portal, submit reports, view progress |
| **Officer (GRO)** | Priya Patel | `officer@grievancegrid.test` | `Officer@12345` | Triage queue, assign field workers, update status |
| **Field Worker** | Rajesh Kumar | `field@grievancegrid.test` | `Field@12345` | Field duty, start work, add notes/photos, fix issues |
| **Senior Authority** | S. Ramanathan | `senior@grievancegrid.test` | `Senior@12345` | Aggregate metrics, SLA benchmarks, CSV export |
| **Administrator** | System Administrator | `admin@grievancegrid.test` | `Admin@12345` | People & staff invites, categories CRUD, audit log |

---

## 9. Troubleshooting & Diagnostics

| Symptom | Probable Cause | Fix / Diagnostic Command |
| :--- | :--- | :--- |
| `[Errno 10048] Address already in use (8000)` | A previous Uvicorn process is still bound to port 8000. | `Get-NetTCPConnection -LocalPort 8000 \| Select-Object OwningProcess`<br>`Stop-Process -Id <PID> -Force` |
| `Redis connection error / ConnectionRefused` | Redis container is not running. | `docker compose -f docker-compose.dev.yml restart redis`<br>Test: `docker exec -it grievancegrid-redis redis-cli ping` (Expects `PONG`). |
| Celery worker hanging on Windows | Running default process pool. | Start worker strictly with `--pool=solo`. |
| Emails not appearing | Mailpit container stopped or incorrect port. | Check `http://localhost:8025`. Check worker terminal for `send_email` task logs. |
| Photo stuck in "Processing..." | Celery worker is offline or Redis down. | Ensure Celery worker is active in Terminal 2. Photos will be processed inline if Redis is unavailable. |

---

## 10. Production Readiness Checklist

Before public municipal deployment, ensure the following are complete:
- [ ] **Secrets:** Generate a unique `GG_SECRET_KEY` with 48+ cryptographically random bytes.
- [ ] **HTTPS / TLS:** Terminate TLS via Nginx / Cloudflare; set `Secure` flag on refresh token cookie.
- [ ] **Database:** Migrate from SQLite to managed PostgreSQL (e.g., AWS RDS / Azure Database for PostgreSQL).
- [ ] **Redis:** Use managed high-availability Redis with persistence enabled (AOF or RDB).
- [ ] **Worker Supervision:** Supervise Celery worker and beat via Windows Service (`NSSM`) or Linux `systemd`.
- [ ] **SMTP:** Replace Mailpit with transactional SMTP and configure SPF, DKIM, and DMARC.
- [ ] **Demo Accounts:** Remove seeded test accounts from the production database.
- [ ] **Log Shipping:** Stream application logs to CloudWatch / Datadog / Grafana Loki.
