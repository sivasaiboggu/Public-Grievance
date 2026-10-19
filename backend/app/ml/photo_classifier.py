"""Photo classifier, dHash perceptual similarity, and plain-language suggestions."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from app.config import get_settings

logger = logging.getLogger("grievancegrid.ml.photo")

# Canonical category mapping from report models to civic categories
CATEGORY_TO_MODEL = {
    "road_damage": "pothole_road_damage",
    "garbage": "garbage_dumping",
    "waterlogging": "road_waterlogging",
    "open_drain": "manhole_defect",
}

MODEL_TO_CATEGORY = {v: k for k, v in CATEGORY_TO_MODEL.items()}

CATEGORY_PLAIN_NAMES = {
    "road_damage": "a pothole",
    "garbage": "garbage",
    "waterlogging": "standing water",
    "open_drain": "an open manhole",
}

# Empirical thresholds from model_training_and_data_report.md
DEFAULT_THRESHOLDS = {
    "pothole_road_damage": {"threshold": 0.80, "version": "v1.0-e7"},
    "garbage_dumping": {"threshold": 0.70, "version": "v1.0-e4"},
    "road_waterlogging": {"threshold": 0.80, "version": "v1.0-e4"},
    "manhole_defect": {"threshold": 0.40, "version": "v1.0-e9"},
}

_ONNX_SESSIONS: dict[str, Any] = {}


def compute_dhash(img: Image.Image, hash_size: int = 8) -> str:
    """Compute 64-bit difference perceptual hash (8x8 difference matrix)."""
    resized = img.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    pixels = np.array(resized, dtype=np.int32)
    diff = pixels[:, 1:] > pixels[:, :-1]
    decimal_val = 0
    for idx, val in enumerate(diff.flatten()):
        if val:
            decimal_val |= 1 << idx
    return f"{decimal_val:016x}"


def compute_flipped_dhash(img: Image.Image, hash_size: int = 8) -> str:
    """Compute dHash on horizontally flipped image to catch flipped duplicates."""
    flipped = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return compute_dhash(flipped, hash_size)


def dhash_distance(hash1: str | None, hash2: str | None) -> int:
    """Hamming distance between two 64-bit hexadecimal dHashes (0 to 64)."""
    if not hash1 or not hash2:
        return 64
    try:
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        return bin(val1 ^ val2).count("1")
    except ValueError:
        return 64


def preprocess_image_for_model(img: Image.Image) -> np.ndarray:
    """Resize whole image to 224x224 RGB and normalize with ImageNet mean and std."""
    rgb = img.convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
    arr = np.array(rgb, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    normalized = (arr - mean) / std
    # Shape: (1, 3, 224, 224)
    transposed = np.transpose(normalized, (2, 0, 1))
    return np.expand_dims(transposed, axis=0)


def load_thresholds() -> dict[str, dict[str, Any]]:
    """Load model thresholds from ml_assets/models/thresholds.json or fall back to defaults."""
    settings = get_settings()
    p = Path(settings.ml_assets_dir) / "models" / "thresholds.json"
    if p.exists():
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Could not read thresholds.json: %s. Using defaults.", e)
    return DEFAULT_THRESHOLDS


def get_onnx_session(model_name: str) -> Any | None:
    """Lazily load and cache ONNX runtime session for a given model."""
    global _ONNX_SESSIONS
    if model_name in _ONNX_SESSIONS:
        return _ONNX_SESSIONS[model_name]

    settings = get_settings()
    model_path = Path(settings.ml_assets_dir) / "models" / f"{model_name}.onnx"
    if not model_path.exists():
        return None

    try:
        import onnxruntime as ort

        sess = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        _ONNX_SESSIONS[model_name] = sess
        return sess
    except Exception as e:
        logger.warning("Failed to load ONNX session for %s: %s", model_name, e)
        return None


def run_photo_classification(
    image_path: Path | str,
    target_category: str | None = None,
    fake_scores: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Run all 4 binary classifiers on the given image.
    
    Returns raw scores, decisions, confidence bands, plain language descriptions,
    relevance hint, and dHash values.
    """
    thresholds_config = load_thresholds()
    results: dict[str, Any] = {
        "models_available": False,
        "predictions": {},
        "flagged_categories": [],
        "primary_suggestion": None,
        "relevance_hint": None,
        "dhash": None,
        "flipped_dhash": None,
    }

    try:
        with Image.open(image_path) as img:
            results["dhash"] = compute_dhash(img)
            results["flipped_dhash"] = compute_flipped_dhash(img)
            input_tensor = preprocess_image_for_model(img)
    except Exception as e:
        logger.warning("Could not open/preprocess image %s: %s", image_path, e)
        return results

    active_models = ["pothole_road_damage", "garbage_dumping", "road_waterlogging", "manhole_defect"]
    scores: dict[str, float] = {}

    for m in active_models:
        th = thresholds_config.get(m, {}).get("threshold", 0.50)
        ver = thresholds_config.get(m, {}).get("version", "v1.0")

        score: float | None = None
        if fake_scores and m in fake_scores:
            score = fake_scores[m]
            results["models_available"] = True
        else:
            sess = get_onnx_session(m)
            if sess:
                results["models_available"] = True
                try:
                    input_name = sess.get_inputs()[0].name
                    out = sess.run(None, {input_name: input_tensor})[0]
                    # Apply sigmoid if raw logit
                    val = float(out.flatten()[0])
                    score = 1.0 / (1.0 + np.exp(-val)) if (val < -10 or val > 10) else float(val)
                except Exception as e:
                    logger.warning("Inference failed for %s: %s", m, e)

        if score is not None:
            scores[m] = score
            cat = MODEL_TO_CATEGORY.get(m, m)
            cat_plain = CATEGORY_PLAIN_NAMES.get(cat, cat)

            if score >= th:
                decision = "certain"
                flagged = True
                display = f"Looks like {cat_plain}"
            elif score >= (th - 0.10):
                decision = "uncertain"
                flagged = False
                display = f"Might be {cat_plain}"
            else:
                decision = "none"
                flagged = False
                display = "The photo check did not recognise this. Please look at the photo."

            results["predictions"][m] = {
                "category": cat,
                "model_name": m,
                "model_version": ver,
                "score": round(score, 4),
                "threshold": th,
                "decision": decision,
                "display": display,
            }
            if flagged:
                results["flagged_categories"].append(cat)

    # Determine primary suggestion for the targeted category (or highest score)
    if target_category and target_category in CATEGORY_TO_MODEL:
        target_model = CATEGORY_TO_MODEL[target_category]
        if target_model in results["predictions"]:
            pred = results["predictions"][target_model]
            if pred["decision"] in ("certain", "uncertain"):
                results["primary_suggestion"] = pred["display"]

    # Check for relevance hint: if targeted category is not flagged, but another is clearly flagged
    if target_category and results["flagged_categories"]:
        if target_category not in results["flagged_categories"]:
            strongest_cat = results["flagged_categories"][0]
            cat_label = CATEGORY_PLAIN_NAMES.get(strongest_cat, strongest_cat)
            results["relevance_hint"] = f"The photo may show a different problem ({cat_label}). Please look."

    return results
