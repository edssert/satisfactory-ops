"""아이소메트릭 Blender 장면에서 토대 상판 재질의 옆면 오염을 검사한다.

사용: blender <scene.blend> --background --python audit-isometric-scene.py
종료: 0 계약 통과, 1 상판 재질이 실제 상단 높이 밖에 배정됨, 2 검사 대상 없음.
"""

import json
import sys
from pathlib import Path

import bpy


top_material_name = "MI_Foundation_FicsitSet_01_DefaultTop"
targets = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    top_indices = {
        index
        for index, slot in enumerate(obj.material_slots)
        if slot.material and slot.material.name.startswith(top_material_name)
    }
    if top_indices:
        targets.append((obj, top_indices))

if not targets:
    print(json.dumps({"status": "missing", "material": top_material_name}, ensure_ascii=False))
    raise RuntimeError("audit-isometric-scene 입력이 부족합니다")

violations = []
assigned = 0
alignment = None
for obj, top_indices in targets:
    maximum_z = max((obj.matrix_world @ vertex.co).z for vertex in obj.data.vertices)
    minimum_allowed_z = maximum_z - 0.085
    for polygon in obj.data.polygons:
        if polygon.material_index not in top_indices:
            continue
        assigned += 1
        center_z = (obj.matrix_world @ polygon.center).z
        if center_z < minimum_allowed_z:
            violations.append({
                "object": obj.name,
                "polygon": polygon.index,
                "centerZ": round(center_z, 5),
                "maximumZ": round(maximum_z, 5),
            })

side_contamination = len(violations)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
contract_arg = next((arg for arg in args if arg.startswith("--contract=")), None)
if contract_arg:
    contract = json.loads(Path(contract_arg.split("=", 1)[1]).resolve().read_text(encoding="utf-8"))
    clearance_minimum = contract["clearance"]["minimum"]
    clearance_maximum = contract["clearance"]["maximum"]
    expected = [(clearance_minimum[index] + clearance_maximum[index]) / 2 for index in (0, 1)]
    obj = targets[0][0]
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    actual = [(min(point[index] for point in points) + max(point[index] for point in points)) / 2 for index in (0, 1)]
    deviation = max(abs(actual[index] - expected[index]) for index in (0, 1))
    alignment = {"expectedCenter": expected, "actualCenter": [round(value, 5) for value in actual], "maxDeviationM": round(deviation, 6)}
    if deviation > 0.001:
        violations.append({"object": obj.name, "clearanceAlignmentDeviationM": round(deviation, 6)})

result = {
    "status": "fail" if violations else "pass",
    "material": top_material_name,
    "assignedPolygons": assigned,
    "sideContamination": side_contamination,
    "clearanceAlignment": alignment,
    "sample": violations[:8],
}
print(json.dumps(result, ensure_ascii=False))
if violations:
    raise RuntimeError(f"Isometric scene audit failed: {', '.join(violations)}")
