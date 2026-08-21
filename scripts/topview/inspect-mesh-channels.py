"""Blender 메시의 재질 슬롯별 vertex color와 UV 범위를 JSON으로 출력한다.

사용: blender --background scene.blend --python scripts/topview/inspect-mesh-channels.py -- output.json
종료: 성공 0, 장면 또는 출력 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

from collections import Counter
import json
import sys
from pathlib import Path

import bpy


def quantize(color) -> str:
    channels = [max(0, min(255, round(float(value) * 255))) for value in color[:4]]
    return "#" + "".join(f"{channel:02x}" for channel in channels)


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 1:
    raise ValueError("출력 JSON 경로 하나가 필요합니다.")

objects = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or not obj.data.polygons:
        continue
    mesh = obj.data
    color_attribute = mesh.color_attributes.get("Color")
    slots = []
    for slot_index, slot in enumerate(obj.material_slots):
        loop_indices = [
            loop_index
            for polygon in mesh.polygons
            if polygon.material_index == slot_index
            for loop_index in polygon.loop_indices
        ]
        colors = Counter(
            quantize(color_attribute.data[index].color)
            for index in loop_indices
        ) if color_attribute and color_attribute.domain == "CORNER" else Counter()
        colors_srgb = Counter(
            quantize(color_attribute.data[index].color_srgb)
            for index in loop_indices
        ) if color_attribute and color_attribute.domain == "CORNER" and hasattr(color_attribute.data[0], "color_srgb") else Counter()
        uv_ranges = []
        for layer in mesh.uv_layers:
            coordinates = [layer.data[index].uv for index in loop_indices]
            clusters = Counter((round(float(uv[0]), 5), round(float(uv[1]), 5)) for uv in coordinates)
            uv_ranges.append({
                "name": layer.name,
                "minimum": [min(uv[0] for uv in coordinates), min(uv[1] for uv in coordinates)] if coordinates else None,
                "maximum": [max(uv[0] for uv in coordinates), max(uv[1] for uv in coordinates)] if coordinates else None,
                "distinctQuantizedValues": len(clusters),
                "clusters": [
                    {"uv": list(uv), "count": count}
                    for uv, count in clusters.most_common(24)
                ],
            })
        slots.append({
            "index": slot_index,
            "material": slot.material.name if slot.material else None,
            "loops": len(loop_indices),
            "colorClusters": [
                {"rgba": rgba, "count": count}
                for rgba, count in colors.most_common(24)
            ],
            "distinctQuantizedColors": len(colors),
            "colorSrgbClusters": [
                {"rgba": rgba, "count": count}
                for rgba, count in colors_srgb.most_common(24)
            ],
            "uvRanges": uv_ranges,
        })
    objects.append({"object": obj.name, "slots": slots})

output = Path(script_args[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({"blend": bpy.data.filepath, "objects": objects}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"OUTPUT={output}")
