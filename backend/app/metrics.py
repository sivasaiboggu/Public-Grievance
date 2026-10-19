import csv
import io
import json
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import get_settings
from app.models import (
    Assignment,
    CategoryRecord,
    Complaint,
    ComplaintStatus,
    Role,
    StatusEvent,
    Team,
    User,
)
from app.security import CurrentUser, Database

router = APIRouter(prefix="/metrics", tags=["Senior Authority Metrics"])


def require_supervisor_or_admin(user: CurrentUser) -> User:
    if user.role not in (Role.SUPERVISOR, Role.ADMIN, Role.GRO):
        raise HTTPException(403, "Senior authority or admin authorization required")
    return user


SeniorUser = Annotated[User, Depends(require_supervisor_or_admin)]


def get_redis_client():
    try:
        import redis
        client = redis.Redis.from_url(get_settings().redis_url, socket_timeout=1, socket_connect_timeout=1)
        client.ping()
        return client
    except Exception:
        return None


@router.get("/overview")
def get_metrics_overview(
    user: SeniorUser,
    db: Database,
    period: Literal["7d", "30d", "90d"] = Query(default="30d"),
):
    """Aggregate metrics for Senior Authority with 60-second Redis cache."""
    cache_key = f"metrics:overview:{user.jurisdiction_id}:{period}"
    redis_client = get_redis_client()
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    now = datetime.now(UTC)
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map[period]
    period_start = now - timedelta(days=days)
    prev_period_start = period_start - timedelta(days=days)

    # 1. Four summary numbers (Current period vs Previous period)
    current_received = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.jurisdiction_id == user.jurisdiction_id,
            Complaint.received_at >= period_start,
        )
    ) or 0

    prev_received = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.jurisdiction_id == user.jurisdiction_id,
            Complaint.received_at >= prev_period_start,
            Complaint.received_at < period_start,
        )
    ) or 0

    current_fixed = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.jurisdiction_id == user.jurisdiction_id,
            Complaint.status == ComplaintStatus.RESOLVED,
            Complaint.updated_at >= period_start,
        )
    ) or 0

    prev_fixed = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.jurisdiction_id == user.jurisdiction_id,
            Complaint.status == ComplaintStatus.RESOLVED,
            Complaint.updated_at >= prev_period_start,
            Complaint.updated_at < period_start,
        )
    ) or 0

    # Overdue reports: open and past 7 days
    seven_days_ago = now - timedelta(days=7)
    current_overdue = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.jurisdiction_id == user.jurisdiction_id,
            Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            Complaint.received_at < seven_days_ago,
        )
    ) or 0

    # Average time to fix (hours) for resolved complaints in this period
    resolved_in_period = list(
        db.execute(
            select(Complaint.received_at, Complaint.updated_at)
            .where(
                Complaint.jurisdiction_id == user.jurisdiction_id,
                Complaint.status == ComplaintStatus.RESOLVED,
                Complaint.updated_at >= period_start,
            )
        ).all()
    )

    avg_fix_hours = 0
    if resolved_in_period:
        total_hours = sum(
            (
                (u.replace(tzinfo=UTC) if u.tzinfo is None else u) -
                (r.replace(tzinfo=UTC) if r.tzinfo is None else r)
            ).total_seconds() / 3600
            for r, u in resolved_in_period
        )
        avg_fix_hours = round(total_hours / len(resolved_in_period), 1)

    # 2. Reports per day time-series (Recharts friendly)
    daily_counts = []
    for i in range(days - 1, -1, -1):
        day_date = (now - timedelta(days=i)).date()
        next_date = day_date + timedelta(days=1)
        count = db.scalar(
            select(func.count())
            .select_from(Complaint)
            .where(
                Complaint.jurisdiction_id == user.jurisdiction_id,
                Complaint.received_at >= datetime.combine(day_date, datetime.min.time(), tzinfo=UTC),
                Complaint.received_at < datetime.combine(next_date, datetime.min.time(), tzinfo=UTC),
            )
        ) or 0
        daily_counts.append({
            "date": day_date.strftime("%b %d"),
            "full_date": str(day_date),
            "reports": count,
        })

    # 3. Reports by Category & On-time vs Late
    categories = list(db.scalars(select(CategoryRecord).order_by(CategoryRecord.label)))
    category_breakdown = []
    ontime_breakdown = []

    for cat in categories:
        cat_total = db.scalar(
            select(func.count())
            .select_from(Complaint)
            .where(
                Complaint.jurisdiction_id == user.jurisdiction_id,
                Complaint.category == cat.code,
                Complaint.received_at >= period_start,
            )
        ) or 0

        # On-time vs overdue for this category from fixed reports in the period
        target_delta = timedelta(hours=cat.target_hours)
        cat_fixed_complaints = list(
            db.execute(
                select(Complaint.received_at, Complaint.updated_at)
                .where(
                    Complaint.jurisdiction_id == user.jurisdiction_id,
                    Complaint.category == cat.code,
                    Complaint.status == ComplaintStatus.RESOLVED,
                    Complaint.updated_at >= period_start,
                )
            ).all()
        )

        fixed_on_time = 0
        fixed_late = 0
        for r_at, u_at in cat_fixed_complaints:
            recv = r_at.replace(tzinfo=UTC) if r_at.tzinfo is None else r_at
            upd = u_at.replace(tzinfo=UTC) if u_at.tzinfo is None else u_at
            if (upd - recv) <= target_delta:
                fixed_on_time += 1
            else:
                fixed_late += 1
        if not cat.active and cat_total == 0 and fixed_on_time == 0 and fixed_late == 0:
            continue

        category_breakdown.append({
            "category": cat.label,
            "code": cat.code,
            "count": cat_total,
            "target_days": max(1, round(cat.target_hours / 24)),
        })

        ontime_breakdown.append({
            "category": cat.label,
            "code": cat.code,
            "fixed_on_time": fixed_on_time,
            "fixed_late": fixed_late,
            "ontime": fixed_on_time,
            "late": fixed_late,
            "target_days": max(1, round(cat.target_hours / 24)),
        })

    # 4. Hotspots: Top 5 wards/areas with open reports
    hotspots_raw = list(
        db.execute(
            select(
                func.coalesce(Complaint.area_name, Complaint.location_text).label("area"),
                func.count().label("open_count"),
                func.avg(Complaint.latitude).label("avg_lat"),
                func.avg(Complaint.longitude).label("avg_lng"),
            )
            .where(
                Complaint.jurisdiction_id == user.jurisdiction_id,
                Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            )
            .group_by("area")
            .order_by(func.count().desc())
            .limit(5)
        ).all()
    )

    hotspots = [
        {
            "location": row[0] or "Central Ward",
            "area_name": row[0] or "Central Ward",
            "count": row[1],
            "latitude": round(row[2], 5) if row[2] else 0.0,
            "longitude": round(row[3], 5) if row[3] else 0.0,
        }
        for row in hotspots_raw
    ]

    # 5. Teams table performance
    teams = list(db.scalars(select(Team).order_by(Team.name)))
    teams_stats = []
    for t in teams:
        assigned_tasks = list(
            db.execute(
                select(Assignment, Complaint)
                .join(Complaint, Assignment.complaint_id == Complaint.id)
                .where(
                    Assignment.team_id == t.id,
                    Assignment.assigned_at >= period_start,
                )
            ).all()
        )

        open_cnt = sum(1 for a, c in assigned_tasks if a.status in ("assigned", "in_progress"))
        fixed_cnt = sum(1 for a, c in assigned_tasks if a.status == "completed")
        overdue_cnt = 0
        durations = []
        for a, c in assigned_tasks:
            if a.status in ("assigned", "in_progress"):
                as_time = a.assigned_at.replace(tzinfo=UTC) if a.assigned_at.tzinfo is None else a.assigned_at
                if (now - as_time).days >= 7:
                    overdue_cnt += 1
            elif a.status == "completed" and a.completed_at and a.assigned_at:
                c_time = a.completed_at.replace(tzinfo=UTC) if a.completed_at.tzinfo is None else a.completed_at
                a_time = a.assigned_at.replace(tzinfo=UTC) if a.assigned_at.tzinfo is None else a.assigned_at
                durations.append((c_time - a_time).total_seconds() / 3600)

        if durations:
            avg_h = sum(durations) / len(durations)
            avg_days = int(avg_h // 24)
            rem_h = int(avg_h % 24)
            if avg_days > 0:
                avg_str = f"{avg_days}d {rem_h}h"
            else:
                avg_str = f"{rem_h}h"
        else:
            avg_str = "No jobs yet"

        teams_stats.append({
            "id": t.id,
            "name": t.name or "General Maintenance",
            "open": open_cnt,
            "fixed": fixed_cnt,
            "overdue": overdue_cnt,
            "avg_time": avg_str,
            "total_assigned": len(assigned_tasks),
        })

    # 6. Oldest open reports (top 8)
    oldest_reports = list(
        db.scalars(
            select(Complaint)
            .where(
                Complaint.jurisdiction_id == user.jurisdiction_id,
                Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            )
            .order_by(Complaint.received_at.asc())
            .limit(8)
        )
    )

    oldest_list = []
    for c in oldest_reports:
        r_time = c.received_at.replace(tzinfo=UTC) if c.received_at.tzinfo is None else c.received_at
        days_open = (now - r_time).days
        overdue_by = max(0, days_open - 7)
        oldest_list.append({
            "id": c.id,
            "tracking_id": c.tracking_id,
            "title": c.title,
            "category": c.category,
            "status": c.status,
            "area_name": c.area_name or c.location_text,
            "location_text": c.location_text,
            "received_at": c.received_at.isoformat(),
            "days_open": days_open,
            "days_overdue": overdue_by,
        })

    response_data = {
        "period": period,
        "area_name": get_settings().jurisdiction_name,
        "summary": {
            "received": {
                "value": current_received,
                "change": current_received - prev_received,
                "change_text": (
                    f"{abs(current_received - prev_received)} {'more' if current_received >= prev_received else 'fewer'} than previous period"
                ),
            },
            "fixed": {
                "value": current_fixed,
                "change": current_fixed - prev_fixed,
                "change_text": (
                    f"{abs(current_fixed - prev_fixed)} {'more' if current_fixed >= prev_fixed else 'fewer'} than previous period"
                ),
            },
            "overdue": {
                "value": current_overdue,
                "change_text": f"{current_overdue} reports currently past target resolution",
            },
            "avg_fix_hours": {
                "value": avg_fix_hours,
                "change_text": f"Approx {round(avg_fix_hours / 24, 1)} days average resolution time",
            },
        },
        "daily_counts": daily_counts,
        "category_breakdown": category_breakdown,
        "ontime_breakdown": ontime_breakdown,
        "hotspots": hotspots,
        "teams_stats": teams_stats,
        "oldest_reports": oldest_list,
    }

    if redis_client:
        try:
            redis_client.setex(cache_key, 60, json.dumps(response_data))
        except Exception:
            pass

    return response_data


@router.get("/export")
def export_metrics_csv(
    user: SeniorUser,
    db: Database,
    period: Literal["7d", "30d", "90d"] = Query(default="30d"),
):
    """Download summary CSV report for Senior Authority."""
    now = datetime.now(UTC)
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map[period]
    period_start = now - timedelta(days=days)

    complaints = list(
        db.scalars(
            select(Complaint)
            .where(
                Complaint.jurisdiction_id == user.jurisdiction_id,
                Complaint.received_at >= period_start,
            )
            .order_by(Complaint.received_at.desc())
        )
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Tracking ID",
        "Category",
        "Title",
        "Status",
        "Location",
        "Coordinates",
        "Received At",
        "Updated At",
    ])

    for c in complaints:
        writer.writerow([
            c.tracking_id,
            c.category,
            c.title,
            c.status,
            c.location_text,
            f"{c.latitude},{c.longitude}",
            c.received_at.isoformat() if c.received_at else "",
            c.updated_at.isoformat() if c.updated_at else "",
        ])

    csv_data = output.getvalue()
    filename = f"grievancegrid_summary_{period}_{now.strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
