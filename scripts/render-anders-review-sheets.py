#!/usr/bin/env python3
"""Anders 연결 성분을 의미 자산 그룹으로 합쳐 검토 시트와 개별 크롭을 만든다.

사용:
  python scripts/render-anders-review-sheets.py <원본 시트 폴더> <후보 카탈로그.json> <출력 폴더>

원본과 카탈로그는 수정하지 않는다. 출력은 검토용이며 런타임 자산이 아니다.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def union_box(boxes: list[dict[str, int]]) -> tuple[int, int, int, int]:
    left = min(box["x"] for box in boxes)
    top = min(box["y"] for box in boxes)
    right = max(box["x"] + box["width"] for box in boxes)
    bottom = max(box["y"] + box["height"] for box in boxes)
    return left, top, right, bottom


def main() -> int:
    if len(sys.argv) != 4:
        print("원본 시트 폴더, 후보 카탈로그, 출력 폴더를 주세요.", file=sys.stderr)
        return 1

    source_dir = Path(sys.argv[1])
    catalog_path = Path(sys.argv[2])
    output_dir = Path(sys.argv[3])
    crop_dir = output_dir / "groups"
    output_dir.mkdir(parents=True, exist_ok=True)
    crop_dir.mkdir(parents=True, exist_ok=True)

    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    components = {row["id"]: row for row in catalog["components"]}
    groups_by_sheet: dict[str, list[dict[str, object]]] = defaultdict(list)
    for group in catalog["groups"]:
        groups_by_sheet[group["sheet"]].append(group)

    font = ImageFont.load_default(size=14)
    for sheet_name, groups in groups_by_sheet.items():
        source = Image.open(source_dir / sheet_name).convert("RGBA")
        scale = 0.25
        preview = source.resize((int(source.width * scale), int(source.height * scale)), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(preview)

        for group in sorted(groups, key=lambda row: int(str(row["primaryComponentId"]).split("#")[-1])):
            rows = [components[component_id] for component_id in group["componentIds"]]
            box = union_box([row["detectedBoxPx"] for row in rows])
            left, top, right, bottom = box
            scaled = tuple(round(value * scale) for value in box)
            draw.rectangle(scaled, outline=(255, 145, 0, 255), width=2)
            number = str(group["primaryComponentId"]).split("#")[-1]
            label_box = draw.textbbox((0, 0), number, font=font)
            label_width = label_box[2] - label_box[0] + 10
            label_height = label_box[3] - label_box[1] + 7
            x, y = scaled[0], scaled[1]
            draw.rectangle((x, y, x + label_width, y + label_height), fill=(20, 23, 27, 235))
            draw.text((x + 5, y + 2), number, fill=(245, 247, 250, 255), font=font)

            padding = 16
            crop = source.crop((
                max(0, left - padding),
                max(0, top - padding),
                min(source.width, right + padding),
                min(source.height, bottom + padding),
            ))
            safe_sheet = Path(sheet_name).stem.replace(" ", "-")
            crop.save(crop_dir / f"{safe_sheet}__{int(number):02d}.png", optimize=True)

        preview.save(output_dir / f"{Path(sheet_name).stem}-groups.png", optimize=True)

    print(json.dumps({
        "sheets": len(groups_by_sheet),
        "groups": len(catalog["groups"]),
        "detectedComponents": len(catalog["components"]),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
