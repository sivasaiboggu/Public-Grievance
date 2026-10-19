"""Incident Clustering Engine: group reports of the same category at the same place.

Radii rules:
- Manhole or open drain: 30 m (0.030 km)
- Road damage: 60 m (0.060 km)
- Garbage: 100 m (0.100 km)
- Waterlogging: 200 m (0.200 km)

Window: 30 days (or 90 days for recurrence detection).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    Complaint,
    IncidentCluster,
    IncidentClusterMember,
    IncidentLink,
    new_id,
)
from app.ml.incident_matcher import haversine_distance_km, score_strategy_2

CATEGORY_RADII_KM = {
    "open_drain": 0.030,
    "manhole": 0.030,
    "road_damage": 0.060,
    "garbage": 0.100,
    "waterlogging": 0.200,
}

DEFAULT_RADIUS_KM = 0.060


def get_category_radius_km(category: str) -> float:
    return CATEGORY_RADII_KM.get(category, DEFAULT_RADIUS_KM)


def assign_report_to_cluster(db: Session, complaint: Complaint) -> str | None:
    """Incrementally cluster a new complaint into an existing active cluster or form a new one."""
    radius_km = get_category_radius_km(complaint.category)
    now = datetime.now(UTC)
    window_start = now - timedelta(days=30)

    # 1. Look for existing clusters in the same category within radius
    clusters = list(
        db.scalars(
            select(IncidentCluster).where(
                IncidentCluster.category == complaint.category,
                IncidentCluster.closed_at.is_(None),
            )
        )
    )

    for cluster in clusters:
        dist = haversine_distance_km(
            complaint.latitude,
            complaint.longitude,
            cluster.center_latitude,
            cluster.center_longitude,
        )
        if dist <= radius_km:
            # Check if any member has a "different_problem" link with this complaint
            member_ids = list(
                db.scalars(
                    select(IncidentClusterMember.report_id).where(
                        IncidentClusterMember.cluster_id == cluster.id
                    )
                )
            )
            has_diff = db.scalar(
                select(IncidentLink).where(
                    IncidentLink.decision == "different_problem",
                    or_(
                        (IncidentLink.report_id_1 == complaint.id) & IncidentLink.report_id_2.in_(member_ids),
                        (IncidentLink.report_id_2 == complaint.id) & IncidentLink.report_id_1.in_(member_ids),
                    ),
                )
            )
            if has_diff:
                continue

            # Join this cluster
            member = db.scalar(
                select(IncidentClusterMember).where(
                    IncidentClusterMember.cluster_id == cluster.id,
                    IncidentClusterMember.report_id == complaint.id,
                )
            )
            if not member:
                db.add(
                    IncidentClusterMember(
                        id=new_id(),
                        cluster_id=cluster.id,
                        report_id=complaint.id,
                        added_by="auto",
                        score=max(0.70, 1.0 - (dist / radius_km) * 0.3),
                        created_at=now,
                    )
                )
            complaint.cluster_id = cluster.id
            db.commit()
            return cluster.id

    # 2. Look for nearby complaints of the same category within the time window
    nearby_comps = list(
        db.scalars(
            select(Complaint).where(
                Complaint.id != complaint.id,
                Complaint.category == complaint.category,
                Complaint.received_at >= window_start,
                Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            )
        )
    )

    matching_peers: list[Complaint] = []
    for peer in nearby_comps:
        dist = haversine_distance_km(
            complaint.latitude,
            complaint.longitude,
            peer.latitude,
            peer.longitude,
        )
        if dist <= radius_km:
            # Verify no different_problem link
            has_diff = db.scalar(
                select(IncidentLink).where(
                    IncidentLink.decision == "different_problem",
                    or_(
                        (IncidentLink.report_id_1 == complaint.id) & (IncidentLink.report_id_2 == peer.id),
                        (IncidentLink.report_id_2 == complaint.id) & (IncidentLink.report_id_1 == peer.id),
                    ),
                )
            )
            if not has_diff:
                matching_peers.append(peer)

    if matching_peers:
        # Create a new cluster grouping these reports
        cluster_id = new_id()
        cluster = IncidentCluster(
            id=cluster_id,
            category=complaint.category,
            center_latitude=complaint.latitude,
            center_longitude=complaint.longitude,
            center_address=complaint.location_text or complaint.area_name,
            first_reported_at=min(complaint.received_at, min(p.received_at for p in matching_peers)),
            state="suggested",
            created_at=now,
        )
        db.add(cluster)
        db.flush()

        # Add complaint itself
        db.add(
            IncidentClusterMember(
                id=new_id(),
                cluster_id=cluster_id,
                report_id=complaint.id,
                added_by="auto",
                score=1.0,
                created_at=now,
            )
        )
        complaint.cluster_id = cluster_id

        # Add matching peers
        for p in matching_peers:
            if not p.cluster_id:
                p.cluster_id = cluster_id
            db.add(
                IncidentClusterMember(
                    id=new_id(),
                    cluster_id=cluster_id,
                    report_id=p.id,
                    added_by="auto",
                    score=0.85,
                    created_at=now,
                )
            )

        db.commit()
        return cluster_id

    return None


def rebuild_clusters(db: Session) -> dict[str, int]:
    """Nightly deterministic batch job to synchronize and verify all incident clusters."""
    now = datetime.now(UTC)
    active_comps = list(
        db.scalars(
            select(Complaint)
            .where(Complaint.status.in_(["submitted", "under_review", "in_progress"]))
            .order_by(Complaint.received_at.asc())
        )
    )

    clusters_formed = 0
    for comp in active_comps:
        cid = assign_report_to_cluster(db, comp)
        if cid:
            clusters_formed += 1

    return {"active_checked": len(active_comps), "clusters_assigned": clusters_formed}
