# GrievanceGrid — Municipal Demo Walkthrough Script

A step-by-step presentation script designed for demonstrating the full GrievanceGrid system to municipal leadership, evaluators, or civic stakeholders.

---

## Demo Preparation Checklist

1. **Stack Running**:
   - Backend running on `http://127.0.0.1:8000` (shows startup summary banner).
   - Redis & Mailpit running (or Mailpit on `http://127.0.0.1:8025`).
   - Web frontend running on `http://localhost:3000`.
   - Celery worker running (`celery -A app.worker.celery_app worker -l info -P solo`).
2. **Demo Data Seeded**:
   - `python -m app.seed_demo` executed (seeds complaints, field workers, teams, clusters, ML predictions, and feedback).
3. **Browser Tabs Prepared**:
   - Tab 1: `http://localhost:3000` (Citizen / Sign-in).
   - Tab 2: `http://localhost:3000/officer` (Officer Triage Workspace).
   - Tab 3: `http://localhost:3000/senior` (Senior Authority Overview).
   - Tab 4: `http://localhost:3000/admin` (Admin Console).
   - Tab 5: `http://localhost:8025` (Mailpit Inbox).

---

## Act 1: The Resident Experience (Sign-in & Submission)

### 1.1 Slideshow Sign-in & Public Commitment
- **Action**: Navigate to `http://localhost:3000/login`.
- **Narration**:
  > *"When citizens and municipal staff access GrievanceGrid, they are greeted with an accessible, high-contrast slideshow showcasing authentic public works across the city: road maintenance, solid waste collection, monsoon waterlogging response, and pedestrian manhole safety."*
- **Highlight**:
  - Point out the 6-second smooth cross-fade, progress indicators, and keyboard navigation (left/right arrow keys).
  - Note the `/credits` link at the bottom demonstrating adherence to open-source licenses (CC BY-SA).
- **Action**: Click **"Use a test account"** and select **"Citizen (Aarav Sharma)"** (`citizen@grievancegrid.test`). Click **"Sign in"**.

### 1.2 Resident Complaint Submission
- **Action**: Click **"Report an issue"** (`/citizen/new`).
- **Steps**:
  1. Select **"Road damage"** (notice the Service Charter guarantee: "Target: 24h review, 72h fix").
  2. Enter Title: `Deep pothole outside Fort Kochi bus terminal`.
  3. Description: `Hazardous pothole causing two-wheelers to swerve into oncoming traffic during evening commute.`
  4. Location: Type `Fort Kochi Bus Terminus` or click "Use my location".
  5. Photo: Attach a genuine pothole photo from `ml_assets/local_eval/road_damage/slide-1-road-damage.jpg`.
     - *Notice the neutral municipal prompt: "Please use an original photo taken at the place."*
  6. Click **"Submit report"**.
- **Result**:
  - Immediate receipt with unique tracking ID (e.g. `GG-2026-A1B2C3`).
  - Resident view displays the Service Charter deadline and cluster notice:
    > *"Other people reported this too. We are handling it together."*

---

## Act 2: The Officer Triage Workspace (Triage & Assignment)

### 2.1 Queue & Instant Live Alert
- **Action**: Switch to Tab 2 or sign in as **"Officer (Priya Patel)"** (`officer@grievancegrid.test`).
- **Highlight**:
  - Real-time notification bell shows the new complaint count updated within <2s via Server-Sent Events (SSE).
  - Select the newly submitted complaint from the queue.
  - Notice the **"+1 similar nearby"** chip beside the tracking ID in the report list.

### 2.2 Standard SLA Clocks
- **Highlight**:
  - View the **SLA Timers**:
    - "First response: Review due in 23h"
    - "Fix deadline: Target 71h remaining"
  - Clarify that SLA clocks follow a versioned rubric per category, preventing arbitrary deadline manipulation.

### 2.3 Layered Photo Authenticity & Software Check
- **Highlight**:
  - Under **"Photo check"**:
    - Software suggestion indicates: *"Photo suggests defect matches Road damage."*
    - Click **"Looks right"** button. An instant confirmation confirms feedback is recorded for municipal auditing.
    - If testing an edited photo: point out the **"Look closer"** advisory card detailing reasons (e.g. "Software header indicates Canva", "Photo taken 12 days before report").

### 2.4 Incident Clustering & Deduplication
- **Highlight**:
  - Point out **"Similar reports at this place"**:
    - Groups reports within the category radius (60m for road damage, 30m for manhole, 100m for garbage, 200m for waterlogging).
    - Officer has three explicit, authoritative choices:
      - **"Same problem"** (merges work, keeps residents updated).
      - **"Different problem"** (separate defect).
      - **"Came back"** (recurring defect).
    - Emphasize the truth rule: *Software proposes clusters, but only authorized officers confirm them.*

### 2.5 Field Worker Assignment
- **Action**: In the docked action bar:
  - Click the **"Assign to"** combobox.
  - Type `Rajesh` or browse: notice workers are grouped into **"Matching team"** (Roads Maintenance) and **"Other people"**.
  - Select **"Rajesh Kumar"** and click **"Assign"**.
- **Result**:
  - Display immediately updates to show *"Assigned to Rajesh Kumar (Roads Maintenance Team)"* with a *"Change"* button.

---

## Act 3: Field Worker Execution & Verification

### 3.1 Field Queue & Directions
- **Action**: Sign in as **"Field worker (Rajesh Kumar)"** (`field@grievancegrid.test`) on `http://localhost:3000/field`.
- **Highlight**:
  - Active task is displayed with priority badge, SLA deadline, and GPS coordinates.
  - Click **"Directions"** or **"Open in Maps"** to show turn-by-turn navigation link for field crews.

### 3.2 Completion Photo & Status
- **Action**: Open task detail.
- **Steps**:
  1. Add progress note: `Bitumen patch completed and compacted. Road reopened.`
  2. Upload after-photo evidence.
  3. Change status to **"Fixed"** (Resolved).
- **Result**:
  - Resident timeline is automatically updated with the completion note and photo evidence.
  - Confirmation that work completion on a linked complaint never silently deletes citizen tracking records.

---

## Act 4: Senior Authority Oversight & Live Escalation

### 4.1 Executive Dashboard & Bubble Map
- **Action**: Switch to Tab 3 or sign in as **"Senior authority (S. Ramanathan)"** (`senior@grievancegrid.test`) on `http://localhost:3000/senior`.
- **Highlight**:
  - **5-Column Metric Row**: Reports received, Fixed, Overdue, Average time to fix, and **"Answered on time"** percentage (e.g. 92% within SLA).
  - **Incident Clusters & Density Bubble Map**:
    - Leaflet-powered interactive map with circles sized by report volume.
    - Solid blue circles represent officer-confirmed incidents.
    - Dashed amber circles represent algorithmic suggested clusters marked with the *Exploratory* caveat.

### 4.2 Real-Time Deadline Breach & Pop-up Alert
- **Action**: Simulate or observe an escalation trigger via Celery worker `check_escalations`.
- **Result**:
  - When a report passes its deadline, the Senior Authority screen instantly displays the **"Report overdue: action needed"** modal via SSE without page reload.
  - Click **"Remind the officer"**:
    - Dispatches a high-priority notification to the assigned GRO.
    - Records an immutable resident timeline note: *"This report is past its due date. A senior authority has been told."*

---

## Act 5: Administrative Control & Configuration

### 5.1 Admin Console & Audit Log
- **Action**: Sign in as **"Admin (System Administrator)"** (`admin@grievancegrid.test`) on `http://localhost:3000/admin`.
- **Highlight**:
  - Clean full-width console with switches and hairlines.
  - Change a response time (e.g. Garbage review from 12h to 8h) or toggle a suggestion switch.
  - Notice the **sticky unsaved-changes bar** with "Save changes" and "Cancel".
  - Click "Save changes".
  - Navigate to **"People & Audit"**: view the newly recorded audit log row showing the exact admin email, timestamp, and field deltas.

### 5.2 Third-Party Credits
- **Action**: Click the footer link **"Open-source & photo credits"** (`/credits`).
- **Highlight**:
  - Demonstrates strict municipal compliance with CC BY-SA 3.0 / 4.0 photo licenses, author attribution, and open-source library licenses.
