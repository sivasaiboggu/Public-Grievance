"""GrievanceGrid Machine Learning and Decision Support Subsystem."""

from app.ml.incident_matcher import (
    compute_text_embedding,
    cosine_similarity,
    find_possible_duplicates,
    haversine_distance_km,
    score_strategy_2,
)
from app.ml.photo_classifier import (
    CATEGORY_TO_MODEL,
    MODEL_TO_CATEGORY,
    compute_dhash,
    compute_flipped_dhash,
    dhash_distance,
    run_photo_classification,
)
from app.ml.priority_engine import compute_priority_recommendation

__all__ = [
    "compute_dhash",
    "compute_flipped_dhash",
    "dhash_distance",
    "run_photo_classification",
    "CATEGORY_TO_MODEL",
    "MODEL_TO_CATEGORY",
    "compute_text_embedding",
    "cosine_similarity",
    "haversine_distance_km",
    "score_strategy_2",
    "find_possible_duplicates",
    "compute_priority_recommendation",
]
