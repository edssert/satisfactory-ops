#!/usr/bin/env python3
"""Anders 의미 자산 그룹을 기존 승인 크롭과 회전·크기 정규화 유사도로 대조한다.

사용:
  python scripts/match-anders-candidates.py <그룹 크롭 폴더> <승인 매니페스트.json> <public 폴더> <출력.json>

점수는 후보 축소용이며 클래스 확정값이 아니다. 0~1이고 1에 가까울수록 정규화 픽셀이 유사하다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


SIZE = 160


def normalize(image: Image.Image, rotation: int = 0) -> np.ndarray:
    rgba = image.convert("RGBA")
    if rotation:
        rgba = rgba.rotate(rotation, expand=True)
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    rgba.thumbnail((SIZE - 8, SIZE - 8), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(rgba, ((SIZE - rgba.width) // 2, (SIZE - rgba.height) // 2))
    array = np.asarray(canvas, dtype=np.float32) / 255.0
    array[..., :3] *= array[..., 3:4]
    return array


def similarity(left: np.ndarray, right: np.ndarray) -> float:
    alpha_error = np.mean(np.abs(left[..., 3] - right[..., 3]))
    color_error = np.mean(np.abs(left[..., :3] - right[..., :3]))
    return float(max(0.0, 1.0 - (alpha_error * 0.58 + color_error * 0.42)))


def main() -> int:
    if len(sys.argv) != 5:
        print("그룹 크롭 폴더, 매니페스트, public 폴더, 출력 JSON을 주세요.", file=sys.stderr)
        return 1

    group_dir = Path(sys.argv[1])
    manifest = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    public_dir = Path(sys.argv[3])
    output_path = Path(sys.argv[4])

    references: list[tuple[str, Path, np.ndarray]] = []
    for asset in manifest["assets"]:
        if asset["sourceId"] != "anders-2023" or asset["role"] not in {"building", "foundation"}:
            continue
        path = public_dir / asset["path"]
        references.append((asset["assetId"], path, normalize(Image.open(path))))

    results = []
    for path in sorted(group_dir.glob("*.png")):
        image = Image.open(path)
        matches = []
        for asset_id, reference_path, reference in references:
            rotated_scores = [similarity(normalize(image, rotation), reference) for rotation in (0, 90, 180, 270)]
            best_index = int(np.argmax(rotated_scores))
            matches.append({
                "assetId": asset_id,
                "score": round(rotated_scores[best_index], 5),
                "rotation": (0, 90, 180, 270)[best_index],
                "reference": reference_path.as_posix(),
            })
        matches.sort(key=lambda row: row["score"], reverse=True)
        results.append({"groupCrop": path.name, "matches": matches[:3]})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({
        "method": "premultiplied RGBA mean absolute error after alpha crop, contain resize and four rotations",
        "warning": "candidate narrowing only; do not promote without visual and game-class verification",
        "references": len(references),
        "groups": len(results),
        "results": results,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"references": len(references), "groups": len(results)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
