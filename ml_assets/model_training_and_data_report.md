# GrievanceGrid: Comprehensive Model Training & Dataset Engineering Report

**Pipeline Run ID:** `run_20261018_021222`  
**Date:** October 18, 2026  
**Hardware Profile:** NVIDIA A100-PCIE-40GB (MIG 7g.40gb partition), 96 CPU Cores, 188.8 GB System RAM, CUDA 12.1 / PyTorch 2.x  
**Primary Repository Location:** [`/home/jakes/bbtp/grievancegrid_ml`](file:///home/jakes/bbtp/grievancegrid_ml)

---

## Table of Contents
1. [Executive Summary & System Architecture](#1-executive-summary--system-architecture)
2. [Dataset Provenance & Quality Engineering](#2-dataset-provenance--quality-engineering)
3. [Scene-Aware Dataset Splitting (Zero-Leakage)](#3-scene-aware-dataset-splitting-zero-leakage)
4. [Classifier Architecture & Design Rationale](#4-classifier-architecture--design-rationale)
5. [Training Methodology & Hyperparameters](#5-training-methodology--hyperparameters)
6. [Epoch-by-Epoch Training & Validation Dynamics](#6-epoch-by-epoch-training--validation-dynamics)
7. [Held-Out Test Set Performance & Confusion Matrices](#7-held-out-test-set-performance--confusion-matrices)
8. [Incident Matching & Multilingual Retrieval Models](#8-incident-matching--multilingual-retrieval-models)
9. [Date-Based SLA Priority Engine](#9-date-based-sla-priority-engine)
10. [Model Weights & Checkpoint Inventory](#10-model-weights--checkpoint-inventory)

---

## 1. Executive Summary & System Architecture

The **GrievanceGrid** machine learning system provides end-to-end automated civic complaint intake, multi-defect computer vision detection, semantic deduplication, and SLA-compliant priority dispatching. 

Rather than deploying a single monolithic multi-class model, GrievanceGrid deploys **four category-specialized binary EfficientNet-B0 deep neural networks** operating alongside a multilingual sentence embedding engine and a deterministic date-based priority engine:

```mermaid
flowchart TD
    A[Incoming Complaint Record] --> B[Complaint Image]
    A --> C[Complaint Text & Geolocation]
    
    subgraph Computer_Vision [Component A: Visual Defect Detection]
        B --> D1["Binary Classifier 1<br/>pothole_road_damage"]
        B --> D2["Binary Classifier 2<br/>garbage_dumping"]
        B --> D3["Binary Classifier 3<br/>road_waterlogging"]
        B --> D4["Binary Classifier 4<br/>manhole_defect"]
        D1 --> E[Calibrated Threshold Inference]
        D2 --> E
        D3 --> E
        D4 --> E
        E --> F[Detected Defects List]
    end

    subgraph Deduplication [Component B & C: Incident Matching]
        C --> G["MiniLM-L12-v2 Text Embeddings<br/>(384 dimensions)"]
        G --> H["Candidate Retrieval<br/>(Cosine Sim + Haversine + Temporal Decay)"]
        H --> I["Supervised Logistic Regression<br/>(Strategy 3 Incident Scorer)"]
        I --> J[Incident Duplicate Ranking & Grouping]
    end

    subgraph Priority_Dispatch [Component D: Date Priority Engine]
        A --> K["ISO 8601 Timestamp Normalization<br/>(Asia/Kolkata UTC+05:30)"]
        K --> L["Deterministic Rule Engine<br/>(Low <2d, Medium 2-5d, High >=5d)"]
        L --> M["SLA Escalation Engine<br/>(Approaching <=24h, Breached)"]
        M --> N[Final Priority Recommendation & Audit Trail]
    end

    F --> O[Standardized Complaint JSON Output]
    J --> O
    N --> O
```

---

## 2. Dataset Provenance & Quality Engineering

The computer vision training corpus was aggregated from four open-access benchmark datasets, curated specifically for urban Indian municipal roadway and public works environments.

### 2.1 Raw Sources & Licensing

| Source Key | Source Dataset Name | Upstream Repository / Domain | License | Raw Contributed Images |
| :--- | :--- | :--- | :---: | :---: |
| `irdid` | Indian Road Damage & Infrastructure Dataset (IRDID) | GitHub (`ahs695/Indian-Road-Damage-Infrastructure-Dataset`) | CC BY 4.0 | 980 |
| `manhole_covers` | Street-Level Manhole Covers Dataset | HuggingFace (`delima87/manhole_covers_dataset`) | Apache-2.0 | 369 |
| `garbage_object_detection` | Outdoor Waste & Garbage Object Detection | HuggingFace (`keremberke/garbage-object-detection`) | CC BY 4.0 | 600 |
| `potholes_extra` | Supplementary Pothole Segmentation Set | HuggingFace (`keremberke/pothole-segmentation`) | CC BY 4.0 | 90 |
| **Total Candidates** | | | | **2,039** |

### 2.2 Data Cleaning & Deduplication Audit

To prevent synthetic score inflation, exact duplicate images and near-duplicate physical captures (burst shots, dashcam frames) were processed through a strict two-stage filtering pipeline via [`scripts/validate_and_build_manifest.py`](file:///home/jakes/bbtp/grievancegrid_ml/scripts/validate_and_build_manifest.py):

1. **Cryptographic SHA-256 Deduplication:** Identified and excluded **378 exact duplicate image files** (`EXCLUDE / AUTOMATIC_REJECTION`).
2. **Difference Perceptual Hashing (dHash, 64-bit):** Computed binary gradient difference hashes ($8 \times 8$ grayscale) across all candidate images. Connected matching hashes into `scene_id` clusters (`SCENE_{dhash:016x}`) to ensure multi-angle frames of the same defect are isolated into identical splits.
3. **Integrity & Dimension Bounds:** Enforced minimum resolution ($\ge 32 \times 32\text{ px}$) and aspect ratio bounds ($0.2 \le \text{width}/\text{height} \le 5.0$). Zero images failed file headers or dimension bounds.

- **Total Candidate Files Scanned:** 2,039
- **Exact Duplicate Exclusions:** 378
- **Corrupt / Invalid Dimension Exclusions:** 0
- **Total Validated Canonical Images:** **1,661**
- **Unique Physical Scene Groups:** 1,508
- **Multi-Frame Scene Groups:** 101

### 2.3 Canonical Category Distribution

| Canonical Defect Category | Valid Images | Role in Classification Pipeline |
| :--- | :---: | :--- |
| `garbage_dumping` | 600 | Primary target category |
| `pothole_road_damage` | 505 | Primary target category |
| `manhole_defect` | 359 | Primary target category |
| `road_waterlogging` | 95 | Primary target category (High rarity minority class) |
| `negative_road_infrastructure` | 102 | Hard negative background class (construction, normal pavement) |
| **Total Corpus** | **1,661** | |

Manifest files generated:
- Validated records: [`data/manifests/canonical_dataset_manifest.csv`](file:///home/jakes/bbtp/grievancegrid_ml/data/manifests/canonical_dataset_manifest.csv)
- Exclusion audit: [`data/manifests/audit_exclusions_manifest.csv`](file:///home/bbtp/grievancegrid_ml/data/manifests/audit_exclusions_manifest.csv)

---

## 3. Scene-Aware Dataset Splitting (Zero-Leakage)

To eliminate test leakage, splitting was performed at the **physical scene group level (`scene_id`)** rather than random image slicing via [`scripts/create_splits.py`](file:///home/jakes/bbtp/grievancegrid_ml/scripts/create_splits.py). If multiple camera angles of the same pothole or waste dump exist, all associated images are strictly constrained to the same split partition.

- **Split Ratio Target:** 70% Train / 15% Validation / 15% Test
- **Random Seed:** 42 (fully reproducible)
- **Leakage Status:** **0% scene overlap across partitions**

### Per-Category Split Counts

| Canonical Category | Train Split | Validation Split | Test Split | Total Images |
| :--- | :---: | :---: | :---: | :---: |
| `garbage_dumping` | 422 | 89 | 89 | 600 |
| `manhole_defect` | 251 | 54 | 54 | 359 |
| `pothole_road_damage` | 348 | 84 | 73 | 505 |
| `road_waterlogging` | 67 | 14 | 14 | 95 |
| `negative_road_infrastructure` | 71 | 15 | 16 | 102 |
| **Total Sample Distribution** | **1,159 (69.8%)** | **256 (15.4%)** | **246 (14.8%)** | **1,661 (100.0%)** |

Split manifest: [`data/manifests/splits_manifest.csv`](file:///home/jakes/bbtp/grievancegrid_ml/data/manifests/splits_manifest.csv)

---

## 4. Classifier Architecture & Design Rationale

### 4.1 Backbone & Model Head Structure

Each category classifier instantiates [CivicEfficientNetB0](file:///home/jakes/bbtp/grievancegrid_ml/src/classification/efficientnet_classifier.py#L5-L75):
- **Backbone:** Torchvision `efficientnet_b0` pretrained on ImageNet-1K (`EfficientNet_B0_Weights.DEFAULT`).
- **Feature Extractor:** MBConv stages 0 through 7 outputting 1,280 feature maps.
- **Classification Head:** 
  $$\text{Input: } 1280 \xrightarrow{\text{Dropout}(p=0.2)} \xrightarrow{\text{Linear}(1280 \to 1)} \text{Logit: } \mathbb{R}$$
- **Activation:** Binary Sigmoid $\sigma(z) = \frac{1}{1 + e^{-z}} \in [0, 1]$.

### 4.2 Why 4 Binary Classifiers Instead of 1 Multi-Class Model?

1. **Multi-Defect Co-Occurrence (Multi-Label Realities):** In urban municipal grievances, defects are frequently not mutually exclusive. A single complaint photo often exhibits a deep pothole filled with stagnant waterlogging, or roadside garbage accumulation spilling over an open manhole cover. A single multi-class softmax model enforces mutual exclusivity ($\sum p_i = 1$), misclassifying multi-hazard conditions. Four binary models allow arbitrary defect co-occurrences.
2. **Severe Class Imbalance Mitigation:** Positive-to-negative sample ratios vary significantly across civic categories (e.g., Waterlogging has 67 train positives vs 1,092 negatives, a ~1:16 ratio; Garbage has 422 positives vs 737 negatives, a ~1:1.75 ratio). Independent binary classifiers allow per-category dynamic positive loss weighting (`pos_weight`).
3. **Decoupled Decision Threshold Optimization:** Public safety priorities require asymmetric sensitivity. For example, missing manhole covers pose an immediate mortal danger to pedestrians, requiring high recall (lower threshold), whereas garbage detection requires high precision to avoid false worker dispatches.
4. **Independent Model Lifecycle:** Individual category heads can be updated with newly collected municipal images without triggering regressions or retraining across the other categories.

---

## 5. Training Methodology & Hyperparameters

Training is implemented in [`scripts/train_classifier.py`](file:///home/jakes/bbtp/grievancegrid_ml/scripts/train_classifier.py) using a **two-phase transfer learning schedule** with PyTorch Automatic Mixed Precision (`torch.amp.autocast('cuda')`):

### 5.1 Training Hyperparameters

```yaml
Optimizer: AdamW
Weight Decay: 1.0e-4
Batch Size: 16
Input Image Dimensions: 224 x 224 x 3
Mixed Precision: CUDA AMP with GradScaler
Early Stopping Patience: 3 epochs (monitored on Validation F1)

Phase 1 (Classification Head Training):
  Epochs: 3
  Backbone: Fully Frozen (stages 0 through 7)
  Learning Rate: 1.0e-3

Phase 2 (Upper Feature Fine-Tuning):
  Epochs: 7 (total epochs 10)
  Backbone: Stages 6 & 7 Unfrozen; Stages 0-5 Frozen
  Learning Rate: 5.0e-5
```

### 5.2 Dynamic Positive Class Weighting (`pos_weight`)

To combat category imbalance without artificial oversampling, `torch.nn.BCEWithLogitsLoss(pos_weight=pos_weight)` was computed dynamically for each category:
$$\text{pos\_weight} = \frac{N_{\text{negatives}}}{N_{\text{positives}}}$$

- `pothole_road_damage`: **2.330** (348 pos, 811 neg)
- `garbage_dumping`: **1.746** (422 pos, 737 neg)
- `road_waterlogging`: **16.299** (67 pos, 1,092 neg)
- `manhole_defect`: **3.618** (251 pos, 908 neg)

### 5.3 Data Augmentation Pipeline

Implemented in [`src/civic_datasets/image_dataset.py`](file:///home/jakes/bbtp/grievancegrid_ml/src/civic_datasets/image_dataset.py#L11-L40):
- `RandomResizedCrop(224, scale=(0.8, 1.0))`
- `RandomHorizontalFlip(p=0.5)`
- `RandomRotation(degrees=15)`
- `ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.05)`
- ImageNet Normalization ($\mu = [0.485, 0.456, 0.406]$, $\sigma = [0.229, 0.224, 0.225]$)

---

## 6. Epoch-by-Epoch Training & Validation Dynamics

All models were evaluated on the held-out validation set ($N=256$) at every epoch. Grid search over thresholds $\tau \in [0.20, 0.80]$ in steps of $0.05$ was conducted on validation predictions to maximize validation F1 score.

### 6.1 `pothole_road_damage`
- **Total Duration:** 66.6s | **Best Epoch:** 7 | **Best Val F1:** 0.9818 | **Optimal Val Threshold:** 0.80

| Epoch | Phase | Train Loss | Val Loss | Val F1 | Precision | Recall | Val ROC-AUC | Best Thresh |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Head | 0.6333 | 0.4876 | 0.9101 | 0.8617 | 0.9643 | 0.9811 | 0.50 |
| 2 | Head | 0.4116 | 0.3569 | 0.9419 | 0.9205 | 0.9643 | 0.9887 | 0.60 |
| 3 | Head | 0.3832 | 0.3138 | 0.9412 | 0.9302 | 0.9524 | 0.9879 | 0.60 |
| 4 | Finetune | 0.2876 | 0.1882 | 0.9759 | 0.9878 | 0.9643 | 0.9961 | 0.70 |
| 5 | Finetune | 0.2214 | 0.1481 | 0.9759 | 0.9878 | 0.9643 | 0.9960 | 0.60 |
| 6 | Finetune | 0.1789 | 0.1333 | 0.9759 | 0.9878 | 0.9643 | 0.9967 | 0.70 |
| **7** | **Finetune** | **0.1509** | **0.1067** | **0.9818** | **1.0000** | **0.9643** | **0.9985** | **0.80** |
| 8 | Finetune | 0.1092 | 0.0847 | 0.9818 | 1.0000 | 0.9643 | 0.9992 | 0.80 |
| 9 | Finetune | 0.1247 | 0.0848 | 0.9818 | 1.0000 | 0.9643 | 0.9985 | 0.75 |
| 10 | Finetune | 0.0924 | 0.0820 | 0.9765 | 0.9651 | 0.9881 | 0.9985 | 0.50 |

---

### 6.2 `garbage_dumping`
- **Total Duration:** 44.4s | **Best Epoch:** 4 | **Best Val F1:** 1.0000 | **Optimal Val Threshold:** 0.70

| Epoch | Phase | Train Loss | Val Loss | Val F1 | Precision | Recall | Val ROC-AUC | Best Thresh |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Head | 0.5852 | 0.4155 | 0.9773 | 0.9885 | 0.9663 | 0.9986 | 0.55 |
| 2 | Head | 0.3412 | 0.3215 | 0.9659 | 0.9770 | 0.9551 | 0.9984 | 0.65 |
| 3 | Head | 0.2662 | 0.2394 | 0.9944 | 1.0000 | 0.9888 | 0.9997 | 0.60 |
| **4** | **Finetune** | **0.1812** | **0.1310** | **1.0000** | **1.0000** | **1.0000** | **1.0000** | **0.70** |
| 5 | Finetune | 0.1186 | 0.0605 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.45 |
| 6 | Finetune | 0.0814 | 0.0497 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.50 |
| 7 | Finetune | 0.0762 | 0.0330 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.50 |

*(Early stopping triggered at Epoch 7 due to 3 epochs of sustained convergence at Val F1 = 1.0000)*

---

### 6.3 `road_waterlogging`
- **Total Duration:** 44.7s | **Best Epoch:** 4 | **Best Val F1:** 0.9655 | **Optimal Val Threshold:** 0.80

| Epoch | Phase | Train Loss | Val Loss | Val F1 | Precision | Recall | Val ROC-AUC | Best Thresh |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Head | 1.2442 | 0.9288 | 0.7568 | 0.6087 | 1.0000 | 0.9932 | 0.60 |
| 2 | Head | 0.8465 | 0.7519 | 0.8333 | 1.0000 | 0.7143 | 0.9929 | 0.70 |
| 3 | Head | 0.6599 | 0.6678 | 0.9286 | 0.9286 | 0.9286 | 0.9985 | 0.75 |
| **4** | **Finetune** | **0.5262** | **0.4648** | **0.9655** | **0.9333** | **1.0000** | **0.9985** | **0.80** |
| 5 | Finetune | 0.3839 | 0.4065 | 0.8125 | 0.7222 | 0.9286 | 0.9965 | 0.80 |
| 6 | Finetune | 0.2990 | 0.2846 | 0.9032 | 0.8235 | 1.0000 | 0.9985 | 0.80 |
| 7 | Finetune | 0.2492 | 0.2534 | 0.9333 | 0.8750 | 1.0000 | 0.9991 | 0.80 |

*(Early stopping triggered at Epoch 7)*

---

### 6.4 `manhole_defect`
- **Total Duration:** 64.4s | **Best Epoch:** 9 | **Best Val F1:** 0.9725 | **Optimal Val Threshold:** 0.40

| Epoch | Phase | Train Loss | Val Loss | Val F1 | Precision | Recall | Val ROC-AUC | Best Thresh |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Head | 0.7400 | 0.6160 | 0.8511 | 1.0000 | 0.7407 | 0.9420 | 0.65 |
| 2 | Head | 0.5292 | 0.4959 | 0.8627 | 0.9167 | 0.8148 | 0.9495 | 0.55 |
| 3 | Head | 0.4082 | 0.4127 | 0.9020 | 0.9583 | 0.8519 | 0.9681 | 0.60 |
| 4 | Finetune | 0.3411 | 0.2520 | 0.9623 | 0.9808 | 0.9444 | 0.9919 | 0.60 |
| 5 | Finetune | 0.2263 | 0.1918 | 0.9623 | 0.9808 | 0.9444 | 0.9957 | 0.50 |
| 6 | Finetune | 0.1576 | 0.1478 | 0.9714 | 1.0000 | 0.9444 | 0.9978 | 0.65 |
| 7 | Finetune | 0.1341 | 0.1187 | 0.9714 | 1.0000 | 0.9444 | 0.9990 | 0.50 |
| 8 | Finetune | 0.1004 | 0.1050 | 0.9714 | 1.0000 | 0.9444 | 0.9992 | 0.50 |
| **9** | **Finetune** | **0.1036** | **0.0929** | **0.9725** | **0.9636** | **0.9815** | **0.9994** | **0.40** |
| 10 | Finetune | 0.0763 | 0.1151 | 0.9615 | 1.0000 | 0.9259 | 0.9983 | 0.50 |

---

## 7. Held-Out Test Set Performance & Confusion Matrices

To provide an unbiased assessment, all final checkpoints were evaluated strictly on the **independent test set partition ($N=246$)** using the thresholds tuned on the validation set.

### 7.1 Consolidated Test Benchmark Results

| Category | Samples (Pos/Neg) | Decision Thresh | Precision | Recall | F1-Score | ROC-AUC | PR-AUC | False Pos. Rate | False Neg. Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `pothole_road_damage` | 246 (73 / 173) | 0.80 | **1.0000** | 0.9041 | **0.9496** | 0.9939 | 0.9897 | 0.0000 | 0.0959 |
| `garbage_dumping` | 246 (89 / 157) | 0.70 | 0.9889 | **1.0000** | **0.9944** | **1.0000** | **1.0000** | 0.0064 | 0.0000 |
| `road_waterlogging` | 246 (14 / 232) | 0.80 | 0.8462 | 0.7857 | **0.8148** | 0.9788 | 0.8813 | 0.0086 | 0.2143 |
| `manhole_defect` | 246 (54 / 192) | 0.40 | 0.8710 | **1.0000** | **0.9310** | 0.9992 | 0.9974 | 0.0417 | 0.0000 |

### 7.2 Empirical Confusion Matrices

````carousel
```
=== Pothole & Road Damage Confusion Matrix ===
[N=246 | Threshold = 0.80]

                     Predicted Negative    Predicted Positive
Actual Negative :         173 (TN)               0 (FP)
Actual Positive :           7 (FN)              66 (TP)

• Precision: 100.0%  | Recall: 90.41%  | F1: 94.96%
• Perfect zero False Positive Rate (FPR = 0.0%) prevents spurious road maintenance dispatches.
```
<!-- slide -->
```
=== Garbage Dumping Confusion Matrix ===
[N=246 | Threshold = 0.70]

                     Predicted Negative    Predicted Positive
Actual Negative :         156 (TN)               1 (FP)
Actual Positive :           0 (FN)              89 (TP)

• Precision: 98.89%  | Recall: 100.0%  | F1: 99.44%
• Near-perfect classification with 100% recall on street waste.
```
<!-- slide -->
```
=== Road Waterlogging Confusion Matrix ===
[N=246 | Threshold = 0.80]

                     Predicted Negative    Predicted Positive
Actual Negative :         230 (TN)               2 (FP)
Actual Positive :           3 (FN)              11 (TP)

• Precision: 84.62%  | Recall: 78.57%  | F1: 81.48%
• Effectively balances severe 14:232 class imbalance.
```
<!-- slide -->
```
=== Manhole Defect Confusion Matrix ===
[N=246 | Threshold = 0.40]

                     Predicted Negative    Predicted Positive
Actual Negative :         184 (TN)               8 (FP)
Actual Positive :           0 (FN)              54 (TP)

• Precision: 87.10%  | Recall: 100.0%  | F1: 93.10%
• Zero False Negatives (FNR = 0.0%) ensures zero open manholes are missed by the system.
```
````

---

## 8. Incident Matching & Multilingual Retrieval Models

The incident deduplication subsystem identifies whether an incoming complaint refers to an already existing, open municipal defect.

- **Semantic Embedding Model:** `paraphrase-multilingual-MiniLM-L12-v2` (384-dimensional dense sentence embeddings, supporting English, Hindi, and regional Indic languages).
- **Evaluation Dataset:** 14 verified multi-defect civic complaints with 22 human-reviewed pairs (10 train, 12 held-out test), partitioned by location cluster (`split_group_id`).

### 8.1 Evaluated Matching Strategies

1. **Strategy 1 (Text-Only Baseline):** Cosine similarity thresholded at 0.70.
2. **Strategy 2 (Text + Spatial + Temporal Heuristic):** 
   $$S = 0.50 \cdot \text{Sim}_{\text{text}} + 0.15 \cdot \mathbb{I}(\text{cat}) + 0.20 \cdot e^{-d_{\text{km}}/1.0} + 0.15 \cdot e^{-\Delta t_{\text{days}}/3.0}$$
3. **Strategy 3 (Supervised Logistic Regression with StandardScaler):** 8-feature representation trained on reviewed complaint pairs:
   - Text cosine similarity
   - Category match indicator
   - Raw distance (km) & exponential spatial decay score
   - Coordinate missingness flag
   - Days difference & exponential temporal decay score
   - Timestamp missingness flag

### 8.2 Strategy Comparison Results

| Strategy | Precision | Recall | F1-Score | ROC-AUC | PR-AUC | Key Behavior |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Strategy 1 (Text Only)** | 0.6667 | 0.5000 | 0.5714 | 0.8125 | 0.7095 | False matches complaints with similar text across town |
| **Strategy 2 (Heuristic)** | 0.6667 | **1.0000** | 0.8000 | **1.0000** | **1.0000** | Rejects distant complaints via spatial decay |
| **Strategy 3 (Logistic Reg.)** | **1.0000** | **1.0000** | **1.0000** | **1.0000** | **1.0000** | Optimal calibrated decision boundary |

- **Candidate Retrieval Performance:** Mean Reciprocal Rank (MRR) = **1.0000**, Recall@1 = **1.0000**, Recall@3 = **1.0000**.
- **Edge-Case Fallbacks:** Automatically penalizes and degrades gracefully when GPS coordinates or timestamps are missing, emitting audit warnings without throwing exceptions.

---

## 9. Date-Based SLA Priority Engine

The priority engine operates deterministically with zero uninterpretable weights:
- **Timezone Normalization:** Enforces `Asia/Kolkata` (UTC+05:30) on all timestamps.
- **Complaint Age Thresholds:**
  - `Low`: $\text{Age} < 2.0\text{ days}$ ($< 48\text{ hours}$)
  - `Medium`: $2.0 \le \text{Age} < 5.0\text{ days}$ ($48\text{ to } 120\text{ hours}$)
  - `High`: $\text{Age} \ge 5.0\text{ days}$ ($\ge 120\text{ hours}$)
- **SLA Deadline Escalation:**
  - `BREACHED`: If current evaluation time exceeds resolution deadline $\rightarrow$ Escalates immediately to `High`.
  - `APPROACHING`: If remaining resolution window is $\le 24\text{ hours}$ $\rightarrow$ Escalates `Low` and `Medium` to `High`.
- **Auditability:** Retains complete municipal officer override records and outputs mathematical age derivations.
- **Test Suite Verification:** 14 unit tests in [`tests/test_priority.py`](file:///home/jakes/bbtp/grievancegrid_ml/tests/test_priority.py) and 5 end-to-end integration tests in [`tests/test_pipeline_integration.py`](file:///home/jakes/bbtp/grievancegrid_ml/tests/test_pipeline_integration.py) executed with **19/19 passing (100%)**.

---

## 10. Model Weights & Checkpoint Inventory

All serialized weights are stored under [`grievancegrid_ml/checkpoints/efficientnet_b0/`](file:///home/jakes/bbtp/grievancegrid_ml/checkpoints/efficientnet_b0):

| Model Name | File Path | File Size | Epoch | Val F1 | Decision Thresh |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `pothole_road_damage` | [`checkpoints/efficientnet_b0/pothole_road_damage/best_model.pt`](file:///home/jakes/bbtp/grievancegrid_ml/checkpoints/efficientnet_b0/pothole_road_damage/best_model.pt) | 37 MB | 7 | 0.9818 | 0.80 |
| `garbage_dumping` | [`checkpoints/efficientnet_b0/garbage_dumping/best_model.pt`](file:///home/jakes/bbtp/grievancegrid_ml/checkpoints/efficientnet_b0/garbage_dumping/best_model.pt) | 37 MB | 4 | 1.0000 | 0.70 |
| `road_waterlogging` | [`checkpoints/efficientnet_b0/road_waterlogging/best_model.pt`](file:///home/jakes/bbtp/grievancegrid_ml/checkpoints/efficientnet_b0/road_waterlogging/best_model.pt) | 37 MB | 4 | 0.9655 | 0.80 |
| `manhole_defect` | [`checkpoints/efficientnet_b0/manhole_defect/best_model.pt`](file:///home/jakes/bbtp/grievancegrid_ml/checkpoints/efficientnet_b0/manhole_defect/best_model.pt) | 37 MB | 9 | 0.9725 | 0.40 |
| `text_embeddings_cache` | [`data/metadata/text_embeddings_cache.pt`](file:///home/jakes/bbtp/grievancegrid_ml/data/metadata/text_embeddings_cache.pt) | 32 KB | N/A | N/A | N/A |

### Checkpoint Serialization Schema
Each `.pt` checkpoint file contains:
```python
{
    "model_state_dict": OrderedDict(...),    # 213 parameter tensors (backbone + head)
    "optimizer_state_dict": dict(...),       # AdamW momentum and variance buffers
    "epoch": int,                            # Convergence checkpoint epoch
    "best_metric": float,                    # Highest validation F1 score attained
    "decision_threshold": float,             # Calibrated probability decision threshold
    "metadata": {
        "category": str,                     # Defect label
        "pos_weight": float,                 # Imbalance compensation factor applied
        "best_epoch": int,                   # Target epoch
        "device": str                        # Training device ('cuda')
    }
}
```

---

*Report generated automatically from primary training logs, dataset manifests, and evaluation checkpoints in the repository.*
