"""현재 Blender 장면에 adapter BLEND의 메시 객체를 append하고 저장한다."""

import sys
from pathlib import Path

import bpy


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) < 2:
    raise ValueError("출력 BLEND와 append할 BLEND가 필요합니다.")
output = Path(args[0]).resolve()
for blend_argument in args[1:]:
    blend = Path(blend_argument).resolve()
    with bpy.data.libraries.load(str(blend), link=False) as (source, target):
        target.objects = [name for name in source.objects if name]
    for obj in target.objects:
        if obj is not None and obj.type == "MESH":
            bpy.context.scene.collection.objects.link(obj)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print(f"MERGED_BLEND={output}")
