"""완성 렌더 장면을 구성품별 단색으로 바꿔 메시 누락과 재질 결함을 분리한다.

사용: blender --background scene.blend --python scripts/topview/render-component-debug.py -- output.png
종료: 성공 0, 장면 또는 출력 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


def ancestor_names(obj: bpy.types.Object) -> set[str]:
    result = {obj.name}
    parent = obj.parent
    while parent:
        result.add(parent.name)
        parent = parent.parent
    return result


def diagnostic_material(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = 1.0
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 1:
    raise ValueError("출력 PNG 경로 하나가 필요합니다.")

palette = {
    "static": diagnostic_material("DebugStaticFrame", (0.95, 0.18, 0.06, 1)),
    "proxy": diagnostic_material("DebugAnimatedProxy", (0.05, 0.8, 0.22, 1)),
    "indicator": diagnostic_material("DebugProductionIndicator", (0.05, 0.4, 1.0, 1)),
    "unknown": diagnostic_material("DebugUnknown", (0.75, 0.15, 0.95, 1)),
}

for obj in bpy.context.scene.objects:
    if obj.name == "TopViewAOGround" or obj.name.startswith("OccupancyCorner"):
        obj.hide_render = True
        continue
    if obj.type != "MESH":
        continue
    ancestors = ancestor_names(obj)
    if "ComponentTransform0" in ancestors:
        role = "static"
    elif "ComponentTransform1" in ancestors:
        role = "proxy"
    elif "ProductionIndicatorPlacement" in ancestors:
        role = "indicator"
    else:
        role = "unknown"
    obj.data.materials.clear()
    obj.data.materials.append(palette[role])

scene = bpy.context.scene
scene.render.filepath = str(Path(script_args[0]).resolve())
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
bpy.ops.render.render(write_still=True)
print(f"OUTPUT={Path(scene.render.filepath).resolve()}")
