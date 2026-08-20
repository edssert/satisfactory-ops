#!/usr/bin/env python3
"""AndersPottemager 탑뷰 시트의 투명 픽셀 군집을 찾아 작도용 자산 후보를 표시한다.

사용: python scripts/analyze-topview-sheets.py <입력 폴더> <출력 폴더>
출력은 검토용 PNG와 JSON이며 원본을 수정하지 않는다. 자동 검출 결과는 사람이 게임 객체와
대조하기 전까지 제품 자산으로 승격하지 않는다.
"""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter


def components(mask: Image.Image) -> list[tuple[int, int, int, int, int]]:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    result: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] == 0:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[index] = 1
            left = right = x
            top = bottom = y
            area = 0
            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                left = min(left, current_x)
                right = max(right, current_x)
                top = min(top, current_y)
                bottom = max(bottom, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            result.append((left, top, right + 1, bottom + 1, area))
    return result


def analyze(source: Path, output: Path) -> dict[str, object]:
    image = Image.open(source).convert("RGBA")
    scale = 4
    small = image.getchannel("A").resize(
        (image.width // scale, image.height // scale), Image.Resampling.BOX
    )
    mask = small.point(lambda alpha: 255 if alpha >= 20 else 0)
    joined = mask.filter(ImageFilter.MaxFilter(11))
    groups = [entry for entry in components(joined) if entry[4] >= 180]
    groups.sort(key=lambda entry: (entry[1], entry[0]))

    preview = image.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGBA")
    overlay = Image.new("RGBA", preview.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.load_default(size=18)
    records = []
    for index, (left, top, right, bottom, area) in enumerate(groups, start=1):
        draw.rectangle((left, top, right, bottom), outline=(255, 158, 22, 255), width=2)
        draw.rectangle((left, top, left + 44, top + 22), fill=(15, 18, 23, 230))
        draw.text((left + 4, top + 2), f"{index:02d}", font=font, fill=(255, 255, 255, 255))
        records.append(
            {
                "id": index,
                "bboxPx": {
                    "x": left * scale,
                    "y": top * scale,
                    "width": (right - left) * scale,
                    "height": (bottom - top) * scale,
                },
                "joinedAreaAtQuarterScale": area,
            }
        )

    preview = Image.alpha_composite(preview, overlay)
    preview.save(output / f"{source.stem}-detected.png", optimize=True)
    return {"source": source.name, "width": image.width, "height": image.height, "candidates": records}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    sheets = sorted(args.source_directory.glob("*.png"))
    if not sheets:
        raise SystemExit("PNG 시트를 찾지 못했습니다.")
    result = {
        "schemaVersion": 1,
        "method": "alpha mask, quarter-scale dilation, connected components",
        "sheets": [analyze(sheet, args.output_directory) for sheet in sheets],
    }
    (args.output_directory / "candidates.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"sheetCount": len(sheets), "candidateCounts": {
        sheet["source"]: len(sheet["candidates"]) for sheet in result["sheets"]
    }}, ensure_ascii=False))


if __name__ == "__main__":
    main()

