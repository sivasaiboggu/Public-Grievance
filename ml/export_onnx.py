"""Export trained PyTorch EfficientNet-B0 classifiers to ONNX format."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn

try:
    import torchvision.models as models
except ImportError:
    models = None

MODELS = [
    "pothole_road_damage",
    "garbage_dumping",
    "road_waterlogging",
    "manhole_defect",
]


class BinaryClassifier(nn.Module):
    """Standard EfficientNet-B0 binary head matching training scripts."""

    def __init__(self):
        super().__init__()
        if models is None:
            raise RuntimeError("torchvision is required for ONNX export.")
        self.backbone = models.efficientnet_b0(weights=None)
        in_features = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.2, inplace=True),
            nn.Linear(in_features, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.backbone(x)
        return torch.sigmoid(out)


def export_model(checkpoint_path: Path, output_onnx_path: Path):
    print(f"Exporting {checkpoint_path} -> {output_onnx_path}...")
    model = BinaryClassifier()

    if checkpoint_path.exists():
        state_dict = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        # Handle state dict with or without module. prefix
        cleaned_state = {}
        for k, v in state_dict.items():
            k_clean = k.replace("module.", "")
            cleaned_state[k_clean] = v
        try:
            model.load_state_dict(cleaned_state)
            print(f"Loaded weights from {checkpoint_path}")
        except Exception as e:
            print(f"Warning: strict load failed ({e}), loading with strict=False")
            model.load_state_dict(cleaned_state, strict=False)
    else:
        print(f"Notice: Checkpoint {checkpoint_path} not found. Exporting initialized architecture stub.")

    model.eval()
    dummy_input = torch.randn(1, 3, 224, 224, dtype=torch.float32)

    output_onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy_input,
        str(output_onnx_path),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    )
    print(f"Exported successfully to {output_onnx_path}")


def main():
    parser = argparse.ArgumentParser(description="Export PyTorch models to ONNX")
    parser.add_argument(
        "--checkpoints-dir",
        type=Path,
        default=Path("ml_assets/checkpoints/efficientnet_b0"),
        help="Path to checkpoints folder",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("ml_assets/models"),
        help="Path to output ONNX models folder",
    )
    args = parser.parse_args()

    for m in MODELS:
        ckpt = args.checkpoints_dir / m / "best_model.pt"
        out_onnx = args.output_dir / f"{m}.onnx"
        try:
            export_model(ckpt, out_onnx)
        except Exception as exc:
            print(f"Error exporting {m}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
