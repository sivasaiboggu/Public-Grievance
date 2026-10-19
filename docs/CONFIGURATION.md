# GrievanceGrid Configuration Guide

GrievanceGrid uses a layered configuration architecture designed for predictable local development and tamper-resistant municipal deployments.

---

## 1. The Three Configuration Layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Dynamic System Settings (Database: system_settings) │
│ Controlled by Admins via /admin Console                │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Environment Variables (.env / Process Env)     │
│ Overrides defaults; sets ports, URLs, credentials       │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Built-in Operational Defaults (Code Fallbacks)  │
│ Safe standard SLA targets, fallback radii, isolation   │
└─────────────────────────────────────────────────────────┘
```

1. **Dynamic System Settings (`system_settings` table)**:
   - Configured live through the Web Admin Settings console (`/admin`).
   - Requires municipal Admin privileges.
   - All changes produce an immutable record in `admin_audit_logs`.
   - Modifies operational parameters without process restarts: SLA target hours, email sender display, suggestion toggles, and notification thresholds.

2. **Environment Variables (`.env`)**:
   - Loaded on backend startup via Pydantic `BaseSettings` (`GG_` prefix).
   - Manages infrastructure connectivity: Database URL, Redis URL, JWT Secret Key, Mailer transport, and CORS domains.

3. **Built-in Fallbacks**:
   - Safe municipal defaults (e.g. 112 emergency routing, 30m-200m category radii, 8-hour session lifetime).

---

## 2. Environment Variables Reference

| Variable | Default Value | Description | Production Requirement |
| :--- | :--- | :--- | :--- |
| `GG_DATABASE_URL` | `sqlite:///./var/grievancegrid.db` | SQLAlchemy connection string | Point to secure PostgreSQL |
| `GG_SECRET_KEY` | `dev-secret-key-change-in-production-min-32-chars` | HMAC & JWT signing key (min 32 chars) | **MANDATORY TO CHANGE**. Startup fails if default. |
| `GG_ENVIRONMENT` | `development` | Deployment environment (`development` \| `production`) | Set to `production` |
| `GG_REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis instance for Celery & SSE pub/sub | Dedicated Redis instance |
| `GG_MAIL_BACKEND` | `mailpit` | Mail driver (`console` \| `mailpit` \| `smtp`) | Set to `smtp` |
| `GG_MAILPIT_HOST` | `127.0.0.1` | Local Mailpit SMTP host | Unused in production |
| `GG_MAILPIT_PORT` | `1025` | Local Mailpit SMTP port | Unused in production |
| `GG_SMTP_HOST` | `""` | Outbound SMTP server hostname | Required if `GG_MAIL_BACKEND=smtp` |
| `GG_SMTP_PORT` | `587` | Outbound SMTP port | Required if `GG_MAIL_BACKEND=smtp` |
| `GG_SMTP_USER` | `""` | SMTP username | Required if `GG_MAIL_BACKEND=smtp` |
| `GG_SMTP_PASSWORD` | `""` | SMTP password / app secret | Required if `GG_MAIL_BACKEND=smtp` |
| `GG_FRONTEND_URL` | `http://localhost:3000` | Web application origin | Public HTTPS URL |
| `NEXT_PUBLIC_API_URL`| `http://localhost:8000/api/v1` | Public API base for web client | Public HTTPS API URL |
| `EXPO_PUBLIC_API_URL`| `http://192.168.1.100:8000` | Public API base for mobile client | Public HTTPS API URL |
| `GG_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins (JSON array) | Explicit whitelist |
| `GG_JURISDICTION_ID`| `demo-municipality` | Municipal authority identifier | Assigned municipal ID |
| `GG_JURISDICTION_NAME`| `Kochi` | Display name of the municipal authority | Municipal authority name |
| `GG_EMERGENCY_NUMBER`| `112` | Public emergency dispatch telephone | Statutory emergency number |
| `GG_ML_ENABLED` | `true` | Master switch for software suggestions | Optional |

---

## 3. Dynamic System Settings Reference

These parameters are retrieved via `GET /api/v1/admin/settings` and modified via `PUT /api/v1/admin/settings`.

### General & Jurisdiction
- `jurisdiction_name`: Municipal authority name shown to citizens on receipts and notices.
- `emergency_number`: Public helpline displayed when issues require urgent police, ambulance, or fire services (default `112`).

### Service Level Agreement (SLA) Targets
- `sla_road_damage_first_response_hours`: Target hours for officer review of road damage (default `24h`).
- `sla_road_damage_fix_hours`: Target hours for field work completion of road damage (default `72h`).
- `sla_garbage_first_response_hours`: Target hours for officer review of garbage dumps (default `12h`).
- `sla_garbage_fix_hours`: Target hours for field cleanup of garbage (default `48h`).
- `sla_waterlogging_first_response_hours`: Target hours for review of waterlogging reports (default `8h`).
- `sla_waterlogging_fix_hours`: Target hours for drainage resolution (default `36h`).
- `sla_manhole_first_response_hours`: Target hours for review of missing/broken manholes (default `4h`).
- `sla_manhole_fix_hours`: Target hours for manhole replacement/cordoning (default `12h`).

### Email Notices
- `email_sender_name`: Organization name appearing in `From` headers (e.g., `Kochi Municipal Corporation`).
- `send_report_received`: Notify citizens upon submission with their tracking ID.
- `send_status_updates`: Notify citizens on status changes (Under review, In progress, Resolved).
- `send_officer_assignment`: Notify field teams when a task is dispatched to them.
- `send_senior_escalations`: Notify supervisors when deadlines are breached.

### Software Suggestions (Advisory Only)
- `suggestion_photo_check`: Detects and advises if photo content matches the chosen category.
- `suggestion_duplicates`: Flags similar descriptions and coordinates within category radii.
- `suggestion_priority`: Calculates recommended priority rubric based on category deadline and duplicate count.
- `suggestion_photo_authenticity`: Inspects software provenance headers (C2PA, Photoshop, Canva) before EXIF stripping.
- `senior_alert_popup_enabled`: Triggers instant senior notification modal when a task passes due date.

---

## 4. Production Security Hardening

1. **Secret Key Enforcement**:
   When `GG_ENVIRONMENT=production`, the application refuses to boot if `GG_SECRET_KEY` matches any known default or is shorter than 32 characters.
   Generate a key:
   ```powershell
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
   ```

2. **Private Evidence Storage**:
   Evidence photos are stored outside public web roots and accessed solely via time-limited (300s) HMAC-signed URLs.

3. **Audit Trail**:
   All administrative setting modifications create an immutable audit record containing the administrator's ID, timestamp, and field deltas.
