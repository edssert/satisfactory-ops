"""승인 전 단일 설비 도감 아이소메트릭 후보를 렌더한다.

사용: blender <assembled.blend> --background --python render-isometric-preview.py -- <output.png>
이 스크립트는 후보 비교용이며 승인 전 제품 매니페스트를 수정하지 않는다.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def mesh_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def area_light(name, location, energy, size, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    light.location = location
    light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(light)


def image_node(nodes, path, non_color=False):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def add_foundation(repository_root, machine_minimum, machine_center):
    export_root = repository_root / ".cache/topview/isometric/foundation-export/FactoryGame/Content/FactoryGame/Buildable/Building/Foundation/FicsitSet"
    glb = export_root / "SM_Foundation_FicsitSet_8x1_01.glb"
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(glb), import_shading="NORMALS")
    imported = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH"]
    foundation_minimum, foundation_maximum = mesh_bounds(imported)
    offset = Vector((
        machine_center.x - (foundation_minimum.x + foundation_maximum.x) / 2,
        machine_center.y - (foundation_minimum.y + foundation_maximum.y) / 2,
        machine_minimum.z - foundation_maximum.z,
    ))
    for obj in imported:
        obj.location += offset

    material = next((slot.material for obj in imported for slot in obj.material_slots if slot.material), None)
    if material is None:
        raise RuntimeError("FICSIT 토대 재질 슬롯이 없습니다.")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output_node = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    texture_root = export_root / "Textures"
    albedo = image_node(nodes, texture_root / "TX_Ficsit_Foundation_01_BC.png")
    ao = image_node(nodes, texture_root / "TX_Ficsit_Foundation_01_AOMasks.png", True)
    reflection = image_node(nodes, texture_root / "TX_Ficsit_Foundation_01_Relf.png", True)
    normal = image_node(nodes, texture_root / "TX_Ficsit_Foundation_01_N.png", True)
    ao_channels = nodes.new("ShaderNodeSeparateColor")
    reflection_channels = nodes.new("ShaderNodeSeparateColor")
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(ao.outputs["Color"], ao_channels.inputs["Color"])
    links.new(albedo.outputs["Color"], multiply.inputs[1])
    links.new(ao_channels.outputs["Red"], multiply.inputs[2])
    links.new(multiply.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(reflection.outputs["Color"], reflection_channels.inputs["Color"])
    links.new(reflection_channels.outputs["Red"], bsdf.inputs["Metallic"])
    links.new(reflection_channels.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return imported


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
positional = [arg for arg in args if not arg.startswith("--")]
foundation_only = "--foundation-only" in args
resolution_arg = next((arg for arg in args if arg.startswith("--resolution=")), "--resolution=1024")
resolution = int(resolution_arg.split("=", 1)[1])
if len(positional) != 1:
    raise ValueError("출력 PNG 경로 하나가 필요합니다.")

output = Path(positional[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
repository_root = Path(__file__).resolve().parents[2]
scene = bpy.context.scene
meshes = [obj for obj in scene.objects if obj.type == "MESH" and not obj.name.startswith("Occupancy")]
minimum, maximum = mesh_bounds(meshes)
center = (minimum + maximum) / 2
foundation_meshes = add_foundation(repository_root, minimum, center)
if foundation_only:
    for obj in meshes:
        obj.hide_render = True
    meshes = foundation_meshes
else:
    meshes.extend(foundation_meshes)
minimum, maximum = mesh_bounds(meshes)
center = (minimum + maximum) / 2
size = maximum - minimum
radius = size.length / 2

for obj in list(scene.objects):
    if obj.type == "LIGHT":
        bpy.data.objects.remove(obj, do_unlink=True)

# 인게임 표시등의 렌즈는 남기되 외곽을 형광색으로 물들이는 과발광은 제한한다.
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if "prodlight" in material.name.lower() and node.type == "EMISSION":
            node.inputs["Strength"].default_value = 0.12
            continue
        if "prodlight" in material.name.lower() and node.type == "RGB":
            node.outputs["Color"].default_value = (0.45, 0.65, 0.2, 1)
            continue
        if node.type != "BSDF_PRINCIPLED":
            continue
        strength = node.inputs.get("Emission Strength")
        if "prodlight" in material.name.lower():
            node.inputs["Base Color"].default_value = (0.34, 0.4, 0.22, 1)
            node.inputs["Emission Color"].default_value = (0.12, 0.24, 0.06, 1)
            if strength is not None:
                strength.default_value = 0.02
        elif strength is not None and strength.default_value > 0.2:
            strength.default_value = 0.2

camera_data = bpy.data.cameras.new("CodexIsometricCamera")
camera_data.type = "PERSP"
camera_data.lens = 85 if foundation_only else 78
camera_data.sensor_width = 36
camera = bpy.data.objects.new("CodexIsometricCamera", camera_data)

# 화면 기준 전면 우측에서 방위각 45°, 실제 고도 45°로 본다.
direction = (Vector((0, -math.cos(math.radians(22)), math.sin(math.radians(22))))
             if foundation_only else Vector((0.5, -0.5, math.sqrt(0.5)))).normalized()
vertical_fov = 2 * math.atan((camera_data.sensor_width / 2) / camera_data.lens)
distance = radius / math.sin(vertical_fov / 2) * 0.84
camera.location = center + direction * distance
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.shift_y = 0.10 if foundation_only else -0.12
scene.collection.objects.link(camera)
scene.camera = camera

# 넓은 면광원으로 금속 파이프와 패널에 길고 자연스러운 인게임형 반사선을 만든다.
area_light("IsoKey", center + Vector((-12, -14, 18)), 620, 12.0, center)
area_light("IsoFill", center + Vector((14, 7, 11)), 420, 14.0, center)
area_light("IsoRim", center + Vector((-9, 13, 14)), 280, 11.0, center)

world = scene.world or bpy.data.worlds.new("IsoWorld")
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.38, 0.43, 0.49, 1)
background.inputs["Strength"].default_value = 0.72

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = resolution
scene.render.resolution_y = resolution
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.render.use_compositing = False
scene.render.filepath = str(output)
scene.render.image_settings.color_depth = "8"
scene.view_settings.look = "Medium High Contrast"
scene.view_settings.exposure = 0.45

bpy.ops.render.render(write_still=True)
print(f"ISOMETRIC_PREVIEW={output}")
