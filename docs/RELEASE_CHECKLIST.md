# GrievanceGrid — Release Verification Checklist

This checklist verifies that GrievanceGrid meets all municipal engineering guardrails, truth rules, security protocols, and operational standards prior to production deployment.

---

## 1. Truth Rules & Engineering Guardrails

- [x] **Separation of Complaints & Incidents**: Citizen reports remain distinct from confirmed incidents. Candidate clusters require explicit officer decisions (`same_problem`, `different_problem`, `came_back`).
- [x] **No Fabricated AI Claims**: Model outputs are explicitly labelled as software suggestions ("Suggestions come from software. You decide."). No unverified confidence scores, "deepfake" buzzwords, or automated status transitions.
- [x] **Manual Reporting Always Available**: All 4 categories (Road damage, Garbage, Waterlogging, Manholes) remain accessible for manual submission without photo or coordinates requirements.
- [x] **Officer Authority**: Only authorized municipal officers approve category, priority, worker assignment, status transitions, and incident closure.
- [x] **Versioned Priority & Deadlines**: Priority rationale follows a transparent rubric with category deadlines and duplicate counts.
- [x] **Persistent Demo Labels**: Non-production environments and exploratory density maps are visibly designated.

---

## 2. Security & Startup Verification

- [x] **Production Secret Key Enforcement**: Startup check terminates if `GG_ENVIRONMENT=production` and `GG_SECRET_KEY` is default or shorter than 32 characters.
- [x] **HMAC Evidence Signing**: Evidence photos are stored outside public web roots and accessed solely via time-limited (300s) signed URLs.
- [x] **Session Revocation**: Token expiry and database session invalidation tested on logout and password reset.
- [x] **Rate Limiting & Body Limits**: 10 MB payload ceiling and basic IP rate limiting on login/register endpoints.

---

## 3. Isolation Architecture

- [x] **Pure Package Boundaries**: `packages/core` and `packages/tokens` contain zero imports of `react-dom`, `react-native`, `expo-*`, or browser globals.
- [x] **Web & Mobile Independence**: `apps/web` and `apps/mobile` share pure TypeScript types and API client contracts only; zero shared UI components.
- [x] **Authoritative Backend Guards**: Client role guards enhance UX, but all administrative and officer endpoints enforce server-side 401/403 authorization.

---

## 4. Real-Time Infrastructure (SSE & Pub/Sub)

- [x] **Server-Sent Events (`/api/v1/events/stream`)**: Dispatches real-time events (`notification.created`, `report.updated`, `escalation.raised`, `heartbeat`).
- [x] **Redis Pub/Sub with In-Memory Fallback**: Reliable multi-worker message distribution with graceful degradation when Redis is stopped.
- [x] **Client Auto-Reconnect & Polling Fallback**: Web bell updates in <2s without reload; falls back to 15s HTTP polling if stream is interrupted.
- [x] **Connection Caps**: Hard limit of 5 concurrent SSE streams per user prevents socket exhaustion.

---

## 5. Service Level Agreement (SLA) Engine

- [x] **Category Service Charter**:
  - Road damage: 24h first response, 72h fix target.
  - Garbage: 12h first response, 48h fix target.
  - Waterlogging: 8h first response, 36h fix target.
  - Manhole: 4h first response, 12h fix target.
- [x] **Dual Clocks**: Explicitly tracks "First response" (triage) separate from "Fix target" (resolution).
- [x] **Automated Escalation**: Celery worker evaluates open reports every 10 minutes, generating senior alerts and resident timeline notes.

---

## 6. Incident Clustering & Deduplication

- [x] **Category Distance Radii**:
  - Manhole: 30 meters.
  - Road damage: 60 meters.
  - Garbage: 100 meters.
  - Waterlogging: 200 meters.
- [x] **Time Window**: 30-day clustering horizon.
- [x] **UI Indicators**:
  - Report list: `+N similar nearby` chip.
  - Detail view: Dedicated cluster section with 3 officer choices (`Same problem`, `Different problem`, `Came back`).
- [x] **Senior Bubble Map**: Interactive Leaflet density map distinguishing confirmed incidents from suggested clusters.

---

## 7. Layered Photo Authenticity & Software Checks

- [x] **Deterministic Signal Extraction**:
  1. C2PA Content Credentials.
  2. Generative software tags (Midjourney, DALL-E, ComfyUI).
  3. Editing software tags (Photoshop, Canva, Snapseed).
  4. Camera hardware metadata.
  5. Timestamp deltas (>7 days or future).
  6. GPS distance (>1 km from report).
  7. Perceptual dHash collisions.
- [x] **Advisory Level "Look closer"**: Triggered solely on 1 strong generative signal or >=2 moderate signals.
- [x] **Offline Verification**: Verified via `ml/evaluate_authenticity.py` against genuine local baseline photos.
- [x] **Decision Record**: Standalone learned neural detector disabled due to synthetic drift; deterministic provenance signals shipped exclusively.

---

## 8. Admin Console & Audit Logging

- [x] **Full-Width Municipal Layout**: Switches, hairlines, and sticky unsaved-changes bar.
- [x] **Settings Coverage**: General, SLA response times, Email triggers, Suggestion toggles, and Real-time alerts.
- [x] **Immutable Audit Trail**: All changes recorded with administrator ID, timestamp, and field deltas in `admin_audit_logs`.
- [x] **Quiet 30-Day Decision Table**: Tracks officer feedback on suggestions without pressure metrics or rating gamification.

---

## 9. Mobile Application Parity

- [x] **Slideshow Sign-in**: 4-photo cycling banner with support copy and indicator dots.
- [x] **SLA Dual Clocks**: Embedded in mobile detail view with high-contrast overdue warnings.
- [x] **Field Worker Assignment Sheet**: GRO can assign and reassign active field crew directly from mobile.
- [x] **Offline Grace**: Cached credentials in SecureStore; graceful error banners on network drop.

---

## 10. Licensing, Attribution & Third-Party Credits

- [x] **Creative Commons Compliance**: All 4 portrait slideshow photos attributed under CC BY-SA 3.0 / 4.0 in `docs/THIRD_PARTY.md` and `apps/web/public/images/auth/credits.json`.
- [x] **Public Credits Route**: Accessible at `/credits` with full photographer names, dates, source URLs, and license links.
- [x] **Open-Source Libraries**: All backend and frontend dependencies listed with respective permissive licenses.
