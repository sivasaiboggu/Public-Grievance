# GrievanceGrid Machine Learning & Decision Support Architecture

GrievanceGrid integrates machine learning and rule-based decision support strictly as an assistive layer for city officers. In accordance with the system's engineering guardrails, **software suggestions never alter category, priority, routing, or status automatically**. Every action requires explicit officer decision-making with a reversible audit trail.

---

## 1. Computer Vision: 4 Binary Classifiers

### Architecture
Rather than a monolithic multi-class model that struggles with rare defects, GrievanceGrid utilizes four dedicated binary classifiers built on EfficientNet-B0:

1. **`pothole_road_damage`**: Detects road surface defects, asphalt holes, and broken pavement.
2. **`garbage_dumping`**: Detects illegal waste dumping, overflowing dumpsters, and street refuse.
3. **`road_waterlogging`**: Detects standing water, flooded streets, and blocked culverts.
4. **`manhole_defect`**: Detects broken, missing, or misaligned manhole covers and open drains.

### Input Preprocessing & Invariance
- Images are decoded from JPEG/PNG, orientation-corrected via EXIF tags, and EXIF metadata is completely stripped.
- Images are resized to **224 × 224** RGB pixels using bilinear interpolation.
- Normalized using standard ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.

### Thresholding & Confidence Bands
Model thresholds are derived from empirical precision-recall validation on civic datasets:
- **`pothole_road_damage`**: Threshold 0.80 (version v1.0-e7)
- **`garbage_dumping`**: Threshold 0.70 (version v1.0-e4)
- **`road_waterlogging`**: Threshold 0.80 (version v1.0-e4)
- **`manhole_defect`**: Threshold 0.40 (version v1.0-e9)

#### Decision Bands & Plain Language:
- **Score ≥ Threshold**: `certain` → Display: `"Looks like [category plain name]"` (e.g. `"Looks like a pothole"`).
- **Score ≥ Threshold - 0.10**: `uncertain` → Display: `"Might be [category plain name]"`.
- **Score < Threshold - 0.10**: `none` → Display: `"The photo check did not recognise this. Please look at the photo."`
- **Category Mismatch Hint**: If the reporter selected Category A, but model B triggers with high confidence, the system displays: `"The photo may show a different problem ([Category B]). Please look."`

---

## 2. Perceptual Similarity & Duplicate Photo Matching (dHash)

To detect duplicate photo submissions across multiple reports or duplicate accounts (even when re-encoded or horizontally flipped):
- **64-bit Difference Hash (dHash)**: Computed by resizing the grayscale image to 9×8 pixels and comparing adjacent pixels ($pixels[:, 1:] > pixels[:, :-1]$).
- **Flipped dHash**: Computed on horizontally mirrored image ($Image.Transpose.FLIP\_LEFT\_RIGHT$) to catch flipped copies.
- **Hamming Distance Match**:
  - Distance $\le 6$ bits out of 64 indicates near-identical framing or duplicate photo upload.
  - Generates hint for officer: `"This photo looks the same as one on GG-2026-XXXX. It may be the same place."`

---

## 3. Incident Duplicate Matching (Strategy 2 Heuristic)

To assist officers in grouping complaints concerning the same civic problem, the system implements **Strategy 2** (Transparent Heuristic Scoring):

$$S = 0.50 \cdot \text{text\_sim} + 0.15 \cdot \text{same\_category} + 0.20 \cdot \exp\left(-\frac{\text{dist\_km}}{1.0}\right) + 0.15 \cdot \exp\left(-\frac{\text{days\_apart}}{3.0}\right)$$

### Components:
1. **Semantic Text Similarity ($\text{text\_sim}$)**:
   - Generated using 384-dimensional dense sentence embeddings from `all-MiniLM-L6-v2`.
   - In offline or lightweight test environments, falls back to a deterministic 384-dimensional n-gram semantic vector.
   - Evaluated using cosine similarity ($0.0 \dots 1.0$).
2. **Category Agreement ($\text{same\_category}$)**:
   - $1.0$ if matching categories, else $0.0$.
3. **Spatial Decay ($\exp(-\text{dist} / 1.0)$)**:
   - Computed via great-circle Haversine formula. Halves influence beyond 1 km.
   - Set to $0.0$ if coordinates are missing.
4. **Temporal Decay ($\exp(-\text{days} / 3.0)$)**:
   - Exponential time window decaying over 3 days.

Candidate pairs exceeding the threshold (default $S \ge 0.70$) within the radius (default 500m) are presented to the officer with candidate distance, days apart, and matching score.

---

## 4. Deterministic Priority Engine

Priority is computed as:

$$\text{Priority} = \max(\text{Hazard Rank}, \text{Due-Date Pressure Rank})$$

### 1. Base Hazard Rank:
- **High**: Open drain, missing manhole, road waterlogging.
- **Medium**: Road damage / potholes, dark street lights.
- **Low**: Garbage accumulation, water supply leak, damaged public property.
- *Modifiers*: Photo check confirming safety defect raises rank by $+1$. Confirmed duplicate cluster $\ge 3$ reports raises rank by $+1$.

### 2. Due-Date Pressure Rank:
- **High**: Past target resolution deadline (overdue).
- **Medium**: Remaining time $\le 25\%$ of target hours (due soon).
- **Low**: Normal operating window.

### Human Rationale:
Every priority level produces plain human sentences explaining the order, e.g.:
- `"Open drain or manhole poses immediate danger to pedestrians"`
- `"Photo check recognized safety defect"`
- `"3 reports of this problem at this place"`
- `"Due in 6 hours"`

---

## 5. Escalation Engine

Periodic Celery task `check_escalations` runs every 10 minutes:
1. **Ladder Levels**:
   - `due_soon`: Remaining time $\le$ `warn_before_due_hours` (default 12h).
   - `overdue`: Current time $>$ `target_resolution_at`.
   - `passed_to_senior`: Current time $>$ `target_resolution_at + pass_to_senior_hours` (default 24h).
   - `needs_senior_attention`: Current time $>$ `target_resolution_at + pass_to_senior_hours + 48h`.
2. **Rules**:
   - Transitions are logged to the `escalation_events` table.
   - Closes automatically when status changes to `resolved`, `closed`, or `rejected`.
   - Senior authorities have a **"Remind the officer"** button to send in-app alerts to assigned officers.

---

## 6. Officer Feedback & Truth Rules

- Officers can vote on every suggestion: **"Looks right"** or **"Not right"**.
- Recorded to `ml_feedback` table.
- System metrics are surfaced on the Admin Settings tab: total suggestions made, right votes, and wrong votes.
- Zero tolerance for AI buzzwords: no "confidence scores", no "artificial intelligence", no "sparkles".

---

## 7. What the Photo Checks Can and Cannot Do (Advisory Only)

Civic governance requires strict honesty regarding the fundamental limits of software photo analysis:

1. **No software can prove an image is genuine or fake.** Synthesized or manipulated images continuously change generation architectures, and forensic detectors age rapidly. Therefore, neural synthetic detectors are kept disabled in production until independently validated with false-positive rates $\le 1.0\%$ on verified civic ground-truth datasets.
2. **"Edited" is not "fake".** A citizen adjusting exposure in Snapseed, cropping out a private detail, or saving a photo via Canva creates software tags in metadata. This does not indicate deception or an invalid report. The system flags editing tags only as an advisory prompt to inspect the photo closer.
3. **Missing metadata proves nothing.** Social messaging platforms (WhatsApp, Signal, Telegram) strip all EXIF hardware tags, GPS coordinates, and timestamps during transit. A photo without metadata is completely normal for residents sharing images via messaging. Missing camera hardware tags are classified as a weak signal and can never trigger an advisory flag on their own.
4. **Advisory only — never punitive.** Photo signals produce at most an advisory cue ("Look closer") displaying up to two factual, plain-language reasons for the review officer. Photo checks **never reject a complaint, slow down processing, change priority, or penalize a citizen**. Citizens are never told their photo was flagged; reporting forms simply carry the calm reminder: *"Please use an original photo taken at the place."*

