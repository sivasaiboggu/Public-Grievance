import io
import json
from datetime import UTC, datetime, timedelta
from PIL import Image

import pytest
from fastapi.testclient import TestClient

from app.ml.photo_classifier import (
    compute_dhash,
    compute_flipped_dhash,
    dhash_distance,
    preprocess_image_for_model,
    run_photo_classification,
)
from app.ml.incident_matcher import (
    compute_text_embedding,
    cosine_similarity,
    haversine_distance_km,
    score_strategy_2,
)
from app.ml.priority_engine import (
    compute_priority_recommendation,
)
from app.models import Complaint, MLPrediction, User, Role


def test_dhash_and_distance():
    # Create two test images
    img1 = Image.new("RGB", (100, 100), color=(100, 100, 100))
    img2 = Image.new("RGB", (100, 100), color=(100, 100, 100))
    
    hash1 = compute_dhash(img1)
    hash2 = compute_dhash(img2)
    assert len(hash1) == 16
    assert dhash_distance(hash1, hash2) == 0

    # Draw something different on img2
    for x in range(50):
        for y in range(50):
            img2.putpixel((x, y), (255, 255, 255))
    hash3 = compute_dhash(img2)
    assert dhash_distance(hash1, hash3) > 0


def test_flipped_dhash():
    img = Image.new("RGB", (100, 100), color=(0, 0, 0))
    for x in range(30):
        for y in range(100):
            img.putpixel((x, y), (255, 255, 255))
    h_orig = compute_dhash(img)
    h_flip = compute_flipped_dhash(img)
    assert len(h_flip) == 16


def test_photo_preprocessing_tensor():
    img = Image.new("RGB", (300, 200), color=(128, 128, 128))
    tensor = preprocess_image_for_model(img)
    assert tensor.shape == (1, 3, 224, 224)


def test_photo_classification_with_mock_scores(tmp_path):
    img_path = tmp_path / "test.jpg"
    img = Image.new("RGB", (200, 200), color=(80, 80, 80))
    img.save(img_path)

    # Fake scores: pothole above threshold 0.80 -> certain
    fake_scores = {
        "pothole_road_damage": 0.88,
        "garbage_dumping": 0.12,
        "road_waterlogging": 0.05,
        "manhole_defect": 0.02,
    }
    res = run_photo_classification(img_path, target_category="road_damage", fake_scores=fake_scores)
    assert res["models_available"] is True
    assert "road_damage" in res["flagged_categories"]
    assert res["primary_suggestion"] == "Looks like a pothole"
    assert res["relevance_hint"] is None


def test_photo_classification_relevance_hint(tmp_path):
    img_path = tmp_path / "test2.jpg"
    img = Image.new("RGB", (200, 200), color=(50, 70, 90))
    img.save(img_path)

    # Resident selected road_damage, but image is waterlogging
    fake_scores = {
        "pothole_road_damage": 0.10,
        "garbage_dumping": 0.05,
        "road_waterlogging": 0.92,
        "manhole_defect": 0.02,
    }
    res = run_photo_classification(img_path, target_category="road_damage", fake_scores=fake_scores)
    assert "waterlogging" in res["flagged_categories"]
    assert res["relevance_hint"] is not None
    assert "standing water" in res["relevance_hint"]


def test_incident_matcher_heuristics():
    # Embeddings
    vec1 = compute_text_embedding("Deep pothole outside school")
    vec2 = compute_text_embedding("Deep pothole near school gate")
    vec3 = compute_text_embedding("Streetlight not working on main avenue")

    sim12 = cosine_similarity(vec1, vec2)
    sim13 = cosine_similarity(vec1, vec3)
    assert sim12 > sim13

    # Haversine distance
    d = haversine_distance_km(9.9658, 76.2422, 9.9658, 76.2422)
    assert d == 0.0
    d2 = haversine_distance_km(9.9658, 76.2422, 9.9782, 76.2764)
    assert d2 > 0.5

    # Strategy 2 score
    score = score_strategy_2(
        text_sim=0.9,
        same_category=True,
        distance_km=0.1,
        days_apart=1.0,
    )
    assert 0.0 <= score <= 1.0
    assert score > 0.70


def test_priority_engine():
    now = datetime.now(UTC)
    comp = Complaint(
        category="open_drain",
        received_at=now - timedelta(hours=30),
    )
    # Target hours 24, received 30 hours ago -> overdue (high pressure), open_drain (high hazard)
    rec = compute_priority_recommendation(comp, target_hours=24, now=now)
    assert rec["priority"] == "high"
    assert rec["due_date_pressure"] == "high"
    assert any("Open drain" in r for r in rec["why_this_order"])


def test_suggestions_api_endpoints(client: TestClient, account):
    citizen_headers = account(Role.CITIZEN)
    officer_headers = account(Role.GRO)
    senior_headers = account(Role.SUPERVISOR)

    import uuid
    create_resp = client.post(
        "/api/v1/complaints",
        json={
            "title": "Broken storm water drain cover",
            "description": "Concrete cover slab has collapsed into the drain causing a dangerous hazard.",
            "category": "road_damage",
            "latitude": 9.9658,
            "longitude": 76.2422,
            "location_text": "KB Jacob Road, Fort Kochi",
            "location_source": "manual",
            "client_request_id": str(uuid.uuid4()),
        },
        headers=citizen_headers,
    )
    assert create_resp.status_code == 201
    comp = create_resp.json()
    target_id = comp["id"]

    # 1. GET /reports/{id}/suggestions
    sug_resp = client.get(
        f"/api/v1/reports/{target_id}/suggestions",
        headers=officer_headers,
    )
    assert sug_resp.status_code == 200
    sug_data = sug_resp.json()
    assert "priority_info" in sug_data
    assert "disclaimer" in sug_data
    assert "predictions" in sug_data

    # 2. GET /reports/{id}/duplicates
    dup_resp = client.get(
        f"/api/v1/reports/{target_id}/duplicates",
        headers=officer_headers,
    )
    assert dup_resp.status_code == 200
    assert isinstance(dup_resp.json(), list)

    # 3. GET /admin/suggestions/summary
    admin_headers = account(Role.ADMIN)
    admin_resp = client.get(
        "/api/v1/admin/suggestions/summary",
        headers=admin_headers,
    )
    assert admin_resp.status_code == 200
    summary = admin_resp.json()
    assert "master_enabled" in summary
    assert "features" in summary
    assert "stats_30_days" in summary


def test_escalation_lifecycle_and_remind(client: TestClient, account):
    senior_headers = account(Role.SUPERVISOR)
    citizen_headers = account(Role.CITIZEN)

    import uuid
    # Create complaint
    create_resp = client.post(
        "/api/v1/complaints",
        json={
            "title": "Severe flooding blocking road",
            "description": "Entire junction submerged in knee-deep water.",
            "category": "waterlogging",
            "latitude": 9.9658,
            "longitude": 76.2422,
            "location_text": "MG Road, Kochi",
            "location_source": "manual",
            "client_request_id": str(uuid.uuid4()),
        },
        headers=citizen_headers,
    )
    assert create_resp.status_code == 201
    comp = create_resp.json()
    tracking_id = comp["tracking_id"]

    # Senior calls remind endpoint
    remind_resp = client.post(
        f"/api/v1/complaints/{tracking_id}/escalation/remind",
        headers=senior_headers,
    )
    assert remind_resp.status_code == 200
    assert remind_resp.json()["status"] == "reminded"

