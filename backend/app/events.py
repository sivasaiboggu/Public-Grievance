import asyncio
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime
from time import monotonic
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AuthSession, Notification, Role, User
from app.security import token_digest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Real-time Events"])

# In-memory queues for active local SSE listeners: user_id -> set of asyncio.Queue
_active_user_queues: dict[str, set[asyncio.Queue]] = defaultdict(set)
_active_role_queues: dict[str, set[asyncio.Queue]] = defaultdict(set)
_user_stream_counts: dict[str, int] = defaultdict(int)
_redis_down_until: float = 0.0


def dispatch_event(
    event_type: str,
    data: dict,
    user_ids: list[str] | str | None = None,
    role: str | None = None,
    event_id: str | None = None,
):
    """Publish an event to SSE listeners via local in-memory queues and Redis pub/sub."""
    if event_id is None:
        event_id = f"{int(datetime.now(UTC).timestamp() * 1000)}"

    payload = {
        "event_id": str(event_id),
        "event_type": event_type,
        "data": data,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    payload_str = json.dumps(payload)

    # 1. Dispatch locally in-memory to connected SSE streams
    if user_ids:
        if isinstance(user_ids, str):
            user_ids = [user_ids]
        for uid in user_ids:
            for q in list(_active_user_queues.get(uid, [])):
                try:
                    q.put_nowait(payload)
                except Exception:
                    pass

    if role:
        for q in list(_active_role_queues.get(role, [])):
            try:
                q.put_nowait(payload)
            except Exception:
                pass

    # 2. Publish to Redis if configured and reachable
    global _redis_down_until
    settings = get_settings()
    now_mono = monotonic()
    if settings.redis_url and now_mono > _redis_down_until:
        try:
            import redis
            r = redis.Redis.from_url(settings.redis_url, socket_timeout=0.2)
            if user_ids:
                for uid in user_ids:
                    r.publish(f"gg:events:user:{uid}", payload_str)
            if role:
                r.publish(f"gg:events:role:{role}", payload_str)
        except Exception:
            # Circuit break Redis attempts for 30s so requests are instant when Redis is offline
            _redis_down_until = now_mono + 30.0


def get_user_from_token(token: str, db: Session) -> User:
    """Validate Bearer token and return active User."""
    session = db.get(AuthSession, token_digest(token))
    if session is None:
        raise HTTPException(401, "Session expired or invalid")
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    user = db.get(User, session.user_id)
    if expires <= datetime.now(UTC) or user is None or not user.active or getattr(user, "status", "active") == "disabled":
        raise HTTPException(401, "Session expired or account disabled")
    return user


async def sse_event_generator(
    user: User,
    last_event_id: str | None,
    db_session_factory,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    user_queue: asyncio.Queue = asyncio.Queue()

    # Track stream connection
    _active_user_queues[user.id].add(user_queue)
    if user.role:
        _active_role_queues[user.role.value if hasattr(user.role, "value") else str(user.role)].add(user_queue)
    _user_stream_counts[user.id] += 1

    try:
        # Initial connected event
        init_data = json.dumps({"status": "connected", "user_id": user.id, "role": user.role})
        yield f"event: heartbeat\ndata: {init_data}\n\n"

        # Check for missed notifications if last_event_id provided
        if last_event_id:
            try:
                with db_session_factory() as db:
                    missed = list(
                        db.scalars(
                            select(Notification)
                            .where(Notification.user_id == user.id, Notification.read == False)
                            .order_by(Notification.created_at.asc())
                            .limit(10)
                        )
                    )
                    for n in missed:
                        n_data = {
                            "id": n.id,
                            "title": n.title,
                            "body": n.body,
                            "link": n.link,
                            "created_at": n.created_at.isoformat() if n.created_at else "",
                        }
                        yield f"id: {n.id}\nevent: notification.created\ndata: {json.dumps(n_data)}\n\n"
            except Exception as e:
                logger.warning(f"Error replaying missed events: {e}")

        # Stream loop with heartbeat
        heartbeat_interval = max(5, settings.sse_heartbeat_seconds)
        while True:
            try:
                event_item = await asyncio.wait_for(user_queue.get(), timeout=heartbeat_interval)
                eid = event_item.get("event_id", "")
                etype = event_item.get("event_type", "message")
                edata = json.dumps(event_item.get("data", {}))
                yield f"id: {eid}\nevent: {etype}\ndata: {edata}\n\n"
            except asyncio.TimeoutError:
                # Send periodic heartbeat
                hb = json.dumps({"timestamp": datetime.now(UTC).isoformat()})
                yield f"event: heartbeat\ndata: {hb}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        _active_user_queues[user.id].discard(user_queue)
        if user.role:
            _active_role_queues[user.role.value if hasattr(user.role, "value") else str(user.role)].discard(user_queue)
        _user_stream_counts[user.id] = max(0, _user_stream_counts[user.id] - 1)


@router.get("/events/stream")
async def event_stream(
    request: Request,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
    db: Session = Depends(get_db),
):
    """
    Server-Sent Events endpoint streaming real-time notifications and updates.
    Supported by @microsoft/fetch-event-source and standard EventSource reconnects.
    """
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.split("Bearer ", 1)[1].strip()
    elif token:
        auth_token = token.strip()

    if not auth_token:
        raise HTTPException(401, "Missing authentication token for event stream")

    user = get_user_from_token(auth_token, db)
    settings = get_settings()

    if _user_stream_counts[user.id] >= settings.max_streams_per_user:
        raise HTTPException(429, "Too many active event streams for this user")

    from app.db import SessionLocal

    return StreamingResponse(
        sse_event_generator(user, last_event_id, SessionLocal),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
