# GrievanceGrid — Backend Needs for Senior Authority and Field Worker Roles

This document specifies the exact missing API endpoints and schema requirements identified in Pass 4.
The current backend milestone enforces strict authorization where only `citizen` (own reports) and `gro` (jurisdiction reports) have queue access. Calling `/api/v1/complaints` as `supervisor` or `field_officer` returns `HTTP 403 Forbidden`.

---

## 1. Senior Authority (Supervisor) Endpoints

### 1.1. Executive Metrics Rollup
Allows senior authorities to monitor jurisdiction performance and SLA target adherence without scanning raw individual report items.

- **Method:** `GET`
- **Path:** `/api/v1/metrics/overview`
- **Authorization:** `Bearer <token>` (Roles: `supervisor`, `admin`)
- **Query Parameters:**
  - `days`: integer, default `30` (reporting window)

#### Response Example (`200 OK`)
```json
{
  "jurisdiction_id": "demo-municipality",
  "window_days": 30,
  "summary": {
    "total_received": 142,
    "waiting_review": 18,
    "work_started": 24,
    "fixed": 96,
    "rejected": 4,
    "past_target_response": 7
  },
  "by_category": [
    {
      "category": "road_damage",
      "label": "Road damage & potholes",
      "target_days": 7,
      "total": 68,
      "fixed": 45,
      "avg_resolution_days": 5.2
    },
    {
      "category": "garbage",
      "label": "Garbage accumulation",
      "target_days": 2,
      "total": 42,
      "fixed": 38,
      "avg_resolution_days": 1.4
    },
    {
      "category": "waterlogging",
      "label": "Road waterlogging",
      "target_days": 1,
      "total": 19,
      "fixed": 11,
      "avg_resolution_days": 0.9
    },
    {
      "category": "manhole",
      "label": "Missing or broken manhole cover",
      "target_days": 1,
      "total": 13,
      "fixed": 12,
      "avg_resolution_days": 0.6
    }
  ],
  "oldest_open_reports": [
    {
      "tracking_id": "GG-2026-RD01A",
      "title": "Deep pothole causing traffic slowdown and hazard",
      "category": "road_damage",
      "received_at": "2026-10-14T08:30:00Z",
      "days_open": 4,
      "target_days": 7,
      "location_text": "Opposite 4th Block Bus Stop, 14th Main Rd, Koramangala"
    }
  ]
}
```

### 1.2. Queue Read-Only Access
Alternatively or additionally, grant read-only visibility on `GET /api/v1/complaints` and `GET /api/v1/complaints/{tracking_id}` for `Role.SUPERVISOR` so supervisors can inspect individual case records without permission to change status (`POST /api/v1/complaints/{tracking_id}/status` remains restricted to GRO).

---

## 2. Field Worker Endpoints

### 2.1. List Assigned Work Orders
Allows field workers to fetch work dispatched or assigned to their crew.

- **Method:** `GET`
- **Path:** `/api/v1/field/assignments`
- **Authorization:** `Bearer <token>` (Role: `field_officer`)
- **Query Parameters:**
  - `status`: string, optional (`assigned`, `completed`)
  - `offset`: integer, default `0`
  - `limit`: integer, default `25`

#### Response Example (`200 OK`)
```json
{
  "items": [
    {
      "id": "fa-9a2c3e1b",
      "complaint_tracking_id": "GG-2026-RD01A",
      "title": "Deep pothole causing traffic slowdown and hazard",
      "description": "Large cavity approx 1.5m wide near the bus stop curb.",
      "category": "road_damage",
      "latitude": 12.9345,
      "longitude": 77.6101,
      "location_text": "Opposite 4th Block Bus Stop, 14th Main Rd, Koramangala",
      "assigned_at": "2026-10-17T09:00:00Z",
      "status": "assigned",
      "instructions": "Inspect road asphalt depth and apply cold mix patch."
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 25
}
```

### 2.2. Submit Work for Officer Review
Field workers record ground work, attach photo evidence of the repair, and submit for officer sign-off.
*In adherence with GrievanceGrid engineering guardrails, field work completion never automatically closes a resident report; an officer must confirm and certify the resolution.*

- **Method:** `POST`
- **Path:** `/api/v1/field/assignments/{assignment_id}/complete`
- **Authorization:** `Bearer <token>` (Role: `field_officer`)
- **Content-Type:** `multipart/form-data`
- **Payload Fields:**
  - `note`: string (min 10, max 2000 chars) — Description of actions taken on site
  - `file`: binary (optional JPEG/PNG, max 8 MiB) — After-repair ground photo

#### Response Example (`200 OK`)
```json
{
  "assignment_id": "fa-9a2c3e1b",
  "complaint_tracking_id": "GG-2026-RD01A",
  "status": "pending_officer_review",
  "completed_at": "2026-10-18T10:15:00Z",
  "note": "Asphalt patch applied and compacted. Debris cleared from curb.",
  "evidence_id": "ev-8f3a1d9c"
}
```
