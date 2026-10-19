"""Local evaluation script for ONNX photo classification and runtime benchmarks.

Supports batch evaluation over ml_assets/local_eval/<category>/*.jpg and
ml_assets/local_eval/negative/*.jpg with 95% Wilson confidence intervals.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path
from PIL import Image
import numpy as np

try:
    import onnxruntime as ort
except ImportError:
    ort = None

MODELS = [
    "pothole_road_damage",
    "garbage_dumping",
    "road_waterlogging",
    "manhole_defect",
]


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Computes two-sided Wilson score interval for a binomial proportion."""
    if total == 0:
        return (0.0, 0.0)
    p_hat = successes / total
    denom = 1.0 + (z ** 2) / total
    center = (p_hat + (z ** 2) / (2 * total)) / denom
    margin = (z * math.sqrt((p_hat * (1.0 - p_hat) / total) + ((z ** 2) / (4 * (total ** 2))))) / denom
    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)
    return (lower, upper)


def preprocess(image_path: Path) -> np.ndarray:
    with Image.open(image_path) as img:
        rgb = img.convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
        arr = np.array(rgb, dtype=np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        normalized = (arr - mean) / std
        transposed = np.transpose(normalized, (2, 0, 1))
        return np.expand_dims(transposed, axis=0)


def run_batch_evaluation(local_eval_dir: Path, models_dir: Path, thresholds_file: Path):
    if ort is None:
        print("onnxruntime is not installed. Please run `pip install onnxruntime`.")
        return

    thresholds = {}
    if thresholds_file.exists():
        with open(thresholds_file, encoding="utf-8") as f:
            thresholds = json.load(f)

    print("\n=======================================================")
    print("  GrievanceGrid — Local Model Evaluation Harness")
    print("=======================================================")

    categories = MODELS + ["negative"]
    eval_folders = {cat: local_eval_dir / cat for cat in categories}
    found_any = False
    counts = {}

    for cat, p in eval_folders.items():
        if p.exists():
            files = list(p.glob("*.jpg")) + list(p.glob("*.jpeg")) + list(p.glob("*.png"))
            counts[cat] = len(files)
            if len(files) > 0:
                found_any = True
        else:
            counts[cat] = 0

    if not found_any:
        print(f"\n[Notice] No evaluation images found in `{local_eval_dir}`.")
        print("To evaluate model precision and recall on real phone photos:")
        print("1. Create the directories:")
        for cat in categories:
            print(f"   ml_assets/local_eval/{cat}/")
        print("2. Add representative .jpg images to each folder.")
        print("3. Re-run `python ml/evaluate_local.py`.")
        return

    # Check for ONNX models
    sessions: dict[str, ort.InferenceSession] = {}
    for m in MODELS:
        mf = models_dir / f"{m}.onnx"
        if mf.exists():
            sessions[m] = ort.InferenceSession(str(mf), providers=["CPUExecutionProvider"])
        else:
            print(f"Warning: Model file not found: {mf}")

    if not sessions:
        print(f"Error: No ONNX models found under {models_dir}. Please run `python ml/export_onnx.py`.")
        return

    print(f"\nDataset counts: {counts}")

    # Evaluate per model
    for m in MODELS:
        if m not in sessions:
            continue
        sess = sessions[m]
        input_name = sess.get_inputs()[0].name
        th = thresholds.get(m, {}).get("threshold", 0.50)
        ver = thresholds.get(m, {}).get("version", "v1.0")

        tp = 0
        fn = 0
        fp = 0
        tn = 0

        # Positive category
        pos_dir = eval_folders.get(m)
        if pos_dir and pos_dir.exists():
            for img_file in pos_dir.glob("*.*"):
                if img_file.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
                    continue
                try:
                    tensor = preprocess(img_file)
                    out = sess.run(None, {input_name: tensor})[0]
                    score = float(out.flatten()[0])
                    if score < -10 or score > 10:
                        score = 1.0 / (1.0 + math.exp(-score))
                    if score >= th:
                        tp += 1
                    else:
                        fn += 1
                except Exception as e:
                    print(f"Error processing {img_file}: {e}")

        # Negative samples from other categories and negative/ folder
        for neg_cat in categories:
            if neg_cat == m:
                continue
            neg_dir = eval_folders.get(neg_cat)
            if not neg_dir or not neg_dir.exists():
                continue
            for img_file in neg_dir.glob("*.*"):
                if img_file.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
                    continue
                try:
                    tensor = preprocess(img_file)
                    out = sess.run(None, {input_name: tensor})[0]
                    score = float(out.flatten()[0])
                    if score < -10 or score > 10:
                        score = 1.0 / (1.0 + math.exp(-score))
                    if score >= th:
                        fp += 1
                    else:
                        tn += 1
                except Exception as e:
                    pass

        total_pos = tp + fn
        total_pred_pos = tp + fp
        precision = (tp / total_pred_pos) if total_pred_pos > 0 else 0.0
        recall = (tp / total_pos) if total_pos > 0 else 0.0

        p_ci = wilson_interval(tp, total_pred_pos)
        r_ci = wilson_interval(tp, total_pos)

        print(f"\nModel: {m} ({ver}) [Threshold: {th:.2f}]")
        print(f"  TP: {tp}, FN: {fn}, FP: {fp}, TN: {tn}")
        print(f"  Precision: {precision:.1%} (95% CI: [{p_ci[0]:.1%}, {p_ci[1]:.1%}], n={total_pred_pos})")
        print(f"  Recall:    {recall:.1%} (95% CI: [{r_ci[0]:.1%}, {r_ci[1]:.1%}], n={total_pos})")


def main():
    parser = argparse.ArgumentParser(description="Evaluate models locally with ONNX Runtime")
    parser.add_argument("image", nargs="?", type=Path, default=None, help="Optional path to a single photo to evaluate")
    parser.add_argument("--eval-dir", type=Path, default=Path("ml_assets/local_eval"), help="Directory containing local test folders")
    parser.add_argument("--models-dir", type=Path, default=Path("ml_assets/models"), help="Directory containing exported ONNX models")
    parser.add_argument("--thresholds", type=Path, default=Path("ml_assets/models/thresholds.json"), help="Thresholds config file")
    args = parser.parse_args()

    if args.image:
        if not args.image.exists():
            print(f"Error: image {args.image} does not exist.")
            sys.exit(1)
        # Single image evaluation
        if ort is None:
            print("onnxruntime is not installed.")
            return
        input_tensor = preprocess(args.image)
        thresholds = {}
        if args.thresholds.exists():
            with open(args.thresholds, encoding="utf-8") as f:
                thresholds = json.load(f)
        print(f"\nEvaluating single photo: {args.image.name}")
        for m in MODELS:
            mf = args.models_dir / f"{m}.onnx"
            if not mf.exists():
                continue
            sess = ort.InferenceSession(str(mf), providers=["CPUExecutionProvider"])
            out = sess.run(None, {sess.get_inputs()[0].name: input_tensor})[0]
            val = float(out.flatten()[0])
            score = 1.0 / (1.0 + math.exp(-val)) if (val < -10 or val > 10) else val
            th = thresholds.get(m, {}).get("threshold", 0.50)
            flag = "CERTAIN" if score >= th else "UNCERTAIN" if score >= (th - 0.10) else "NEGATIVE"
            print(f"[{m}] Score: {score:.4f} (th={th:.2f}) -> {flag}")
    else:
        run_batch_evaluation(args.eval_dir, args.models_dir, args.thresholds)


if __name__ == "__main__":
    main()
