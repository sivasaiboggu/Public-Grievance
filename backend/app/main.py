from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.admin import router as admin_router
from app.assignments import router as assignments_router
from app.auth import router as auth_router
from app.categories import router as categories_router
from app.clustering import router as clustering_router
from app.complaints import router as complaint_router
from app.config import get_settings
from app.events import router as events_router
from app.evidence import router as evidence_router
from app.metrics import router as metrics_router
from app.models import CATEGORY_LABELS
from app.notifications import router as notifications_router
from app.senior import router as senior_router
from app.suggestions import router as suggestions_router
from app.security import Database

settings = get_settings()
app = FastAPI(title="GrievanceGrid API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
auth_attempts: dict[str, deque] = defaultdict(deque)
auth_lock = Lock()


@app.on_event("startup")
def startup_checks():
    s = get_settings()
    
    # Production security guardrail
    if s.environment.lower() in ("production", "prod"):
        insecure_keys = [
            "dev-secret-key-change-in-production-min-32-chars",
            "change-me",
            "secret",
            "password",
            "default",
        ]
        if any(bad in s.secret_key.lower() for bad in insecure_keys) or len(s.secret_key) < 32:
            raise RuntimeError(
                "CRITICAL SECURITY FAILURE: GrievanceGrid cannot start in production with an insecure or default secret key. "
                "Set GG_SECRET_KEY to a cryptographically random string (min 32 characters)."
            )

    print("=" * 60)
    print("  GRIEVANCEGRID MUNICIPAL WORKSPACE — BACKEND STARTED")
    print("=" * 60)
    print(f"  Municipality:   {s.jurisdiction_name} ({s.jurisdiction_id})")
    print(f"  Emergency No:   {s.emergency_number}")
    print(f"  Environment:    {s.environment}")
    print(f"  Database URL:   {s.database_url.split('@')[-1] if '@' in s.database_url else s.database_url}")
    print(f"  Mail Backend:   {s.mail_backend}")
    print(f"  Redis URL:      {s.redis_url}")
    print(f"  ML Suggestions: {'Enabled' if s.ml_enabled else 'Disabled'}")
    print(f"  SSE Stream:     /api/v1/events/stream")
    print("=" * 60)


@app.middleware("http")
async def basic_guards(request: Request, call_next):
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > 10 * 1024 * 1024:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid request length"}, status_code=400)
    # Development safeguard only. Production needs a shared gateway/IP rate limiter.
    if request.method == "POST" and request.url.path in (
        "/api/v1/auth/login",
        "/api/v1/auth/register",
    ):
        key = request.client.host if request.client else "unknown"
        with auth_lock:
            now = monotonic()
            while auth_attempts[key] and auth_attempts[key][0] < now - 60:
                auth_attempts[key].popleft()
            if len(auth_attempts[key]) >= 30:
                return JSONResponse(
                    {"detail": "Too many attempts; try again shortly"},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
            auth_attempts[key].append(now)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
@app.get("/health/live")
def health_live():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/ready")
@app.get("/health/ready")
def health_ready(db: Database):
    checks = {"database": "ok", "redis": "unknown"}
    try:
        db.execute(text("SELECT 1 FROM users LIMIT 1"))
    except Exception:
        return JSONResponse({"status": "not_ready", "checks": {"database": "error"}}, status_code=503)
    
    # Try redis ping if available
    try:
        import redis
        r = redis.Redis.from_url(settings.redis_url, socket_timeout=1)
        if r.ping():
            checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"

    return {"status": "ready", "checks": checks}


@app.get("/api/v1/config")
def public_config():
    return {
        "jurisdiction_id": settings.jurisdiction_id,
        "jurisdiction_name": settings.jurisdiction_name,
        "categories": [{"id": key, "label": label} for key, label in CATEGORY_LABELS.items()],
        "analysis_state": "disabled",
        "notice": "GrievanceGrid Public Services Portal. Not an emergency service.",
    }


app.include_router(auth_router, prefix="/api/v1")
app.include_router(complaint_router, prefix="/api/v1")
app.include_router(evidence_router, prefix="/api/v1")
app.include_router(categories_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(assignments_router, prefix="/api/v1")
app.include_router(metrics_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(senior_router, prefix="/api/v1")
app.include_router(suggestions_router, prefix="/api/v1")
app.include_router(clustering_router)
app.include_router(events_router, prefix="/api/v1")
app.include_router(events_router)



