"""Blender 재질 노드와 링크를 JSON으로 출력한다.

사용: blender --background scene.blend --python scripts/topview/inspect-material-nodes.py -- output.json
종료: 성공 0, 장면 또는 출력 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


def socket_value(socket):
    if not hasattr(socket, "default_value"):
        return None
    value = socket.default_value
    if isinstance(value, (int, float, str, bool)):
        return value
    try:
        return list(value)
    except TypeError:
        return str(value)


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 1:
    raise ValueError("출력 JSON 경로 하나가 필요합니다.")

materials = []
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    tree = material.node_tree
    materials.append({
        "name": material.name,
        "nodes": [
            {
                "name": node.name,
                "label": node.label,
                "type": node.bl_idname,
                "operation": getattr(node, "operation", None),
                "blendType": getattr(node, "blend_type", None),
                "image": node.image.filepath if getattr(node, "image", None) else None,
                "inputs": [
                    {"name": socket.name, "default": socket_value(socket), "linked": socket.is_linked}
                    for socket in node.inputs
                ],
            }
            for node in tree.nodes
        ],
        "links": [
            {
                "fromNode": link.from_node.name,
                "fromSocket": link.from_socket.name,
                "toNode": link.to_node.name,
                "toSocket": link.to_socket.name,
            }
            for link in tree.links
        ],
    })

output = Path(script_args[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(materials, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"OUTPUT={output}")
