# Testing the first working flow

## Normal unit/workflow checks

Run the commands in README.md. API tests isolate each SQLite database under pytest's temporary directory. They cover ownership, GRO-only decisions, jurisdiction boundaries, retry-safe complaint registration, version conflicts, invalid inputs, session revocation/expiry and private photographs.

## Browser end-to-end checks — Windows

Use a disposable test database, not your normal demo records.

Terminal 1, from `backend/`:

```powershell
$env:GG_DATABASE_URL='sqlite:///./var/browser_test.db'
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m tests.seed_e2e
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The seed script refuses a database whose name/stem does not end in `_test`. It creates one fixed test officer (`gro.e2e@example.com`, password `e2e-local-only-password`), **only for this disposable environment**. Never use it on a public server or for real citizen records.

Terminal 2, from the repository root:

```powershell
npm run build:web
npm run start --workspace=@grievancegrid/web
```

Terminal 3, from `apps/web/`:

```powershell
npx playwright install chromium
npx playwright test
```

The first test uses two browser contexts: a new citizen registers/submits, the test officer updates the complaint, and the citizen sees the same history. The second checks a phone-width sign-in page for horizontal overflow. Reports/traces/screenshots under `test-results/` are ignored by Git. Synthetic test records are not research data.

## PostgreSQL/PostGIS checks

Provision a dedicated PostGIS database named, for example, `grievancegrid_test`. Set both `GG_DATABASE_URL` and `GG_TEST_DATABASE_URL` to its `postgresql+psycopg://...` URL, then migrate and run pytest from `backend/`. The same workflow tests execute on PostgreSQL, plus a check that longitude/latitude produce the correct geography point and metre-based distance result. CI creates this disposable database automatically.

## What these checks do not prove

- Metro export is not an APK installation or physical-device test.
- Simulated citizen/officer journeys do not prove actual municipal repair outcomes.
- A local storage test does not verify a live S3 service or backup/restore process.
- Passing API/browser tests does not constitute a complete security audit or load test.
- No model training, dataset preparation, priority ranking or hotspot evaluation has occurred in this repository.
