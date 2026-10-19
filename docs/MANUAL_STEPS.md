# GrievanceGrid — Beginner Step-by-Step Manual

This guide walks you through setting up, configuring, running, evaluating, and testing GrievanceGrid from scratch on a Windows machine.

---

## 1. Prerequisites and Installation Verification

Before starting, ensure these core tools are installed on your Windows machine:

### A. Docker Desktop
1. Download from [docker.com](https://www.docker.com/products/docker-desktop/) and install.
2. Start Docker Desktop from the Start menu and wait until the whale icon in the taskbar turns solid green.
3. Check in PowerShell:
   ```powershell
   docker --version
   ```
   **Expected output:** `Docker version 27.x.x` (or similar).  
   *If you see "command not found" or "error during connect", ensure Docker Desktop is running.*

### B. Python 3.11+
1. Download Python from [python.org](https://www.python.org/downloads/) (check "Add python.exe to PATH" during installation).
2. Check in PowerShell:
   ```powershell
   python --version
   ```
   **Expected output:** `Python 3.11.x` or `Python 3.12.x`.  
   *If you see Python 3.10 or lower, download and install Python 3.12.*

### C. Node.js 20+
1. Download Node.js LTS from [nodejs.org](https://nodejs.org/).
2. Check in PowerShell:
   ```powershell
   node -v
   npm -v
   ```
   **Expected output:** `v20.x.x` or higher, and npm `10.x.x`.

### D. Mobile: Expo Go App on Phone (for mobile testing)
1. On your iOS device (App Store) or Android device (Google Play), search for and install **Expo Go**.
2. Both your PC and your phone must be connected to the exact same local Wi-Fi network.

---

## 2. Environment Configuration

1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Generate a secure secret key in PowerShell:
   ```powershell
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
   ```
3. Open `.env` in Notepad or your editor:
   - Set `GG_SECRET_KEY=` to the 48-character string generated above.
   - For phone testing, set `EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:8000` (see Section 9).

---

## 3. Installing Machine Learning Packages and Checking Asset Sizes

GrievanceGrid uses lightweight CPU inference for software suggestions.

1. Activate your backend virtual environment:
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   ```
2. Install the suggestion runtime packages (if not already installed):
   ```powershell
   pip install onnxruntime sentence-transformers torch torchvision pillow
   ```
   **Package Sizes & Footprint:**
   - `onnxruntime` (~18 MB): CPU-optimized execution engine for image classification.
   - `sentence-transformers` (~85 MB) + dependencies: Multilingual sentence embeddings (`paraphrase-multilingual-MiniLM-L12-v2` ~470 MB downloaded on first run to user cache).
   - `torch` + `torchvision` (~180 MB CPU-only wheels): Used for offline ONNX export and training validation.
3. Verify package installation:
   ```powershell
   python -c "import onnxruntime; import sentence_transformers; print('ML Packages ready!')"
   ```
   **Expected output:** `ML Packages ready!`.  
   *If you see "No module named onnxruntime", run `pip install onnxruntime`.*

---

## 4. Copying Model Assets and Exporting to ONNX

The classifier models inspect report photos across the four active categories:
- `pothole_road_damage`
- `garbage_dumping`
- `road_waterlogging`
- `manhole_defect`

### Step 4.1: Placing Checkpoint Files
If you have trained model weights (`best_model.pt`), place them in the following folder structure:
```
ml_assets/
└── checkpoints/
    └── efficientnet_b0/
        ├── pothole_road_damage/best_model.pt
        ├── garbage_dumping/best_model.pt
        ├── road_waterlogging/best_model.pt
        └── manhole_defect/best_model.pt
```
*If `ml_assets/` is empty or missing real `.pt` checkpoints, the software gracefully operates in manual-fallback mode. Officer decisions remain 100% authoritative.*

### Step 4.2: Exporting PyTorch Models to ONNX
Run the export script from the repo root:
```powershell
cd C:\Users\HP\Downloads\GrievanceGrid-main\GrievanceGrid-main
.\backend\.venv\Scripts\python ml/export_onnx.py --checkpoints-dir ml_assets/checkpoints/efficientnet_b0 --output-dir ml_assets/models
```
**Expected output:**
```
Exporting ml_assets/checkpoints/efficientnet_b0/pothole_road_damage/best_model.pt -> ml_assets/models/pothole_road_damage.onnx...
Exported successfully to ml_assets/models/pothole_road_damage.onnx
...
```
*If you see "torchvision is required", run `pip install torchvision` inside `backend/`.*

---

## 5. Adding Real Photos to `local_eval` and Running Evaluation

To evaluate model accuracy on your own real local phone photos without uploading to external servers:

### Step 5.1: Create Test Photo Folders
Place JPEG/PNG test photos into category subdirectories:
```
ml_assets/
└── local_eval/
    ├── road_damage/          <- Place road/pothole photos here
    ├── garbage/              <- Place garbage/dumping photos here
    ├── waterlogging/         <- Place waterlogging photos here
    ├── manhole_defect/       <- Place open drain/manhole photos here
    └── negative/             <- Place clean streets, indoor, or non-hazard photos here
```

### Step 5.2: Run Local Evaluation
Run the evaluation harness:
```powershell
.\backend\.venv\Scripts\python ml/evaluate_local.py
```
**Expected output when folders are empty:**
```
======================================================================
GrievanceGrid - Local Classifier Evaluation Harness
======================================================================
No local evaluation photos found in ml_assets/local_eval/!
To evaluate on your own test photos:
  1. Create folders:
     ml_assets/local_eval/road_damage/
     ml_assets/local_eval/garbage/
     ml_assets/local_eval/waterlogging/
     ml_assets/local_eval/manhole_defect/
     ml_assets/local_eval/negative/
  2. Drop test photos (.jpg, .jpeg, .png) into each folder.
  3. Re-run: python ml/evaluate_local.py
```
**Expected output when photos are present:**
The harness prints per-category accuracy, precision, and recall alongside 95% Wilson score confidence intervals:
```
======================================================================
Evaluation Results (with 95% Wilson Score Confidence Intervals):
======================================================================
Category: road_damage (N = 25)
  - Precision: 92.3% [75.9%, 97.9%]
  - Recall:    88.0% [70.0%, 95.8%]
...
```

---

## 6. Reseeding Kochi Demo Data

To wipe previous test data and populate canonical Kochi wards, staff accounts, realistic complaint titles, and the four active categories:
```powershell
cd backend
.\.venv\Scripts\python -m app.seed_demo --reset
```
**Expected output:**
```
Reset mode requested: cleaning up old demo/mock complaints and duplicate categories...
Cleanup completed.
1. Seeding Teams...
2. Seeding Categories...
3. Seeding Users...
4. Seeding Core Seed Complaints with Real Photos...
5. Seeding 90-day Analytics Spread for Senior Dashboard...
6. Backfilling notification activity...
Demo seeding complete. All test accounts, teams, categories, photos, and 90-day metrics ready.
```
*Note: This command is safe to run multiple times. Your custom test accounts remain intact unless `--reset-all` is passed.*

### Standard Test Accounts (all passwords: `<Role>@12345`):
- **Citizen:** `citizen@grievancegrid.test` / `Citizen@12345`
- **Officer:** `officer@grievancegrid.test` / `Officer@12345`
- **Field Worker:** `field@grievancegrid.test` / `Field@12345`
- **Senior Authority:** `senior@grievancegrid.test` / `Senior@12345`
- **Administrator:** `admin@grievancegrid.test` / `Admin@12345`

---

## 7. Starting the Full Stack with `dev.ps1`

Start the entire development environment in one command from the project root:
```powershell
.\dev.ps1 start
```
This will launch:
1. Docker dependencies (PostgreSQL / Redis / Mailpit if configured)
2. FastAPI backend server on `http://localhost:8000`
3. Celery background worker (configured with `--pool=solo` for Windows)
4. Celery beat scheduler
5. Next.js web application on `http://localhost:3000`

To stop all background services cleanly:
```powershell
.\dev.ps1 stop
```

---

## 8. Testing Photo Check, Duplicates, and Escalation by Hand

### Step 8.1: Testing Photo Suggestions
1. Sign in as Citizen (`citizen@grievancegrid.test`).
2. Click **Report a problem**.
3. Select **Road damage** and attach a road photo. Notice the quiet notice: *"The photo is checked by software to help the officer. A person makes every decision."*
4. Submit the report.
5. In an Incognito window, sign in as Officer (`officer@grievancegrid.test`).
6. Open the newly submitted report:
   - Notice the suggestion badge: `"Looks like a pothole"` (or `"Suggestions come from software. You decide."`).
   - If the photo shows waterlogging but category is Road damage, notice the gentle hint: `"Photo may show standing water"`.
   - Click **Looks right** or **Not right** to record reviewer feedback without changing status.

### Step 8.2: Testing Duplicate Incident Matching
1. Submit a second citizen report within 100 meters with similar text (e.g., *"Pothole near school gate"*).
2. As Officer, open the report and expand **Possible duplicates**.
3. The match score formula ($S = 0.50 \cdot \text{text} + 0.15 \cdot \text{category} + 0.20 \cdot \exp(-km) + 0.15 \cdot \exp(-days/3)$) displays candidate matches.
4. Officer can choose:
   - **Same problem**: Links reports together. The citizen timeline updates to: *"Other people reported this too. We are handling it together."*
   - **Different problem**: Rejects the candidate link.
   - **Undo**: Reversible audit trail.

### Step 8.3: Testing Escalation Ladder with Simulated Clock
To test overdue escalation events without waiting real calendar days, use the built-in time simulator:
```powershell
cd backend
.\.venv\Scripts\python -m app.simulate_clock --hours 36
```
**Expected output:**
```
Advancing time: shifting received_at back by 36.0 hours on 18 open reports...
Adjusted timestamps. Now running escalation check ladder...
Escalation check complete! Checked: 18, New Escalations Created: ...
Latest Escalation Events in database:
 - Report ID ...: Level = overdue, Silent = False
 - Report ID ...: Level = passed_to_senior, Silent = False
```
1. Open the Senior dashboard (`http://localhost:3000/senior`).
2. Notice the escalated report badge and the **Remind the officer** action button.
3. Click **Remind the officer**.
4. Check the Officer's notifications: an alert appears stating *"Senior authority sent a reminder on overdue report"*. The report status and due date remain unchanged.

---

## 9. Testing on a Physical Phone via Wi-Fi

1. Find your computer's local Wi-Fi IPv4 address:
   ```powershell
   ipconfig
   ```
   Look for `IPv4 Address` under your Wireless LAN adapter (e.g., `192.168.1.50`).
2. Allow incoming traffic through Windows Firewall:
   ```powershell
   # Run in an Administrator PowerShell window:
   New-NetFirewallRule -DisplayName "GrievanceGrid Dev" -Direction Inbound -LocalPort 8000,3000,8081 -Protocol TCP -Action Allow
   ```
3. Update `apps/mobile/.env`:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.50:8000
   ```
4. Start the mobile app:
   ```powershell
   cd apps\mobile
   npm start
   ```
5. Scan the QR code in Expo Go on your mobile device.
6. Verify:
   - Auth header displays the city street photo band.
   - Focusing inputs cleanly lifts the keyboard without hiding the input.
   - The four active categories are displayed with their example lines.

---

## 10. Multi-Photo Auth Slideshow & Asset Optimization

In Pass 10, the single sign-in image is replaced with an accessible, high-resolution 4-category rotating slideshow featuring authentic public infrastructure works under CC BY-SA licenses.

### Step 10.1: Source Images & Web Formats
The 4 source photographs are stored under `apps/web/public/images/auth/source/`:
1. `slide-1-road-damage.jpg`: Road repair in progress (Slyronit, CC BY-SA 4.0)
2. `slide-2-garbage.jpg`: Municipal waste collection (Mallikarjunasj, CC BY-SA 3.0)
3. `slide-3-waterlogging.jpg`: Monsoon water drainage (Beendy234, CC BY-SA 4.0)
4. `slide-4-manhole.jpg`: Covered drainage infrastructure (Diamo Laung Bobpuao, CC BY-SA 4.0)

### Step 10.2: Running the Image Pipeline
To generate multi-resolution AVIF, WebP, and JPEG formats at 1080px, 1600px, 2200px and 24px blur placeholders:
```powershell
cd apps\web
npm run slides
```
This updates `apps/web/public/images/auth/slides.json` and creates all responsive format variations.

### Step 10.3: Verifying Slideshow Accessibility
Open `http://localhost:3000/login` in your browser:
- The photos cross-fade smoothly every 6 seconds with a subtle 1.04 zoom.
- Hovering or focusing the pane pauses rotation automatically.
- Pressing `ArrowLeft` or `ArrowRight` cycles through slides manually.
- The 4 progress indicators at the bottom reflect the active slide.
- Clicking the footer link **"Photo & software credits"** navigates to `/credits`.

---

## 11. Real-Time Server-Sent Events (SSE) & Notification Bell

GrievanceGrid streams live municipal events over SSE at `/api/v1/events/stream` backed by Redis pub/sub with automatic in-memory and 15-second HTTP polling fallbacks.

### Verifying Instant Bell Increment (<2s):
1. Open two browser windows:
   - Window A: `http://localhost:3000/officer` (logged in as Priya Patel).
   - Window B: `http://localhost:3000/citizen/new` (logged in as Aarav Sharma).
2. In Window B, submit a new complaint.
3. Observe Window A:
   - The notification bell in the top header updates with a new badge count in under 2 seconds without page reload.
   - Click the bell to view the new notification item and click through directly to the report.

---

## 12. Standard SLA Clocks & Escalation Ladder

Every complaint tracks two independent clocks according to its category service charter:
- **First Response Clock**: Target hours for officer review (Manhole: 4h, Waterlogging: 8h, Garbage: 12h, Road: 24h).
- **Fix Target Clock**: Target hours for field work resolution (Manhole: 12h, Waterlogging: 36h, Garbage: 48h, Road: 72h).

### Verifying SLA Timers:
1. In the Officer Workspace (`/officer`), select any open complaint.
2. Under the title, view the **First response** and **Fix target** timers (e.g., "Review due in 18h", "Target: 42h remaining").
3. Overdue reports display a bold high-contrast warning badge (`#C2540A`).

### Verifying Senior Authority Deadline Escalation:
1. Open `http://localhost:3000/senior` as Senior Authority S. Ramanathan.
2. In your terminal, trigger overdue escalation check:
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -c "from app.db import SessionLocal; from app.worker.tasks import check_escalations; db = SessionLocal(); print(check_escalations())"
   ```
3. When a report is overdue, the Senior screen immediately displays the **"Report overdue: action needed"** modal.
4. Click **"Remind the officer"**:
   - Sends a high-priority alert to the GRO.
   - Adds an immutable note to the citizen timeline: *"This report is past its due date. A senior authority has been told."*

---

## 13. Incident Clustering & Deduplication

Reports within category radii (Manhole: 30m, Road: 60m, Garbage: 100m, Waterlogging: 200m) and within a 30-day window are grouped into clusters.

### Verifying Cluster Chips & Decisions:
1. In the Officer Workspace report list, look for reports with the chip **"+1 similar nearby"** or **"+2 similar nearby"**.
2. Select the report. In the detail pane, locate the **"Similar reports at this place"** card.
3. Review the distance and hours apart.
4. Click one of the three officer action buttons:
   - **"Same problem"**: Confirms the cluster.
   - **"Different problem"**: Marks the defect as distinct.
   - **"Came back"**: Flags the defect as a recurrence.
5. In the Senior Overview (`/senior`), view the **Incident Clusters & Density Bubble Map** displaying circular clusters sized by report count.

---

## 14. Layered Photo Authenticity & Software Checks

GrievanceGrid inspects provenance metadata prior to stripping EXIF:
1. C2PA Content Credentials.
2. Software tags in EXIF/XMP (Midjourney, DALL-E, Photoshop, Canva).
3. Camera hardware tags (make, model).
4. Timestamp delta vs submission time (>7 days or future).
5. GPS distance vs reported coordinates (>1 km).
6. Perceptual dHash collisions.

### Running Offline Authenticity Evaluation:
```powershell
cd backend
.\.venv\Scripts\python.exe ..\ml\evaluate_authenticity.py
```
**Expected output:**
- Evaluates genuine photos under `ml_assets/local_eval/genuine/`.
- Computes Wilson score intervals.
- Confirms false positive rate on genuine baseline is 0.0%.

### Verifying the "Look closer" Advisory Card:
1. When a photo triggers 1 strong signal (e.g. generative software header) or 2 moderate signals (e.g. Canva header + 12-day timestamp delta):
2. In the Officer Workspace under **Photo check**, a **"Look closer"** advisory card appears with:
   - Specific plain-English reasons (e.g. "The photo was saved by editing software (Canva).").
   - Disclaimer: "Suggestions come from software. You decide."
   - Feedback buttons: "Looks right" and "Not right".

---

## 15. Municipal Admin Console & Audit Logging

### Verifying Settings & Audit Trail:
1. Log in as System Administrator on `http://localhost:3000/admin`.
2. In the left rail, select **"Settings"**.
3. Modify an SLA target (e.g. Garbage review hours from 12 to 8) or toggle a suggestion switch.
4. Notice the **sticky unsaved-changes bar** at the bottom of the viewport. Click **"Save changes"**.
5. In the left rail, click **"People & Audit"** and view the **Admin Audit Log**:
   - Displays your admin email, timestamp, and the exact delta changed.
6. Check the **30-day quiet suggestions decision table** showing officer feedback counts without gamification metrics.

---

## 16. Troubleshooting Reference ("If You See This, Do This")

| If You See This | Cause | Do This |
|---|---|---|
| **Port in use error (WinError 10048)** | Previous uvicorn or node process still running | Run `Get-Process python,node \| Stop-Process -Force` in PowerShell, then rerun uvicorn/next. |
| **"Photo check is not set up" in Admin** | ONNX models or `ml_assets/models/` folder missing | Expected when running without model weights. Export models with `python ml/export_onnx.py`. |
| **Notification bell doesn't increment in <2s** | Redis not running or SSE disconnected | The app automatically reconnects and falls back to 15s polling. Start Redis via `docker compose up -d redis`. |
| **Production refused to start** | Insecure default secret key in production mode | Set `GG_SECRET_KEY` in `.env` to a random 32+ character key. |
| **Phone cannot connect to backend** | Windows Firewall blocking port 8000 or wrong LAN IP | Allow port 8000 in Windows Defender Firewall and ensure `EXPO_PUBLIC_API_URL` has your Wi-Fi IP. |
| **Foreign key error during `seed_demo --reset`** | Unhandled cascade on linked ML records | Resolved in Pass 10: `seed_demo.py` deletes `PhotoSignal`, `MLFeedback`, `MLPrediction` cleanly. |

