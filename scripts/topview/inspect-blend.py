"""Blender 장면의 객체·재질·경계를 JSON으로 출력한다.

사용: blender --background scene.blend --python scripts/topview/inspect-blend.py -- output.json
종료: 성공 0, 장면 또는 출력 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def object_bounds(obj: bpy.types.Object) -> dict[str, list[float]] | None:
    if obj.type != "MESH" or not obj.bound_box:
        return None
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    return {
        "minimum": minimum,
        "maximum": maximum,
        "size": [maximum[index] - minimum[index] for index in range(3)],
    }


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 1:
    raise ValueError("출력 JSON 경로 하나가 필요합니다.")

result = {
    "blend": bpy.data.filepath,
    "objects": [
        {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "location": list(obj.location),
            "rotationEuler": list(obj.rotation_euler),
            "scale": list(obj.scale),
            "bounds": object_bounds(obj),
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "mesh": {
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "uvLayers": [layer.name for layer in obj.data.uv_layers],
                "colorAttributes": [
                    { "name": attribute.name, "domain": attribute.domain, "dataType": attribute.data_type }
                    for attribute in obj.data.color_attributes
                ],
                "attributes": [
                    { "name": attribute.name, "domain": attribute.domain, "dataType": attribute.data_type }
                    for attribute in obj.data.attributes
                ],
            } if obj.type == "MESH" else None,
        }
        for obj in bpy.context.scene.objects
    ],
    "materials": [
        {
            "name": material.name,
            "useNodes": material.use_nodes,
            "nodeTypes": sorted(node.bl_idname for node in material.node_tree.nodes) if material.use_nodes else [],
        }
        for material in bpy.data.materials
    ],
    "nodeGroups": [
        {
            "name": group.name,
            "nodes": sorted(node.bl_idname for node in group.nodes),
            "inputs": [item.name for item in group.interface.items_tree if getattr(item, "in_out", None) == "INPUT"],
            "outputs": [item.name for item in group.interface.items_tree if getattr(item, "in_out", None) == "OUTPUT"],
        }
        for group in bpy.data.node_groups
    ],
}

output = Path(script_args[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"OUTPUT={output}")
