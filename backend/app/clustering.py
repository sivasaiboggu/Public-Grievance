import math
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import (
    Complaint,
    IncidentCluster,
    IncidentClusterMember,
    IncidentLink,
    Role,
    User,
    new_id,
)
from app.security import CurrentUser, Database

router = APIRouter(tags=["Clustering"])

CATEGORY_RADII = {
    "manhole": 30.0,
    "road_damage": 60.0,
    "garbage": 100.0,
    "waterlogging": 200.0,
}


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two coordinates."""
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def assign_report_to_cluster(db: Session, complaint_id: str) -> IncidentCluster | None:
    """
    Incrementally match a report to existing clusters of the same category,
    or create a new cluster suggestion.
    """
    report = db.get(Complaint, complaint_id)
    if not report or report.latitude is None or report.longitude is None:
        return None

    settings = get_settings()
    category_radius = CATEGORY_RADII.get(report.category, 60.0)
    now = datetime.now(UTC)
    window_start = now - timedelta(days=settings.cluster_window_days)

    # 1. Check existing clusters for this category
    open_clusters = list(
        db.scalars(
            select(IncidentCluster).where(
                IncidentCluster.category == report.category,
                IncidentCluster.closed_at.is_(None),
            )
        )
    )

    best_cluster = None
    best_distance = float("inf")

    for cl in open_clusters:
        dist = haversine_distance_meters(
            report.latitude, report.longitude, cl.center_latitude, cl.center_longitude
        )
        if dist <= category_radius and dist < best_distance:
            # Verify explicit "different" decision hasn't been made
            members = list(
                db.scalars(
                    select(IncidentClusterMember.report_id).where(
                        IncidentClusterMember.cluster_id == cl.id
                    )
                )
            )
            # If any member in this cluster has an explicit "different" link to this report, skip
            has_different = db.scalar(
                select(IncidentLink).where(
                    IncidentLink.status == "rejected",
                    (
                        (IncidentLink.anchor_id == report.id)
                        & (IncidentLink.candidate_id.in_(members))
                    )
                    | (
                        (IncidentLink.candidate_id == report.id)
                        & (IncidentLink.anchor_id.in_(members))
                    ),
                )
            )
            if not has_different:
                best_cluster = cl
                best_distance = dist

    if best_cluster:
        # Check if already a member
        existing_member = db.scalar(
            select(IncidentClusterMember).where(
                IncidentClusterMember.cluster_id == best_cluster.id,
                IncidentClusterMember.report_id == report.id,
            )
        )
        if not existing_member:
            score = max(0.0, 1.0 - (best_distance / max(1.0, category_radius)))
            member = IncidentClusterMember(
                cluster_id=best_cluster.id,
                report_id=report.id,
                added_by="auto",
                score=round(score, 3),
            )
            db.add(member)
            report.cluster_id = best_cluster.id

            # Re-center cluster coordinates
            all_members = list(
                db.scalars(
                    select(Complaint).join(
                        IncidentClusterMember, IncidentClusterMember.report_id == Complaint.id
                    ).where(IncidentClusterMember.cluster_id == best_cluster.id)
                )
            )
            all_members.append(report)
            valid_coords = [(m.latitude, m.longitude) for m in all_members if m.latitude and m.longitude]
            if valid_coords:
                best_cluster.center_latitude = sum(c[0] for c in valid_coords) / len(valid_coords)
                best_cluster.center_longitude = sum(c[1] for c in valid_coords) / len(valid_coords)

            db.commit()
        return best_cluster
    else:
        # Create new suggested cluster
        new_cl = IncidentCluster(
            category=report.category,
            center_latitude=report.latitude,
            center_longitude=report.longitude,
            center_address=getattr(report, "location_text", None) or getattr(report, "location_description", ""),
            first_reported_at=report.received_at,
            state="suggested",
        )
        db.add(new_cl)
        db.flush()

        member = IncidentClusterMember(
            cluster_id=new_cl.id,
            report_id=report.id,
            added_by="auto",
            score=1.0,
        )
        db.add(member)
        report.cluster_id = new_cl.id
        db.commit()
        return new_cl


def rebuild_clusters(db: Session) -> int:
    """Idempotently re-evaluates all open reports and clusters them."""
    open_reports = list(
        db.scalars(
            select(Complaint).where(
                Complaint.status.in_(["submitted", "under_review", "in_progress"]),
                Complaint.latitude.is_not(None),
                Complaint.longitude.is_not(None),
            ).order_by(Complaint.received_at.asc())
        )
    )
    count = 0
    for r in open_reports:
        res = assign_report_to_cluster(db, r.id)
        if res:
            count += 1
    return count


class ClusterMemberOut(BaseModel):
    id: str
    tracking_id: str
    title: str
    location: str | None
    latitude: float | None
    longitude: float | None
    distance_meters: float
    days_apart: int
    status: str
    added_by: str


class ClusterDetailOut(BaseModel):
    cluster_id: str
    category: str
    state: str  # suggested, confirmed
    is_clustered: bool
    total_members: int
    members: list[ClusterMemberOut]
    is_recurrence: bool = False
    resident_line: str = "Other people reported this too. We are handling it together."


@router.get("/api/v1/complaints/{complaint_id}/cluster", response_model=ClusterDetailOut)
def get_complaint_cluster(complaint_id: str, db: Database, user: CurrentUser):
    """Retrieve cluster members for an officer or citizen."""
    comp = db.scalar(
        select(Complaint).where(or_(Complaint.id == complaint_id, Complaint.tracking_id == complaint_id))
    )
    if not comp:
        raise HTTPException(404, "Complaint not found")

    member_record = db.scalar(
        select(IncidentClusterMember).where(IncidentClusterMember.report_id == comp.id)
    )
    if not member_record:
        # Check if we should cluster on the fly
        cl = assign_report_to_cluster(db, comp.id)
        if cl:
            member_record = db.scalar(
                select(IncidentClusterMember).where(
                    IncidentClusterMember.cluster_id == cl.id,
                    IncidentClusterMember.report_id == comp.id,
                )
            )

    if not member_record:
        return ClusterDetailOut(
            cluster_id="",
            category=comp.category,
            state="single",
            is_clustered=False,
            total_members=1,
            members=[],
            is_recurrence=False,
        )

    cluster = db.get(IncidentCluster, member_record.cluster_id)
    if not cluster:
        return ClusterDetailOut(
            cluster_id="",
            category=comp.category,
            state="single",
            is_clustered=False,
            total_members=1,
            members=[],
            is_recurrence=False,
        )

    # Fetch all members of this cluster
    all_member_records = list(
        db.scalars(
            select(IncidentClusterMember).where(IncidentClusterMember.cluster_id == cluster.id)
        )
    )

    members_out: list[ClusterMemberOut] = []
    comp_rcv = comp.received_at.replace(tzinfo=UTC) if comp.received_at.tzinfo is None else comp.received_at

    for m in all_member_records:
        if m.report_id == complaint_id and len(all_member_records) > 1:
            continue
        c = db.get(Complaint, m.report_id)
        if not c:
            continue

        c_rcv = c.received_at.replace(tzinfo=UTC) if c.received_at.tzinfo is None else c.received_at
        days_apart = abs((comp_rcv - c_rcv).days)
        dist = 0.0
        if comp.latitude and comp.longitude and c.latitude and c.longitude:
            dist = haversine_distance_meters(comp.latitude, comp.longitude, c.latitude, c.longitude)

        # Citizens only see that a cluster exists, not other people's details
        if user.role == Role.CITIZEN and c.id != comp.id:
            continue

        members_out.append(
            ClusterMemberOut(
                id=c.id,
                tracking_id=c.tracking_id,
                title=c.title,
                location=c.location_description,
                latitude=c.latitude,
                longitude=c.longitude,
                distance_meters=round(dist, 1),
                days_apart=days_apart,
                status=c.status,
                added_by=m.added_by,
            )
        )

    is_clustered = len(all_member_records) > 1

    return ClusterDetailOut(
        cluster_id=cluster.id,
        category=cluster.category,
        state=cluster.state,
        is_clustered=is_clustered,
        total_members=len(all_member_records),
        members=members_out,
        is_recurrence=False,
    )


class ClusterDecisionRequest(BaseModel):
    decision: str  # same_problem, different_problem, came_back


@router.post("/api/v1/complaints/{complaint_id}/cluster/decision")
def record_cluster_decision(
    complaint_id: str,
    payload: ClusterDecisionRequest,
    db: Database,
    user: CurrentUser,
):
    """Officer decision on a suggested cluster: Same problem, Different problem, or Came back."""
    if user.role not in (Role.GRO, Role.ADMIN, Role.SUPERVISOR):
        raise HTTPException(403, "Only officers can record cluster decisions")

    comp = db.scalar(
        select(Complaint).where(or_(Complaint.id == complaint_id, Complaint.tracking_id == complaint_id))
    )
    if not comp:
        raise HTTPException(404, "Complaint not found")

    member = db.scalar(
        select(IncidentClusterMember).where(IncidentClusterMember.report_id == comp.id)
    )
    if not member:
        raise HTTPException(404, "Report is not currently in a cluster")

    cluster = db.get(IncidentCluster, member.cluster_id)
    if not cluster:
        raise HTTPException(404, "Cluster not found")

    if payload.decision == "same_problem":
        cluster.state = "confirmed"
        member.added_by = "officer"
        db.commit()
        return {"status": "success", "cluster_state": "confirmed", "message": "Cluster confirmed by officer."}
    elif payload.decision == "different_problem":
        # Separate this member into their own cluster
        db.delete(member)
        db.flush()
        # Create separate cluster for this report
        new_cl = IncidentCluster(
            category=comp.category,
            center_latitude=comp.latitude or cluster.center_latitude,
            center_longitude=comp.longitude or cluster.center_longitude,
            center_address=comp.location_description,
            first_reported_at=comp.received_at,
            state="single",
        )
        db.add(new_cl)
        db.flush()
        new_m = IncidentClusterMember(
            cluster_id=new_cl.id,
            report_id=comp.id,
            added_by="officer",
            score=1.0,
        )
        db.add(new_m)
        db.commit()
        return {"status": "success", "cluster_state": "separated", "message": "Report separated from cluster."}
    elif payload.decision == "came_back":
        cluster.state = "recurrence"
        member.added_by = "officer"
        db.commit()
        return {"status": "success", "cluster_state": "recurrence", "message": "Marked as recurring issue."}

    raise HTTPException(400, "Invalid decision choice")


@router.get("/api/v1/senior/clusters")
def get_senior_clusters(db: Database, user: CurrentUser):
    """
    Ranks clusters and areas for senior overview: '5 reports, 2 problems'
    with point clustering coordinates for map bubbles.
    """
    if user.role not in (Role.SUPERVISOR, Role.ADMIN, Role.GRO):
        raise HTTPException(403, "Senior authority access required")

    clusters = list(
        db.scalars(
            select(IncidentCluster)
            .where(IncidentCluster.closed_at.is_(None))
            .order_by(IncidentCluster.created_at.desc())
        )
    )

    result = []
    for cl in clusters:
        members = list(
            db.scalars(
                select(IncidentClusterMember).where(IncidentClusterMember.cluster_id == cl.id)
            )
        )
        comp_statuses = list(
            db.scalars(
                select(Complaint.status).join(
                    IncidentClusterMember, IncidentClusterMember.report_id == Complaint.id
                ).where(IncidentClusterMember.cluster_id == cl.id)
            )
        )
        open_count = sum(1 for s in comp_statuses if s in ("submitted", "under_review", "in_progress"))

        result.append({
            "id": cl.id,
            "category": cl.category,
            "center_latitude": cl.center_latitude,
            "center_longitude": cl.center_longitude,
            "center_address": cl.center_address or "Municipal Ward",
            "state": cl.state,
            "is_estimated": cl.state == "suggested",
            "report_count": len(members),
            "open_report_count": open_count,
            "summary_text": f"{len(members)} {'report' if len(members) == 1 else 'reports'}, 1 problem ({'estimated' if cl.state == 'suggested' else 'confirmed'})",
        })

    result.sort(key=lambda x: x["report_count"], reverse=True)
    return {"clusters": result, "total_clusters": len(result)}
