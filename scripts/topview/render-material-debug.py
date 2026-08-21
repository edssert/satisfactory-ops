"""장면 메시의 원래 재질 슬롯을 단색으로 치환해 특정 표면의 재질 소유자를 판별한다.

사용: blender --background scene.blend --python scripts/topview/render-material-debug.py -- output.png
종료: 성공 0, 인자/장면 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import bpy


def debug_color(name: str) -> tuple[float, float, float, float]:
    known = {
        "decalcolor_masked": (1.0, 0.08, 0.03, 1),
        "mi_smeltermk1_01": (0.05, 0.9, 0.15, 1),
        "decal_normal": (0.05, 0.25, 1.0, 1),
        "mi_vat_smelter": (0.95, 0.05, 0.8, 1),
        "mi_prodlight": (0.0, 0.9, 0.9, 1),
    }
    if name.casefold() in known:
        return known[name.casefold()]
    digest = hashlib.sha256(name.encode()).digest()
    return tuple(0.25 + channel / 510 for channel in digest[:3]) + (1,)


def material_for(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(f"Debug_{name}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = debug_color(name)
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 1:
    raise ValueError("출력 PNG 경로 하나가 필요합니다.")

replacements = {material.name: material_for(material.name) for material in list(bpy.data.materials)}
for obj in bpy.context.scene.objects:
    if obj.name == "TopViewAOGround" or obj.name.startswith("OccupancyCorner"):
        obj.hide_render = True
        continue
    if obj.type != "MESH":
        continue
    for slot in obj.material_slots:
        if slot.material:
            slot.material = replacements[slot.material.name]

scene = bpy.context.scene
scene.render.filepath = str(Path(script_args[0]).resolve())
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
bpy.ops.render.render(write_still=True)
print(f"OUTPUT={Path(scene.render.filepath).resolve()}")
