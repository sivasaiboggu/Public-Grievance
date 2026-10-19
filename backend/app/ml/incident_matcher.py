"""Incident matching and duplicate scoring using MiniLM embeddings, spatial-temporal decay, and Strategy 2."""

from __future__ import annotations

import hashlib
import json
import logging
import math
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Complaint

logger = logging.getLogger("grievancegrid.ml.matcher")

_EMBEDDING_MODEL: Any | None = None


def get_embedding_model() -> Any | None:
    """Lazily load SentenceTransformer model if available."""
    global _EMBEDDING_MODEL
    if _EMBEDDING_MODEL is not None:
        return _EMBEDDING_MODEL

    settings = get_settings()
    try:
        from sentence_transformers import SentenceTransformer

        _EMBEDDING_MODEL = SentenceTransformer(settings.embedding_model)
        return _EMBEDDING_MODEL
    except Exception as e:
        logger.info("SentenceTransformer not loaded (%s). Using deterministic fallback embeddings.", e)
        return None


def compute_text_embedding(text: str) -> list[float]:
    """Generate 384-dimensional normalized dense embedding for complaint text.
    
    If SentenceTransformer is not installed or offline, generates a deterministic
    pseudo-semantic 384-float vector from word n-grams so tests and offline operation
    work cleanly without external model dependencies.
    """
    clean_text = (text or "").strip().lower()
    if not clean_text:
        return [0.0] * 384

    model = get_embedding_model()
    if model is not None:
        try:
            emb = model.encode(clean_text, normalize_embeddings=True)
            return [round(float(x), 6) for x in emb]
        except Exception as e:
            logger.warning("Encoding failed via model: %s", e)

    # Deterministic fallback embedding: 384 dimensions
    vec = np.zeros(384, dtype=np.float32)
    words = clean_text.split()
    for i, w in enumerate(words):
        h = int(hashlib.sha256(w.encode("utf-8")).hexdigest()[:8], 16)
        slot = h % 384
        vec[slot] += 1.0 / math.sqrt(i + 1)
        # Add character trigrams
        for j in range(max(0, len(w) - 2)):
            tri_h = int(hashlib.md5(w[j : j + 3].encode("utf-8")).hexdigest()[:6], 16)
            vec[tri_h % 384] += 0.5

    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return [round(float(x), 6) for x in vec]


def cosine_similarity(v1: list[float] | np.ndarray, v2: list[float] | np.ndarray) -> float:
    """Compute cosine similarity between two vector representations."""
    a = np.array(v1, dtype=np.float32)
    b = np.array(v2, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    val = float(np.dot(a, b) / (norm_a * norm_b))
    return max(0.0, min(1.0, val))


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance in kilometers between two GPS coordinates."""
    r = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def score_strategy_2(
    text_sim: float,
    same_category: bool,
    distance_km: float | None,
    days_apart: float | None,
) -> float:
    """Strategy 2 (Transparent Heuristic) from model_training_and_data_report.md.
    
    Formula:
    S = 0.50 * text_sim + 0.15 * same_category + 0.20 * exp(-dist_km / 1.0) + 0.15 * exp(-days / 3.0)
    
    If location is missing, distance term is 0.0.
    If days_apart is missing, temporal term is 0.0.
    """
    cat_val = 1.0 if same_category else 0.0
    dist_val = math.exp(-distance_km / 1.0) if distance_km is not None else 0.0
    time_val = math.exp(-days_apart / 3.0) if days_apart is not None else 0.0

    score = (
        0.50 * text_sim
        + 0.15 * cat_val
        + 0.20 * dist_val
        + 0.15 * time_val
    )
    return max(0.0, min(1.0, score))


def find_possible_duplicates(
    db: Session,
    target: Complaint,
    radius_meters: float | None = None,
    window_days: int | None = None,
    threshold: float | None = None,
    max_candidates: int = 3,
) -> list[dict[str, Any]]:
    """Retrieve and rank up to `max_candidates` potential duplicate reports using Strategy 2."""
    settings = get_settings()
    rad_m = radius_meters or settings.duplicate_radius_meters
    rad_km = rad_m / 1000.0
    win_d = window_days or settings.duplicate_window_days
    th = threshold or settings.duplicate_threshold

    # Ensure target has an embedding
    target_emb = json.loads(target.embedding_json) if target.embedding_json else None
    if not target_emb:
        target_emb = compute_text_embedding(f"{target.title} {target.description}")
        target.embedding_json = json.dumps(target_emb)
        db.add(target)
        db.flush()

    target_time = target.received_at.replace(tzinfo=UTC) if target.received_at.tzinfo is None else target.received_at
    earliest_time = target_time - timedelta(days=win_d)

    # Candidate query: open or fixed complaints in the time window (excluding self)
    query = (
        select(Complaint)
        .where(
            Complaint.id != target.id,
            Complaint.received_at >= earliest_time,
            Complaint.received_at <= target_time + timedelta(days=1),
            Complaint.status.in_(["submitted", "under_review", "in_progress", "resolved"]),
        )
    )
    candidates = list(db.scalars(query))
    ranked: list[dict[str, Any]] = []

    for c in candidates:
        c_time = c.received_at.replace(tzinfo=UTC) if c.received_at.tzinfo is None else c.received_at
        days_apart = abs((target_time - c_time).total_seconds()) / 86400.0

        dist_km: float | None = None
        if target.latitude is not None and target.longitude is not None and c.latitude is not None and c.longitude is not None:
            dist_km = haversine_distance_km(target.latitude, target.longitude, c.latitude, c.longitude)
            # Spatial filter: only consider candidates within radius (allow slight slack for margin)
            if dist_km > (rad_km * 1.5):
                continue

        c_emb = json.loads(c.embedding_json) if c.embedding_json else None
        if not c_emb:
            c_emb = compute_text_embedding(f"{c.title} {c.description}")
            c.embedding_json = json.dumps(c_emb)
            db.add(c)

        text_sim = cosine_similarity(target_emb, c_emb)
        same_cat = (target.category == c.category)

        score = score_strategy_2(
            text_sim=text_sim,
            same_category=same_cat,
            distance_km=dist_km,
            days_apart=days_apart,
        )

        if score >= th:
            ranked.append({
                "id": c.id,
                "tracking_id": c.tracking_id,
                "title": c.title,
                "category": c.category,
                "place": c.area_name or c.location_text or "Same area",
                "status": c.status,
                "distance_meters": round(dist_km * 1000) if dist_km is not None else None,
                "days_apart": round(days_apart, 1),
                "score": round(score, 4),
                "text_similarity": round(text_sim, 4),
                "received_at": c.received_at.isoformat(),
            })

    # Sort by score descending and take top N
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:max_candidates]
