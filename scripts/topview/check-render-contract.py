"""저장된 Blender 산출물이 수직 정사영·게임 하드 점유 코너 계약을 지키는지 검사한다.

사용:
  blender <scene.blend> --background --python scripts/topview/check-render-contract.py -- --scene <recipe.json>

종료:
  성공 0, 카메라·점유 코너 계약 위반은 예외로 비영 종료한다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", required=True)
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(raw)


def close(actual: float, expected: float, tolerance: float = 1e-6) -> bool:
    return abs(actual - expected) <= tolerance


args = parse_args()
recipe = json.loads(Path(args.scene).resolve().read_text(encoding="utf-8"))
footprint = recipe["footprint"]
camera = bpy.context.scene.camera
if camera is None or camera.data.type != "ORTHO":
    raise RuntimeError("활성 카메라가 ORTHO가 아닙니다.")
if recipe["camera"].get("projection") != "orthographic-top" or recipe["camera"].get("frontTiltDeg") != 0:
    raise RuntimeError("장면 레시피가 수직 orthographic-top 계약이 아닙니다.")
forward = (camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))).normalized()
if not (close(forward.x, 0) and close(forward.y, 0) and close(forward.z, -1)):
    raise RuntimeError(f"카메라 축이 월드 -Z가 아닙니다: {tuple(forward)}")

scene = bpy.context.scene
if scene.get("runtime_top_validated") is not True:
    raise RuntimeError("렌더러의 runtime_top_validated 증거가 없습니다.")
if scene.get("corner_envelope_contract") != "game-hard-clearance":
    raise RuntimeError(f"점유 코너 계약 오류: {scene.get('corner_envelope_contract')}")

stored = list(scene.get("hard_footprint_m", []))
expected_stored = [
    *footprint.get("centerM", [0, 0]),
    footprint["widthM"],
    footprint["lengthM"],
    footprint["heightM"],
]
if len(stored) != 5 or any(not close(float(a), float(b)) for a, b in zip(stored, expected_stored)):
    raise RuntimeError(f"저장된 하드 점유영역 불일치: {stored} != {expected_stored}")

source_bounds = list(scene.get("source_bounds", []))
if len(source_bounds) != 6:
    raise RuntimeError("source_bounds 증거가 없습니다.")
center_x, center_y = footprint.get("centerM", [0, 0])
width = footprint["widthM"]
depth = footprint["lengthM"]
ground_z = source_bounds[2]
height = footprint["heightM"]
projected = [
    camera.matrix_world.inverted() @ Vector((
        center_x + x_sign * width / 2,
        center_y + y_sign * depth / 2,
        ground_z + z_sign * height,
    ))
    for x_sign, y_sign in ((-1, -1), (1, -1), (1, 1), (-1, 1))
    for z_sign in (0, 1)
]
expected_corners = {
    (round(min(point.x for point in projected), 6), round(min(point.y for point in projected), 6)),
    (round(max(point.x for point in projected), 6), round(min(point.y for point in projected), 6)),
    (round(max(point.x for point in projected), 6), round(max(point.y for point in projected), 6)),
    (round(min(point.x for point in projected), 6), round(max(point.y for point in projected), 6)),
}
corner_objects = [
    obj for obj in scene.objects
    if obj.name.startswith("OccupancyCorner") and obj.type == "CURVE"
]
if len(corner_objects) != 4:
    raise RuntimeError(f"점유 코너 수가 4개가 아닙니다: {len(corner_objects)}")
actual_corners = {
    (round(obj.data.splines[0].points[1].co.x, 6), round(obj.data.splines[0].points[1].co.y, 6))
    for obj in corner_objects
}
if actual_corners != expected_corners:
    raise RuntimeError(f"점유 코너가 게임 하드 박스와 다릅니다: {actual_corners} != {expected_corners}")

expected_frame = [
    0.5 + min(point.x for point in projected) / camera.data.ortho_scale,
    0.5 - max(point.y for point in projected) / camera.data.ortho_scale,
    (max(point.x for point in projected) - min(point.x for point in projected)) / camera.data.ortho_scale,
    (max(point.y for point in projected) - min(point.y for point in projected)) / camera.data.ortho_scale,
]
stored_frame = list(scene.get("hard_footprint_frame_normalized", []))
if len(stored_frame) != 4 or any(not close(float(a), float(b)) for a, b in zip(stored_frame, expected_frame)):
    raise RuntimeError(f"정규화 점유 프레임 불일치: {stored_frame} != {expected_frame}")

print(
    "PASS runtime-top-contract "
    f"camera=ORTHO/-Z footprint={width:g}x{depth:g}x{height:g}m corners=game-hard-clearance"
)
print("OCCUPANCY_FRAME_NORMALIZED=" + ",".join(f"{value:.12f}" for value in expected_frame))
