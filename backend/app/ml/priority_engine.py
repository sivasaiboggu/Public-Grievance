"""Hazard-based and SLA due-date pressure priority recommendation engine."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models import CategoryRecord, Complaint, IncidentLink, MLPrediction

logger = logging.getLogger("grievancegrid.ml.priority")

PRIORITY_RANKS = {"low": 1, "medium": 2, "high": 3}
RANK_TO_PRIORITY = {1: "low", 2: "medium", 3: "high"}

# Base hazard by civic category
BASE_CATEGORY_HAZARDS = {
    "open_drain": "high",
    "manhole": "high",
    "waterlogging": "high",
    "road_damage": "medium",
    "street_light": "medium",
    "garbage": "low",
    "water_supply": "low",
    "damaged_property": "low",
    "other": "low",
}

HAZARD_RATIONALE = {
    "open_drain": "Open drain or manhole poses immediate danger to pedestrians",
    "manhole": "Missing or open manhole poses immediate danger to pedestrians",
    "waterlogging": "Water standing on the road impedes traffic and access",
    "road_damage": "Road surface defect poses vehicle and rider risk",
    "street_light": "Dark street affects pedestrian visibility and safety",
    "garbage": "Waste accumulation requires municipal clearance",
    "water_supply": "Water supply issue reported by resident",
    "damaged_property": "Public property damage requires repair",
    "other": "General civic issue",
}


def compute_priority_recommendation(
    complaint: Complaint,
    target_hours: int = 48,
    confirmed_duplicate_count: int = 1,
    photo_defect_confirmed: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Compute deterministic priority recommendation as max(hazard, due_date_pressure).
    
    Produces plain human rationale lines for 'Why this order'.
    """
    eval_time = now or datetime.now(UTC)
    received = complaint.received_at.replace(tzinfo=UTC) if complaint.received_at.tzinfo is None else complaint.received_at

    # 1. Base Hazard Calculation
    base_hazard_str = BASE_CATEGORY_HAZARDS.get(complaint.category, "low")
    hazard_rank = PRIORITY_RANKS[base_hazard_str]
    rationale_lines: list[str] = []

    cat_rationale = HAZARD_RATIONALE.get(complaint.category, "Standard civic report")
    rationale_lines.append(cat_rationale)

    # Modifier: photo check clearly showing open drain or waterlogging raises by +1
    if photo_defect_confirmed and complaint.category in ("open_drain", "manhole", "waterlogging"):
        if hazard_rank < 3:
            hazard_rank += 1
            rationale_lines.append("Photo check recognized safety defect")

    # Modifier: confirmed duplicate group of 3 or more raises by +1
    if confirmed_duplicate_count >= 3:
        if hazard_rank < 3:
            hazard_rank += 1
        rationale_lines.append(f"{confirmed_duplicate_count} reports of this problem at this place")

    # 2. Due-Date Pressure Calculation
    deadline = received + timedelta(hours=target_hours)
    remaining_seconds = (deadline - eval_time).total_seconds()
    remaining_hours = remaining_seconds / 3600.0

    target_quarter = min(24.0, target_hours * 0.25)

    if remaining_seconds <= 0:
        due_rank = 3  # High pressure (overdue)
        overdue_days = math_ceil_days(abs(remaining_hours))
        rationale_lines.append(f"Overdue by {overdue_days} day{'s' if overdue_days != 1 else ''}")
    elif remaining_hours <= target_quarter:
        due_rank = 2  # Medium pressure (due soon)
        hrs = max(1, round(remaining_hours))
        rationale_lines.append(f"Due in {hrs} hour{'s' if hrs != 1 else ''}")
    else:
        due_rank = 1  # Low pressure (on track)
        days_left = max(1, round(remaining_hours / 24.0))
        rationale_lines.append(f"Due in {days_left} day{'s' if days_left != 1 else ''}")

    # Final priority: max(hazard, due_date_pressure)
    final_rank = max(hazard_rank, due_rank)
    final_priority = RANK_TO_PRIORITY[final_rank]

    return {
        "priority": final_priority,
        "hazard_level": RANK_TO_PRIORITY[hazard_rank],
        "due_date_pressure": RANK_TO_PRIORITY[due_rank],
        "remaining_hours": round(remaining_hours, 1),
        "target_hours": target_hours,
        "why_this_order": rationale_lines,
        "summary_line": rationale_lines[0] if rationale_lines else "Priority follows category due date",
    }


def math_ceil_days(hours: float) -> int:
    days = int(hours // 24)
    return max(1, days if days > 0 else 1)
