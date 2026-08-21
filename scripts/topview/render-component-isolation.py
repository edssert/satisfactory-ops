"""완성 장면에서 지정 구성품만 원래 재질로 렌더해 가시성을 검사한다.

사용: blender --background scene.blend --python scripts/topview/render-component-isolation.py -- output.png <static|body|indicator>
종료: 성공 0, 인자/장면 오류는 Blender/Python 표준 비영 종료 코드.
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


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 2 or script_args[1] not in {"static", "body", "indicator"}:
    raise ValueError("출력 PNG와 static|body|indicator가 필요합니다.")

target = script_args[1]
visible_meshes = 0
for obj in bpy.context.scene.objects:
    if obj.name == "TopViewAOGround" or obj.name.startswith("OccupancyCorner"):
        obj.hide_render = True
        continue
    if obj.type != "MESH":
        continue
    ancestors = ancestor_names(obj)
    role = (
        "static" if "ComponentTransform0" in ancestors else
        "body" if "ComponentTransform1" in ancestors else
        "indicator" if "ProductionIndicatorPlacement" in ancestors else
        "other"
    )
    obj.hide_render = role != target
    visible_meshes += int(not obj.hide_render)

if visible_meshes == 0:
    raise RuntimeError(f"구성품 메시를 찾지 못했습니다: {target}")
scene = bpy.context.scene
scene.render.filepath = str(Path(script_args[0]).resolve())
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
bpy.ops.render.render(write_still=True)
print(f"ROLE={target} MESHES={visible_meshes} OUTPUT={Path(scene.render.filepath).resolve()}")
