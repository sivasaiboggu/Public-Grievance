# Third-Party Dependencies and Assets

This document records libraries and assets introduced across project passes, their rationale, and license compliance.

## Web Application Dependencies

| Library | Version / Source | License | Purpose / Rationale |
|---|---|---|---|
| `react-compare-slider` | ^4.0.0 | MIT | Interactive before-and-after comparison slider for verified repair photographic evidence across resident, officer, and senior views. |
| `browser-image-compression` | ^2.0.2 | MIT | Client-side compression and EXIF metadata sanitisation for field workers capturing before/after repair photos directly on mobile and desktop browsers. |
| `@grievancegrid/api-client` (Internal) | workspace:* | MIT | Shared TypeScript SDK providing `getErrorMessage(error, fallback)`, `toList(response)`, formatting helpers (`formatDate`, `formatDuration`, `formatPlural`), and typed HTTP clients. |
| `lucide-react` | ^1.58.0 | ISC | Crisp, lightweight interface icons with accessible ARIA labeling. |
| `recharts` | ^3.10.1 | MIT | Accessible data visualization components for senior overview analytics and trends. |
| `sonner` | ^2.0.8 | MIT | Accessible, non-intrusive toast notifications for feedback and status updates. |

> **Note on 3D Assets:** All 3D libraries (`three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`) and 3D scene assets (`town.glb`, decoder modules, `/credits` route) have been completely removed from the project in Pass 9.

## Mobile Application Dependencies

| Library | Version / Source | License | Purpose / Rationale |
|---|---|---|---|
| `expo-image-picker` | ~57.0.20 | MIT | Native camera and gallery selector for field repair documentation and citizen problem reporting. |
| `expo-location` | ~57.0.21 | MIT | High-accuracy device GPS geofence matching and reverse street address discovery. |
| `expo-secure-store` | ^58.0.2 | MIT | Secure encrypted local storage for session authentication tokens. |

## Photographic Assets (Pass 10 Authentication Slideshow)

All four slideshow photographs are freely licensed from Wikimedia Commons under Creative Commons licenses, verified sharp portrait photographs exceeding 1800px on the short side, portraying Indian and municipal street environments without identifiable human faces or license plates:

| Slide File | Category | Title | Photographer | Source URL | License | Download Date |
|---|---|---|---|---|---|---|
| `slide-1-road-damage.jpg` | Road damage | Potholed road outside Kolkata Airport | Slyronit | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Potholed_road_outside_Kolkata_Airport.jpg) | CC BY-SA 4.0 ([Terms](https://creativecommons.org/licenses/by-sa/4.0)) | 2026-10-19 |
| `slide-2-garbage.jpg` | Garbage | Building construction-demolition-repair waste being dumped in streets in Bengaluru | Mallikarjunasj | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Building_construction-demolition-repair_waste_being_dumped_in_streets_in_Bengaluru.jpg) | CC BY-SA 3.0 ([Terms](https://creativecommons.org/licenses/by-sa/3.0)) | 2026-10-19 |
| `slide-3-waterlogging.jpg` | Waterlogging | A waterlogged road on a rainy day | Beendy234 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_waterlogged_road_on_a_rainy_day.jpg) | CC BY-SA 4.0 ([Terms](https://creativecommons.org/licenses/by-sa/4.0)) | 2026-10-19 |
| `slide-4-manhole.jpg` | Manhole or open drain | Chengde Road rainwater manhole cover 20190814b | Diamo Laung Bobpuao | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chengde_Road_rainwater_manhole_cover_20190814b.jpg) | CC BY-SA 4.0 ([Terms](https://creativecommons.org/licenses/by-sa/4.0)) | 2026-10-19 |

Attribution is maintained in `apps/web/public/images/auth/credits.json` and on the plain `/credits` page linked from the application administration footer. Sizing, AVIF, WebP, and JPEG responsive formats with blur placeholders are generated deterministically by `apps/web/scripts/make-slides.mjs` (`npm run slides`).

## Machine Learning & Decision Support Dependencies

| Library / Model | Version / Source | License | Purpose / Rationale |
|---|---|---|---|
| `onnxruntime` | ^1.20+ | MIT | Cross-platform, CPU-optimized inference engine for running the four EfficientNet-B0 civic photo classifiers with low latency. |
| `numpy` | ^2.0+ | BSD-3-Clause | Tensor transformations, ImageNet channel normalization, and distance matrix calculations. |
| `sentence-transformers` (`all-MiniLM-L6-v2`) | ~3.0+ | Apache-2.0 | Dense 384-dimensional sentence embeddings for text similarity and duplicate report matching via Strategy 2. |
| `EfficientNet-B0` Checkpoints | Sourced from training pipelines | Apache-2.0 / Custom Weights | 4 dedicated binary classifiers for pothole road damage, garbage dumping, road waterlogging, and manhole defect detection. |
