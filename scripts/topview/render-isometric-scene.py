"""어댑터 적용이 끝난 BLEND를 재질 변경 없이 투명 아이소메트릭/탑뷰 PNG로 렌더한다."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not args:
    raise ValueError("출력 PNG가 필요합니다.")
output = Path(args[0]).resolve()
resolution = int(args[1]) if len(args) > 1 else 1024
technical = "--technical" in args
top_view = "--top" in args
orthographic = "--orthographic" in args
hide_ports = "--hide-ports" in args
hide_technical = "--hide-technical" in args
hide_foundation = "--hide-foundation" in args
azimuth = float(next((arg.split("=", 1)[1] for arg in args if arg.startswith("--azimuth=")), "135"))
elevation = float(next((arg.split("=", 1)[1] for arg in args if arg.startswith("--elevation=")), "45"))
frame_scale = float(next((arg.split("=", 1)[1] for arg in args if arg.startswith("--frame=")), "1.00"))
foundation_to_hide = []
for obj in bpy.context.scene.objects:
    if obj.name.startswith("Occupancy"):
        obj.hide_render = True
    if hide_ports and obj.get("port_id"):
        obj.hide_render = True
    if hide_technical and (obj.get("runtime_technical_id") or obj.get("runtime_clearance_parent_id")):
        obj.hide_render = True
    if hide_foundation and obj.get("runtime_foundation_source"):
        foundation_to_hide.append(obj)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.hide_render]
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
for obj in foundation_to_hide:
    obj.hide_render = True
minimum = Vector(tuple(min(point[index] for point in points) for index in range(3)))
maximum = Vector(tuple(max(point[index] for point in points) for index in range(3)))
center = (minimum + maximum) / 2
radius = (maximum - minimum).length / 2
for obj in list(bpy.context.scene.objects):
    if obj.type in {"LIGHT", "CAMERA"}:
        bpy.data.objects.remove(obj, do_unlink=True)
camera_data = bpy.data.cameras.new("IsometricCamera")
camera = bpy.data.objects.new("IsometricCamera", camera_data)
if top_view:
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(maximum.x - minimum.x, maximum.y - minimum.y) * frame_scale
    camera.location = center + Vector((0, 0, max(radius * 3, 10)))
    camera.rotation_euler = (0, 0, 0)
else:
    direction = Vector((math.cos(math.radians(elevation)) * math.cos(math.radians(azimuth)), math.cos(math.radians(elevation)) * math.sin(math.radians(azimuth)), math.sin(math.radians(elevation))))
    camera.location = center + direction * max(radius * 3, 10)
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    if orthographic:
        camera_data.type = "ORTHO"
        rotation = camera.rotation_euler.to_quaternion()
        right = rotation @ Vector((1, 0, 0))
        up = rotation @ Vector((0, 1, 0))
        projected_x = [(point - center).dot(right) for point in points]
        projected_y = [(point - center).dot(up) for point in points]
        camera_data.ortho_scale = max(max(projected_x) - min(projected_x), max(projected_y) - min(projected_y)) * frame_scale
    else:
        camera_data.type = "PERSP"
        camera_data.lens = 78
        vertical_fov = 2 * math.atan((camera_data.sensor_width / 2) / camera_data.lens)
        camera.location = center + direction * (radius / math.sin(vertical_fov / 2) * frame_scale)
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.shift_y = -0.035
bpy.context.scene.collection.objects.link(camera)
bpy.context.scene.camera = camera


def area(name, offset, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = center + Vector(offset)
    obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)


area("Key", (-11, 11, 18), 1500, 8)
area("Fill", (12, -9, 10), 760, 12)
area("Rim", (8, 11, 15), 620, 8)
scene = bpy.context.scene
world = scene.world or bpy.data.worlds.new("IsometricWorld")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.38, 0.43, 0.49, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = resolution
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.render.filepath = str(output)
scene.render.use_compositing = False
scene.view_settings.look = "Medium High Contrast"
scene.view_settings.exposure = 0.85
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)
print(f"ISOMETRIC={output}")
