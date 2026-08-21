"""Blender가 읽는 HDR/PNG 텍스처의 크기·채널 범위를 JSON으로 출력한다.

사용: blender --background --python scripts/topview/inspect-image.py -- output.json image...
종료: 성공 0, 입력/출력 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) < 2:
    raise ValueError("출력 JSON과 이미지 경로가 필요합니다.")

rows = []
for raw_path in script_args[1:]:
    path = Path(raw_path).resolve()
    image = bpy.data.images.load(str(path), check_existing=False)
    channels = image.channels
    minima = [float("inf")] * channels
    maxima = [float("-inf")] * channels
    sums = [0.0] * channels
    pixels = list(image.pixels)
    pixel_count = len(pixels) // channels
    for pixel_index in range(pixel_count):
        for channel in range(channels):
            value = pixels[pixel_index * channels + channel]
            minima[channel] = min(minima[channel], value)
            maxima[channel] = max(maxima[channel], value)
            sums[channel] += value
    rows.append({
        "path": str(path),
        "width": image.size[0],
        "height": image.size[1],
        "channels": channels,
        "isFloat": image.is_float,
        "colorspace": image.colorspace_settings.name,
        "minimum": minima,
        "maximum": maxima,
        "mean": [value / pixel_count for value in sums],
        "pixels": [
            pixels[index * channels:(index + 1) * channels]
            for index in range(pixel_count)
        ] if pixel_count <= 256 else None,
    })

output = Path(script_args[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"OUTPUT={output}")
