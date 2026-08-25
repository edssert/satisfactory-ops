"""어댑터 적용이 끝난 BLEND를 재질 변경 없이 투명 아이소메트릭/탑뷰 PNG로 렌더한다."""

import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
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

if technical:
    base_collection = bpy.data.collections.get("RuntimeTechnicalBase") or bpy.data.collections.new("RuntimeTechnicalBase")
    clearance_collection = bpy.data.collections.get("RuntimeClearanceOverlay")
    if clearance_collection is None:
        raise RuntimeError("RuntimeClearanceOverlay collection이 없습니다.")
    if base_collection.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(base_collection)
    for obj in meshes:
        target = clearance_collection if obj.get("technical_role") == "clearance" else base_collection
        if target not in obj.users_collection:
            target.objects.link(obj)
        for source_collection in list(obj.users_collection):
            if source_collection != target:
                source_collection.objects.unlink(obj)
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
scene.render.use_compositing = technical
if technical:
    base_layer = scene.view_layers.get("ViewLayer") or scene.view_layers[0]
    overlay_layer = scene.view_layers.get("ClearanceNoDepth") or scene.view_layers.new("ClearanceNoDepth")

    def layer_collection(layer, name):
        stack = [layer.layer_collection]
        while stack:
            candidate = stack.pop()
            if candidate.name == name:
                return candidate
            stack.extend(candidate.children)
        raise RuntimeError(f"view layer collection 누락: {name}")

    layer_collection(base_layer, clearance_collection.name).exclude = True
    layer_collection(overlay_layer, base_collection.name).exclude = True
    previous_compositor = bpy.data.node_groups.get("SatisfactoryOpsTechnicalComposite")
    if previous_compositor:
        bpy.data.node_groups.remove(previous_compositor)
    compositor = bpy.data.node_groups.new("SatisfactoryOpsTechnicalComposite", "CompositorNodeTree")
    scene.compositing_node_group = compositor
    nodes = compositor.nodes
    links = compositor.links
    nodes.clear()
    base_render = nodes.new("CompositorNodeRLayers")
    base_render.layer = base_layer.name
    overlay_render = nodes.new("CompositorNodeRLayers")
    overlay_render.layer = overlay_layer.name
    additive = nodes.new("ShaderNodeMixRGB")
    additive.blend_type = "ADD"
    additive.inputs[0].default_value = 1
    links.new(base_render.outputs["Image"], additive.inputs[1])
    links.new(overlay_render.outputs["Image"], additive.inputs[2])
    preserve_alpha = nodes.new("CompositorNodeSetAlpha")
    links.new(additive.outputs[0], preserve_alpha.inputs["Image"])
    alpha_union = nodes.new("ShaderNodeMath")
    alpha_union.operation = "MAXIMUM"
    links.new(base_render.outputs["Alpha"], alpha_union.inputs[0])
    links.new(overlay_render.outputs["Alpha"], alpha_union.inputs[1])
    links.new(alpha_union.outputs[0], preserve_alpha.inputs["Alpha"])
    compositor.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    composite = nodes.new("NodeGroupOutput")
    links.new(preserve_alpha.outputs["Image"], composite.inputs["Image"])
scene.view_settings.look = "Medium High Contrast"
scene.view_settings.exposure = 0.85
output.parent.mkdir(parents=True, exist_ok=True)
if technical:
    bpy.context.view_layer.update()
    projected_edges = []
    clearance_objects = [candidate for candidate in meshes if candidate.get("technical_role") == "clearance"]
    if not clearance_objects:
        raise RuntimeError("clearance mesh가 없습니다.")
    main_clearance = max(clearance_objects, key=lambda obj: (
        (obj.matrix_world @ Vector(obj.bound_box[6]) - obj.matrix_world @ Vector(obj.bound_box[0])).length
    ))
    for obj in [main_clearance]:
        local_corners = [Vector(corner) for corner in obj.bound_box]
        for start_index, start in enumerate(local_corners):
            for end_index in range(start_index + 1, len(local_corners)):
                end = local_corners[end_index]
                differing_axes = sum(abs(start[axis] - end[axis]) > 1e-6 for axis in range(3))
                if differing_axes != 1:
                    continue
                world_start = obj.matrix_world @ start
                world_end = obj.matrix_world @ end
                screen_start = world_to_camera_view(scene, camera, world_start)
                screen_end = world_to_camera_view(scene, camera, world_end)
                projected_edges.append({
                    "object": obj.name,
                    "start": [screen_start.x * resolution, (1 - screen_start.y) * resolution],
                    "end": [screen_end.x * resolution, (1 - screen_end.y) * resolution],
                })
    clearance_material = next((
        slot.material
        for obj in meshes if obj.get("technical_role") == "clearance"
        for slot in obj.material_slots if slot.material
    ), None)
    contract_path = output.with_suffix(".technical-contract.json")
    contract_path.write_text(json.dumps({
        "$schemaVersion": 1,
        "resolution": resolution,
        "mainClearance": main_clearance.name,
        "clearanceObjects": len(clearance_objects),
        "clearanceEdges": projected_edges,
        "depthTest": False,
        "blend": "ONE+ONE",
        "alpha": "MAXIMUM(base,clearance)",
        "runtimeCbuffer": json.loads(clearance_material.get("clearance_runtime_cbuffer", "{}")) if clearance_material else None,
        "gradientSampler": json.loads(clearance_material.get("clearance_gradient_sampler", "{}")) if clearance_material else None,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
bpy.ops.render.render(write_still=True)
print(f"ISOMETRIC={output}")
