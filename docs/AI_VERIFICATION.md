# AI Verification Audit — Pass 9

This document audits the software suggestions, duplicate detection, priority calculations, escalation pipeline, and interface behavior of GrievanceGrid against ground truth.

**Honesty Rule Notice:** No `.pt` PyTorch checkpoints exist in `ml_assets/` or `C:\Users\HP\Downloads\`. Zero real model weights ran during this pass. All tests of the suggestion pipeline were performed using deterministic mock/fallback fixtures and local test harnesses. No accuracy numbers are claimed beyond those documented in `model_training_and_data_report.md`.

---

## 1. Audit Summary Table

| ID | Item | Status | Evidence (Path & Line / Test / Command) | Fix / Action in Pass 9 |
|---|---|---|---|---|
| **A1.1** | `ml_assets/` presence & checkpoints | **Missing** | `Get-ChildItem ml_assets` contains 0 files. Searched `Downloads` for `*best_model*.pt` (0 found). | Documented explicitly. No fake weights fabricated. Local eval harness prepared for user weights. |
| **A1.2** | ONNX models & `thresholds.json` | **Done** | `ml_assets/models/thresholds.json` exists with SHA-256 and thresholds for all 4 models. `ml/export_onnx.py` ready. | Added Wilson confidence interval harness in `ml/evaluate_local.py`. |
| **A1.3** | `onnxruntime` & embedding libraries | **Done** | `backend/pyproject.toml:34-36` (`onnxruntime==1.20.1`, `numpy==2.2.3`, `pillow==12.3.0`). Imported without error. | Dependencies verified in `backend/.venv`. |
| **A1.4** | Database tables & additive fields | **Done** | SQLite schema at revision `0004_ml_and_escalations`. PRAGMA verified: `ml_predictions`, `ml_feedback`, `incident_links`, `escalation_events`. Additive fields: `complaints.area_name`, `evidence.phase`, `categories.photo_rule`, `categories.sort_order`. | Verified through SQLite database inspection. |
| **A1.5** | Celery tasks & Beat schedule | **Done** | `backend/app/celery_app.py:18-24`: `photo_check`, `match_incidents`, `compute_priority`, `check_escalations`. Beat schedule: `check-escalations-every-10-mins` (600s). | Verified registered task names and celery Beat config. |
| **A2.1** | Photo check model execution | **Partly** (No weights) | Tested via `test_photo_classification_with_mock_scores` in `backend/tests/test_pass8.py:62`. Real weights absent. | Tested mock pipeline. Plainly disclosed no real PyTorch weights ran. |
| **A2.2** | Preprocessing fidelity | **Done** | `backend/app/ml/photo_classifier.py:75-88`: Bilinear resize to 224×224, float32 scaling, ImageNet mean `[0.485, 0.456, 0.406]` & std `[0.229, 0.224, 0.225]`. | Matches `ml/evaluate_local.py` and training specifications. |
| **A2.3** | Threshold bands | **Done** | `backend/app/ml/photo_classifier.py:126-136`: Score ≥ threshold → Certain ("Looks like"); Score ≥ threshold - 0.10 → Uncertain ("Might be"). | Unit tested in `test_pass8.py:74-79`. |
| **A2.4** | Predictions stored in DB | **Done** | `backend/app/worker/tasks.py:115-135`: `process_report_photo` inserts row in `ml_predictions` with output JSON and model version. | Verified model version and hash tracking. |
| **A2.5** | Placeholder photos skipped | **Done** | `backend/app/worker/tasks.py:90-95`: Checks for `is_demo_placeholder` / `RECORDED BY RESIDENT VERIFICATION SYSTEM` banner and skips inference. | Prevents fake suggestion noise in demo. |
| **A2.6** | Officer report page suggestion UI | **Done** | `apps/web/app/(app)/officer/page.tsx:1290-1370`: Shows "Looks like a pothole" / "Might be", different problem hint, Looks right / Not right buttons storing `ml_feedback`. Disclaimer: "Suggestions come from software. You decide." | Verified UI and feedback submission. |
| **A2.7** | Citizen photo step hint | **Done** | `apps/web/app/(app)/citizen/report/page.tsx:340-365`: Displays "The photo is checked by software to help the officer. A person makes every decision." Soft hint preview via `POST /photo-check/preview`. | Gentle category suggestion behaves as specified. |
| **A2.8** | Tone & text purity (No "AI") | **Done** | Ripgrep search for banned terms (`AI`, `sparkle`, `confidence`, `prediction`, `algorithm`) returned empty in user-visible web/mobile strings. | Ensured human, calm language. |
| **A2.9** | Graceful degradation | **Done** | When worker stopped or models absent, report submission succeeds unimpeded. Officer view hides broken widgets. Admin sees "Photo check is not set up". | Tested in `backend/app/suggestions.py:110-125`. |
| **A3.1** | Strategy 2 duplicate formula | **Done** | `backend/app/ml/incident_matcher.py:80-95`: $S = 0.50 \cdot text + 0.15 \cdot same\_category + 0.20 \cdot \exp(-km/1.0) + 0.15 \cdot \exp(-days/3.0)$. Numeric unit test passing in `test_pass8.py:116-124`. | Mathematical formula tested and verified. |
| **A3.2** | 50m duplicate UI & officer action | **Done** | `apps/web/app/(app)/officer/page.tsx:1380-1460`: Shows possible duplicates with 3 buttons ("Same problem", "Different problem", "Came back after it was fixed"). Undo works. Nothing merges or deletes. | Both residents keep distinct reports. |
| **A3.3** | Resident linked report message | **Done** | `apps/web/app/(app)/citizen/page.tsx:412` & `CitizenFlow.tsx:580`: "Other people reported this too. We are handling it together." | Shown when report has `same_problem` link. |
| **A3.4** | Senior/Admin deduplicated counts | **Done** | `backend/app/metrics.py:85-98`: Deduplicates linked reports by taking root cluster ID for unique problem counts. | Reports treated once in high-level counts. |
| **A3.5** | Embedding model configuration | **Done** | `backend/app/config.py`: `embedding_model_name = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"`. Documented Indic script limitations in `ML_INTEGRATION.md`. | Verified setting and limitations. |
| **A4.1** | Deterministic priority calculation | **Done** | `backend/app/ml/priority_engine.py:42-105`: $\max(hazard, \text{due-date pressure})$ using 4 categories. Never age-only, never sentiment. "Why this order" plain lines. Default order priority first, then due date. | Updated `BASE_CATEGORY_HAZARDS` for 4 categories. Unit tests passing. |
| **A4.2** | Officer priority override | **Done** | `backend/app/routes/complaints.py:340` & `apps/web/app/(app)/officer/page.tsx:1490`: Officer can change priority with a mandatory recorded reason. | Audit log captures rationale and actor. |
| **A5.1** | Escalation levels & constraints | **Done** | Levels: `due_soon`, `overdue`, `passed_to_senior`, `needs_senior_attention`. Unique constraint `uq_escalation_event_level` on `(report_id, level)`. Closed on Fixed/Not accepted. First run silent. | Verified constraint and Celery task. |
| **A5.2** | Fake clock simulation & notifications | **Done** | `python -m app.worker.tasks check_escalations` moves time. Timeline displays: "This report is past its due date. A senior authority has been told." Senior has "Remind the officer" button. | Verified timeline text and reminder action. |
| **A5.3** | Category SLA configuration | **Done** | Category form includes "Pass to senior after" and "Warn before due" fields. `CategoryRecord.pass_to_senior_hours` and `warn_before_due_hours`. | Admin edit sheet includes both inputs. |
| **A5.4** | Zero status mutation guarantee | **Done** | Escalation tasks ONLY insert into `escalation_events` and `notifications`. No status, assignment, or deadline column is ever mutated by escalation. | Code verified in `backend/app/worker/tasks.py:410-480`. |
| **A6.1** | Viewport scrolling & scroll locks | **Done** | Tested via Playwright at 1440×800, 1024×768, 768×1024, 390×844 across all role routes. No residual `overflow: hidden` on body. | All 12 test assertions passing. |
| **A6.2** | Role greetings & `displayName()` | **Done** | "Good morning / afternoon / evening" with live status on Citizen, Officer, Field, and Senior home pages. Admin displays "Admin". `displayName("S. Ramanathan")` -> "Ramanathan". | Unit tested in `@grievancegrid/api-client`. |
| **A6.3** | Browser tab titles | **Done** | "Public GrievanceGrid" on `/sign-in` and `/sign-up`. "Page \| Public GrievanceGrid" across internal routes. | Verified in `document.title` hooks. |
| **A6.4** | Header logo and alignment | **Done** | `PageContainer` and `ReadingContainer` ensure logo, page title, and body share a single left edge across viewports. | Visual review confirmed alignment. |
| **A6.5** | Technical phrases eliminated | **Done** | Banned technical jargon removed. Plain human descriptions used across all role screens. | Empty grep result across frontend codebase. |
| **A6.6** | Believable varied seed data | **Done** | Reseeded with 40 distinct complaints across 4 categories, 10 Kochi hotspots, varied timestamps over 90 days. | Zero duplicate titles. |
| **A6.7** | Officer detail UI refinements | **Done** | Header unclipped, vertical updates timeline, status dropdown defaults to current status, bell badge offset does not overlap icon. | Visual screenshots verified. |

---

## 2. Capabilities Explicitly Not Trained or Built

Per system guardrails and project boundaries:
1. **No Automatic Issue Span Extraction:** Reports are reviewed by officers; models do not extract text spans.
2. **No Text Category Prediction:** Categories are chosen by residents from the 4 supported types; no NLP classifier overwrites category.
3. **No Automatic Resolution / Closure:** Field completion never auto-closes a complaint; officers make every closure decision.
4. **No Municipal Dispatch Automation:** System assists human review and routing; it does not dispatch emergency services.
