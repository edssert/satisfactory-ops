"""메시의 재질 슬롯별 연결 성분과 월드 경계를 JSON으로 출력한다.

사용: blender --background scene.blend --python scripts/topview/inspect-material-components.py -- output.json
종료: 성공 0, 인자/장면 오류는 Blender/Python 표준 비영 종료 코드.
"""

from __future__ import annotations

from collections import defaultdict, deque
import json
import sys
from pathlib import Path

import bpy


script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(script_args) != 1:
    raise ValueError("출력 JSON 경로 하나가 필요합니다.")

rows = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or not obj.data.polygons:
        continue
    mesh = obj.data
    vertex_to_polygons = defaultdict(set)
    for polygon in mesh.polygons:
        for vertex in polygon.vertices:
            vertex_to_polygons[vertex].add(polygon.index)
    for slot_index, slot in enumerate(obj.material_slots):
        pending = {polygon.index for polygon in mesh.polygons if polygon.material_index == slot_index}
        component_index = 0
        while pending:
            seed = pending.pop()
            component = {seed}
            queue = deque([seed])
            while queue:
                polygon = mesh.polygons[queue.popleft()]
                neighbours = set().union(*(vertex_to_polygons[vertex] for vertex in polygon.vertices)) & pending
                for neighbour in neighbours:
                    if mesh.polygons[neighbour].material_index != slot_index:
                        continue
                    pending.remove(neighbour)
                    component.add(neighbour)
                    queue.append(neighbour)
            vertices = {
                vertex
                for polygon_index in component
                for vertex in mesh.polygons[polygon_index].vertices
            }
            points = [obj.matrix_world @ mesh.vertices[index].co for index in vertices]
            minimum = [min(point[axis] for point in points) for axis in range(3)]
            maximum = [max(point[axis] for point in points) for axis in range(3)]
            rows.append({
                "object": obj.name,
                "material": slot.material.name if slot.material else None,
                "component": component_index,
                "polygons": len(component),
                "vertices": len(vertices),
                "minimum": minimum,
                "maximum": maximum,
                "size": [maximum[axis] - minimum[axis] for axis in range(3)],
                "center": [(minimum[axis] + maximum[axis]) / 2 for axis in range(3)],
            })
            component_index += 1

output = Path(script_args[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"OUTPUT={output} COMPONENTS={len(rows)}")
