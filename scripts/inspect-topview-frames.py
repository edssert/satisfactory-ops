#!/usr/bin/env python3
"""Anders 탑뷰 안의 흰 설치 범위 코너 후보를 픽셀 군집으로 출력한다.

사용: python scripts/inspect-topview-frames.py public/assets/topview
제품 좌표를 자동 확정하지 않으며, 사람이 프리뷰와 대조할 후보만 stdout JSON으로 낸다.
"""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image


def components(mask: list[bool], width: int, height: int) -> list[dict[str, int]]:
    visited = bytearray(width * height)
    result: list[dict[str, int]] = []
    for start in range(width * height):
        if visited[start] or not mask[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        left = right = start % width
        top = bottom = start // width
        area = 0
        while queue:
            index = queue.popleft()
            x, y = index % width, index // width
            area += 1
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                ni = ny * width + nx
                if not visited[ni] and mask[ni]:
                    visited[ni] = 1
                    queue.append(ni)
        if area >= 8:
            result.append({"x": left, "y": top, "width": right - left + 1, "height": bottom - top + 1, "area": area})
    return result


def inspect(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    pixels = list(image.getdata())
    mask = [a >= 120 and min(r, g, b) >= 145 and max(r, g, b) - min(r, g, b) <= 42 for r, g, b, a in pixels]
    groups = components(mask, image.width, image.height)
    groups = [group for group in groups if max(group["width"], group["height"]) >= 8]
    groups.sort(key=lambda group: (-group["area"], group["y"], group["x"]))
    return {"file": path.name, "width": image.width, "height": image.height, "candidates": groups[:40]}


root = Path(sys.argv[1] if len(sys.argv) > 1 else "public/assets/topview")
print(json.dumps([inspect(path) for path in sorted(root.glob("*.webp"))], ensure_ascii=False, indent=2))
