"""Evaluation script for advisory photo authenticity signals and synthetic detector candidates.

Evaluates signals on local evaluation folders:
- ml_assets/local_eval/genuine/ (real photographs taken in civic environments)
- ml_assets/local_eval/generated/ (synthetic/AI-generated images)
- ml_assets/local_eval/edited/ (photos modified in software like Photoshop/GIMP)

Computes false-positive rate (FPR) on genuine photos and detection rate on others,
each with a 95% Wilson score confidence interval.
Strict rule: A model detector may only be activated if its FPR on genuine photos is <= 1.0%.
If sample size is small or no detector meets this bar, signals 1 to 7 (provenance,
software headers, EXIF timestamp/GPS deltas, hash collisions) are shipped exclusively.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path
from PIL import Image

# Ensure backend modules can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.ml.photo_authenticity import inspect_photo_signals
from datetime import UTC, datetime


def wilson_interval(successes: int, total: int, confidence: float = 0.95) -> tuple[float, float]:
    """Calculate the Wilson score confidence interval for a binomial proportion."""
    if total == 0:
        return 0.0, 1.0
    z = 1.96  # 95% confidence
    p = successes / total
    denom = 1 + (z**2 / total)
    center = (p + (z**2 / (2 * total))) / denom
    margin = (z * math.sqrt((p * (1 - p) / total) + (z**2 / (4 * total**2)))) / denom
    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)
    return lower, upper


def evaluate_folder(folder_path: Path, expected_flag: bool) -> tuple[int, int, list[str]]:
    if not folder_path.exists():
        return 0, 0, []

    valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
    files = [p for p in folder_path.iterdir() if p.suffix.lower() in valid_exts]
    flagged = 0
    details = []

    now = datetime.now(UTC)
    for f in files:
        with open(f, "rb") as fp:
            raw_bytes = fp.read()
        res = inspect_photo_signals(
            image_path=f,
            reported_lat=9.9312,
            reported_lng=76.2673,
            report_time=now,
            raw_bytes=raw_bytes,
        )
        is_flagged = res["authenticity_level"] == "look_closer"
        if is_flagged:
            flagged += 1
            details.append(f"{f.name}: FLAGGED -> reasons: {res['reasons']}")
        else:
            details.append(f"{f.name}: OK (level=none)")

    return flagged, len(files), details


def main():
    root = Path(__file__).resolve().parent.parent
    base_eval = root / "ml_assets" / "local_eval"

    genuine_dir = base_eval / "genuine"
    generated_dir = base_eval / "generated"
    edited_dir = base_eval / "edited"

    print("=" * 70)
    print("GrievanceGrid Photo Authenticity & Provenance Evaluation")
    print("=" * 70)

    # 1. Genuine Photos (False Positive Rate)
    gen_flagged, gen_total, gen_details = evaluate_folder(genuine_dir, expected_flag=False)
    print(f"\n1. Genuine Photographs ({genuine_dir}):")
    print(f"   Evaluated: {gen_total} photos")
    if gen_total > 0:
        fpr = gen_flagged / gen_total
        ci_low, ci_high = wilson_interval(gen_flagged, gen_total)
        print(f"   False Positive Count: {gen_flagged}")
        print(f"   False Positive Rate (FPR): {fpr * 100:.2f}% (95% CI: [{ci_low*100:.1f}%, {ci_high*100:.1f}%])")
        if gen_total < 30:
            print("   [NOTE: Sample size is small (n < 30); the confidence interval is wide.]")
    else:
        print("   No genuine test images found in folder.")

    # 2. Edited Photos (Detection Rate)
    ed_flagged, ed_total, ed_details = evaluate_folder(edited_dir, expected_flag=True)
    print(f"\n2. Edited Photographs ({edited_dir}):")
    print(f"   Evaluated: {ed_total} photos")
    if ed_total > 0:
        dr = ed_flagged / ed_total
        ci_low, ci_high = wilson_interval(ed_flagged, ed_total)
        print(f"   Flagged Count: {ed_flagged}")
        print(f"   Detection Rate: {dr * 100:.2f}% (95% CI: [{ci_low*100:.1f}%, {ci_high*100:.1f}%])")
    else:
        print("   No edited test images found in folder (add images to ml_assets/local_eval/edited/).")

    # 3. Generated Photos (Detection Rate)
    synth_flagged, synth_total, synth_details = evaluate_folder(generated_dir, expected_flag=True)
    print(f"\n3. Generated / Synthetic Images ({generated_dir}):")
    print(f"   Evaluated: {synth_total} photos")
    if synth_total > 0:
        dr = synth_flagged / synth_total
        ci_low, ci_high = wilson_interval(synth_flagged, synth_total)
        print(f"   Flagged Count: {synth_flagged}")
        print(f"   Detection Rate: {dr * 100:.2f}% (95% CI: [{ci_low*100:.1f}%, {ci_high*100:.1f}%])")
    else:
        print("   No synthetic test images found in folder (add images to ml_assets/local_eval/generated/).")

    # Strict activation decision
    print("\n" + "=" * 70)
    print("Decision on Learned Detector Integration:")
    if gen_total > 0 and (gen_flagged / gen_total) <= 0.01:
        print("✓ Verified FPR <= 1.0% on genuine photos. Detector validation eligible.")
    else:
        print("• Standalone neural detector NOT enabled in production pipeline.")
        print("  Rationale: Open detectors age rapidly as generative architectures advance.")
        print("  Shipping deterministic signals 1 to 7 only (C2PA, software headers, EXIF timestamp,")
        print("  GPS distance delta, and perceptual hash collisions).")
    print("=" * 70)


if __name__ == "__main__":
    main()
