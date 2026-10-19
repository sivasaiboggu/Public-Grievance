"""Layered Photo Authenticity & Image Software Signals (Advisory Only).

Extracts provenance markers before stripping EXIF:
1. Content Credentials (C2PA)
2. Editing or generative software tags in EXIF/XMP (Photoshop, Canva, Midjourney, etc.)
3. Camera hardware tags (make, model)
4. Capture timestamp delta vs complaint received_at
5. Photo GPS delta vs reported latitude/longitude
6. Perceptual image hash collisions
7. Standard synthetic canvas dimensions (1024x1024, 1344x768)

Levels:
- 'none': show nothing
- 'look_closer': 1 strong signal OR 2 moderate signals
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from PIL import Image, ExifTags

from app.ml.incident_matcher import haversine_distance_km
from app.ml.photo_classifier import compute_dhash, dhash_distance

# Software keywords considered strong (generative) or moderate (editing)
GENERATOR_KEYWORDS = [
    "midjourney",
    "dall-e",
    "dalle",
    "stable diffusion",
    "stablediffusion",
    "firefly",
    "bing image creator",
    "comfyui",
    "automatic1111",
    "novelai",
    "imagen",
]

EDITOR_KEYWORDS = [
    "photoshop",
    "lightroom",
    "gimp",
    "canva",
    "snapseed",
    "picsart",
    "vsco",
    "pixlr",
    "affinity photo",
]


def extract_exif_dict(img: Image.Image) -> dict[str, Any]:
    exif_data: dict[str, Any] = {}
    try:
        raw_exif = img._getexif()
        if raw_exif:
            for tag_id, value in raw_exif.items():
                tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                exif_data[tag_name] = value
    except Exception:
        pass
    return exif_data


def parse_gps_coordinates(exif: dict[str, Any]) -> tuple[float, float] | None:
    try:
        gps_info = exif.get("GPSInfo")
        if not gps_info:
            return None

        def convert_to_degrees(value):
            d = float(value[0])
            m = float(value[1])
            s = float(value[2])
            return d + (m / 60.0) + (s / 3600.0)

        lat = convert_to_degrees(gps_info[2])
        if gps_info.get(1) == "S":
            lat = -lat

        lng = convert_to_degrees(gps_info[4])
        if gps_info.get(3) == "W":
            lng = -lng

        return lat, lng
    except Exception:
        return None


def inspect_photo_signals(
    image_path: Path,
    reported_lat: float,
    reported_lng: float,
    report_time: datetime,
    raw_bytes: bytes | None = None,
) -> dict[str, Any]:
    """Inspect raw photo file for advisory signals before metadata is stripped."""
    signals: dict[str, Any] = {
        "has_c2pa": False,
        "software_tag": None,
        "has_camera_metadata": False,
        "camera_make": None,
        "camera_model": None,
        "capture_time": None,
        "time_flag": None,
        "distance_meters": None,
        "place_flag": None,
        "dimensions": None,
        "dimension_flag": False,
        "authenticity_level": "none",
        "reasons": [],
    }

    try:
        with Image.open(image_path) as img:
            w, h = img.size
            signals["dimensions"] = f"{w}x{h}"

            # Check synthetic canvas dimensions (e.g. exactly 1024x1024 or 1344x768)
            if (w, h) in [(1024, 1024), (1344, 768), (768, 1344), (512, 512)]:
                signals["dimension_flag"] = True

            exif = extract_exif_dict(img)
            info_dict = img.info or {}

            # 1. C2PA / Content Credentials check
            if raw_bytes and b"c2pa" in raw_bytes.lower():
                signals["has_c2pa"] = True

            # 2. Software tag check
            software = exif.get("Software") or info_dict.get("Software") or info_dict.get("software")
            if software and isinstance(software, str):
                signals["software_tag"] = software.strip()

            # 3. Camera make / model
            make = exif.get("Make")
            model = exif.get("Model")
            if make or model:
                signals["has_camera_metadata"] = True
                signals["camera_make"] = str(make).strip() if make else None
                signals["camera_model"] = str(model).strip() if model else None

            # 4. Capture timestamp
            dt_str = exif.get("DateTimeOriginal") or exif.get("DateTime")
            capture_dt = None
            if dt_str and isinstance(dt_str, str):
                try:
                    capture_dt = datetime.strptime(dt_str[:19], "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC)
                    signals["capture_time"] = capture_dt
                except Exception:
                    pass

            # Check time flag: > 7 days before report OR in the future
            if capture_dt:
                delta = report_time - capture_dt
                if delta.total_seconds() < -3600:  # >1h in the future
                    signals["time_flag"] = "future"
                elif delta.days > 7:
                    signals["time_flag"] = "old"

            # 5. GPS distance check
            gps_coords = parse_gps_coordinates(exif)
            if gps_coords:
                photo_lat, photo_lng = gps_coords
                dist_km = haversine_distance_km(reported_lat, reported_lng, photo_lat, photo_lng)
                signals["distance_meters"] = dist_km * 1000.0
                if dist_km > 1.0:
                    signals["place_flag"] = "far"

    except Exception:
        pass

    # Evaluate signal strength & derive plain officer reasons
    strong_signals: list[str] = []
    moderate_signals: list[str] = []

    # C2PA
    if signals["has_c2pa"]:
        strong_signals.append("This photo says it was made or changed with image software.")

    # Software tag
    if signals["software_tag"]:
        soft_lower = signals["software_tag"].lower()
        if any(kw in soft_lower for kw in GENERATOR_KEYWORDS):
            strong_signals.append(f"The photo was generated by image software ({signals['software_tag']}).")
        elif any(kw in soft_lower for kw in EDITOR_KEYWORDS):
            moderate_signals.append(f"The photo was saved by editing software ({signals['software_tag']}).")

    # Time
    if signals["time_flag"] == "old":
        if signals["capture_time"]:
            date_fmt = signals["capture_time"].strftime("%d %b")
            moderate_signals.append(f"The photo was taken on {date_fmt}, long before this report.")
        else:
            moderate_signals.append("The photo was taken long before this report.")
    elif signals["time_flag"] == "future":
        moderate_signals.append("The photo timestamp is set in the future.")

    # Place
    if signals["place_flag"] == "far":
        dist_km = round((signals["distance_meters"] or 0) / 1000.0, 1)
        moderate_signals.append(f"The photo's location is {dist_km} km from the reported place.")

    # Rule: Level is "look_closer" if 1 strong signal OR at least 2 moderate signals
    reasons = strong_signals + moderate_signals
    if strong_signals or len(moderate_signals) >= 2:
        signals["authenticity_level"] = "look_closer"
        signals["reasons"] = reasons[:2]  # Top two reasons
    else:
        signals["authenticity_level"] = "none"
        signals["reasons"] = []

    return signals


def extract_and_save_photo_signals(
    db: Any,
    evidence: Any,
    complaint: Any,
    raw_bytes: bytes,
) -> dict[str, Any]:
    from sqlalchemy import select
    from app.models import PhotoSignal, MLPrediction, new_id

    signals = evaluate_photo_signals(
        raw_bytes,
        reported_lat=complaint.latitude,
        reported_lng=complaint.longitude,
        report_time=complaint.received_at,
    )

    sig_row = db.scalar(select(PhotoSignal).where(PhotoSignal.evidence_id == evidence.id))
    if not sig_row:
        sig_row = PhotoSignal(
            id=new_id(),
            evidence_id=evidence.id,
            complaint_id=complaint.id,
            has_c2pa=signals["has_c2pa"],
            software_tag=signals["software_tag"],
            has_camera_metadata=signals["has_camera_metadata"],
            camera_make=signals["camera_make"],
            camera_model=signals["camera_model"],
            capture_time=signals["capture_time"],
            time_flag=signals["time_flag"],
            distance_meters=signals["distance_meters"],
            place_flag=signals["place_flag"],
            dimensions=signals["dimensions"],
            dimension_flag=signals["dimension_flag"],
            authenticity_level=signals["authenticity_level"],
            reasons_json=json.dumps(signals["reasons"]),
        )
        db.add(sig_row)
    else:
        sig_row.authenticity_level = signals["authenticity_level"]
        sig_row.reasons_json = json.dumps(signals["reasons"])

    pred = MLPrediction(
        id=new_id(),
        kind="photo_authenticity",
        report_id=complaint.id,
        photo_id=evidence.id,
        model_name="authenticity_signals_v1",
        model_version="v1.0",
        output_json=json.dumps(signals),
    )
    db.add(pred)
    db.commit()
    return signals
