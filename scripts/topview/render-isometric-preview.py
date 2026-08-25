"""승인 전 단일 설비 도감 아이소메트릭 후보를 렌더한다.

사용: blender <assembled.blend> --background --python render-isometric-preview.py -- <output.png>
이 스크립트는 후보 비교용이며 승인 전 제품 매니페스트를 수정하지 않는다.
"""

import json
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


def flat_material(name, color, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def add_marking_box(name, center, dimensions, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_foundation(repository_root, machine_minimum, placement_center, foundation_color_slot=None):
    export_root = repository_root / ".cache/topview/isometric/foundation-export/FactoryGame/Content/FactoryGame/Buildable/Building/Foundation/FicsitSet"
    glb = export_root / "SM_Foundation_FicsitSet_8x1_01.glb"
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(glb), import_shading="NORMALS")
    imported = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH"]
    foundation_minimum, foundation_maximum = mesh_bounds(imported)
    offset = Vector((
        placement_center.x - (foundation_minimum.x + foundation_maximum.x) / 2,
        placement_center.y - (foundation_minimum.y + foundation_maximum.y) / 2,
        machine_minimum.z - foundation_maximum.z,
    ))
    for obj in imported:
        obj.location += offset
    bpy.context.view_layer.update()

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
    primary = nodes.new("ShaderNodeRGB")
    secondary = nodes.new("ShaderNodeRGB")
    primary_value = foundation_color_slot["primary"] if foundation_color_slot else {"R": 0.109804, "G": 0.109804, "B": 0.109804}
    secondary_value = foundation_color_slot["secondary"] if foundation_color_slot else {"R": 0.952941, "G": 0.301961, "B": 0.066667}
    primary.outputs[0].default_value = (primary_value["R"], primary_value["G"], primary_value["B"], 1)
    secondary.outputs[0].default_value = (secondary_value["R"], secondary_value["G"], secondary_value["B"], 1)
    primary_tint = nodes.new("ShaderNodeMixRGB")
    secondary_tint = nodes.new("ShaderNodeMixRGB")
    primary_tint.blend_type = "MULTIPLY"
    secondary_tint.blend_type = "MULTIPLY"
    primary_tint.inputs[0].default_value = 1
    secondary_tint.inputs[0].default_value = 1
    primary_mix = nodes.new("ShaderNodeMixRGB")
    secondary_mix = nodes.new("ShaderNodeMixRGB")
    ao_multiply = nodes.new("ShaderNodeMixRGB")
    ao_multiply.blend_type = "MULTIPLY"
    ao_multiply.inputs[0].default_value = 1
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(ao.outputs["Color"], ao_channels.inputs["Color"])
    links.new(albedo.outputs["Color"], primary_tint.inputs[1])
    links.new(primary.outputs[0], primary_tint.inputs[2])
    links.new(albedo.outputs["Color"], secondary_tint.inputs[1])
    links.new(secondary.outputs[0], secondary_tint.inputs[2])
    links.new(ao_channels.outputs["Green"], primary_mix.inputs[0])
    links.new(albedo.outputs["Color"], primary_mix.inputs[1])
    links.new(primary_tint.outputs["Color"], primary_mix.inputs[2])
    links.new(ao_channels.outputs["Blue"], secondary_mix.inputs[0])
    links.new(primary_mix.outputs["Color"], secondary_mix.inputs[1])
    links.new(secondary_tint.outputs["Color"], secondary_mix.inputs[2])
    links.new(secondary_mix.outputs["Color"], ao_multiply.inputs[1])
    links.new(ao_channels.outputs["Red"], ao_multiply.inputs[2])
    links.new(ao_multiply.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(reflection.outputs["Color"], reflection_channels.inputs["Color"])
    links.new(reflection_channels.outputs["Red"], bsdf.inputs["Metallic"])
    links.new(reflection_channels.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])

    # UV0는 반복 표면 디테일용이고 UV1은 토대 전체 좌표다. 단일 아틀라스 조각을
    # 네 면에 강제로 복제하지 않고, 게임 아이콘의 기본 FICSIT 패널 구조를 실제 장면 기하로 복원한다.
    top_material = bpy.data.materials.new("MI_Foundation_FicsitSet_01_DefaultTop")
    top_material.use_nodes = True
    top_nodes = top_material.node_tree.nodes
    top_links = top_material.node_tree.links
    top_nodes.clear()
    top_output = top_nodes.new("ShaderNodeOutputMaterial")
    top_bsdf = top_nodes.new("ShaderNodeBsdfPrincipled")
    texcoord = top_nodes.new("ShaderNodeTexCoord")
    noise = top_nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 42
    noise.inputs["Detail"].default_value = 3.2
    noise.inputs["Roughness"].default_value = 0.62
    ramp = top_nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.075, 0.09, 0.11, 1)
    ramp.color_ramp.elements[1].color = (0.19, 0.215, 0.24, 1)
    bump = top_nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.018
    top_bsdf.inputs["Metallic"].default_value = 0.32
    top_bsdf.inputs["Roughness"].default_value = 0.5
    top_links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
    top_links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    top_links.new(ramp.outputs["Color"], top_bsdf.inputs["Base Color"])
    top_links.new(noise.outputs["Fac"], bump.inputs["Height"])
    top_links.new(bump.outputs["Normal"], top_bsdf.inputs["Normal"])
    top_links.new(top_bsdf.outputs["BSDF"], top_output.inputs["Surface"])
    for obj in imported:
        top_index = len(obj.data.materials)
        obj.data.materials.append(top_material)
        for polygon in obj.data.polygons:
            center_z = (obj.matrix_world @ polygon.center).z
            if polygon.normal.z > 0.72 and center_z >= machine_minimum.z - 0.085:
                polygon.material_index = top_index

    markings = []
    white = flat_material("FICSIT_Foundation_WhiteMarking", (0.68, 0.72, 0.75), 0.45, 0.34)
    seam = flat_material("FICSIT_Foundation_PanelSeam", (0.025, 0.032, 0.042), 0.2, 0.62)
    top_z = machine_minimum.z + 0.009
    cx, cy = placement_center.x, placement_center.y

    # 중앙 4패널 접합선과 그 주위의 얇은 흰 프레임.
    markings.append(add_marking_box("FoundationSeamX", (cx, cy, top_z), (6.25, 0.026, 0.012), seam))
    markings.append(add_marking_box("FoundationSeamY", (cx, cy, top_z), (0.026, 6.25, 0.012), seam))
    for axis, sign in (("x", -1), ("x", 1), ("y", -1), ("y", 1)):
        if axis == "x":
            markings.append(add_marking_box(f"FoundationInnerFrameX{sign}", (cx + sign * 3.18, cy, top_z), (0.035, 6.38, 0.014), white))
        else:
            markings.append(add_marking_box(f"FoundationInnerFrameY{sign}", (cx, cy + sign * 3.18, top_z), (6.38, 0.035, 0.014), white))

    # 기본 FICSIT 토대 아이콘의 외곽 통풍 슬롯을 실제 얇은 금속 기하로 배치한다.
    slot_count = 46
    span = 6.1
    for index in range(slot_count):
        offset = -span / 2 + span * index / (slot_count - 1)
        for sign in (-1, 1):
            markings.append(add_marking_box(f"FoundationVentNS{sign}_{index}", (cx + offset, cy + sign * 3.53, top_z), (0.052, 0.28, 0.014), white))
            markings.append(add_marking_box(f"FoundationVentEW{sign}_{index}", (cx + sign * 3.53, cy + offset, top_z), (0.28, 0.052, 0.014), white))
    return imported + markings


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
positional = [arg for arg in args if not arg.startswith("--")]
foundation_only = "--foundation-only" in args
use_cycles = "--use-cycles" in args
diagnostic_fallback = "--diagnostic-fallback" in args
if not diagnostic_fallback:
    raise RuntimeError("아이소메트릭 재질 어댑터가 미완료입니다. 제품 렌더를 차단합니다. 진단 렌더만 --diagnostic-fallback으로 실행하세요.")
resolution_arg = next((arg for arg in args if arg.startswith("--resolution=")), "--resolution=1024")
resolution = int(resolution_arg.split("=", 1)[1])
azimuth_arg = next((arg for arg in args if arg.startswith("--azimuth=")), "--azimuth=135")
azimuth = math.radians(float(azimuth_arg.split("=", 1)[1]))
elevation_arg = next((arg for arg in args if arg.startswith("--elevation=")), "--elevation=43")
elevation = math.radians(float(elevation_arg.split("=", 1)[1]))
frame_arg = next((arg for arg in args if arg.startswith("--frame=")), "--frame=0.75")
frame = float(frame_arg.split("=", 1)[1])
placement_arg = next((arg for arg in args if arg.startswith("--placement-contract=")), None)
material_atlas_arg = next((arg for arg in args if arg.startswith("--material-atlas=")), None)
if len(positional) != 1:
    raise ValueError("출력 PNG 경로 하나가 필요합니다.")

output = Path(positional[0]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
repository_root = Path(__file__).resolve().parents[2]
scene = bpy.context.scene
atlas_replacements = {
    "satisfactory-material-atlas.png": (
        Path(material_atlas_arg.split("=", 1)[1]).resolve()
        if material_atlas_arg else repository_root / ".cache/topview/satisfactory-material-atlas.png"
    ),
    "satisfactory-normal-atlas.png": repository_root / ".cache/topview/satisfactory-normal-atlas.png",
    "satisfactory-reflection-atlas.png": repository_root / ".cache/topview/satisfactory-reflection-atlas.png",
}
for image_name, replacement in atlas_replacements.items():
    atlas = bpy.data.images.get(image_name)
    if atlas is None:
        raise RuntimeError(f"{image_name} 이미지가 장면에 없습니다.")
    atlas.filepath = str(replacement)
    atlas.reload()
meshes = [obj for obj in scene.objects if obj.type == "MESH" and not obj.name.startswith("Occupancy")]
minimum, maximum = mesh_bounds(meshes)
center = (minimum + maximum) / 2
contract_argument = placement_arg
placement_contract = (json.loads(Path(contract_argument.split("=", 1)[1]).resolve().read_text(encoding="utf-8"))
                      if contract_argument else None)
if placement_contract:
    clearance_minimum = Vector(placement_contract["clearance"]["minimum"])
    clearance_maximum = Vector(placement_contract["clearance"]["maximum"])
    placement_center = (clearance_minimum + clearance_maximum) / 2
    placement_center.z = center.z
else:
    placement_center = center
foundation_meshes = add_foundation(
    repository_root,
    minimum,
    placement_center,
    placement_contract.get("foundationColorSlot") if placement_contract else None,
)
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
    if material.name.casefold().startswith("decal_normal"):
        factory_slot = placement_contract.get("factoryColorSlot") if placement_contract else None
        primary_value = factory_slot["primary"] if factory_slot else {"R": 0.952941, "G": 0.301961, "B": 0.066667}
        for shader in (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"):
            base_color = shader.inputs["Base Color"]
            if base_color.is_linked:
                material.node_tree.links.remove(base_color.links[0])
            base_color.default_value = (primary_value["R"], primary_value["G"], primary_value["B"], 1)
            shader.inputs["Metallic"].default_value = 0.55
            shader.inputs["Roughness"].default_value = 0.32
        continue
    for node in material.node_tree.nodes:
        if "prodlight" in material.name.lower() and node.type == "EMISSION":
            node.inputs["Strength"].default_value = 0.62
            continue
        if "prodlight" in material.name.lower() and node.type == "RGB":
            node.outputs["Color"].default_value = (1.0, 0.32, 0.025, 1)
            continue
        if node.type != "BSDF_PRINCIPLED":
            continue
        strength = node.inputs.get("Emission Strength")
        if "prodlight" in material.name.lower():
            node.inputs["Base Color"].default_value = (0.5, 0.19, 0.035, 1)
            node.inputs["Emission Color"].default_value = (1.0, 0.22, 0.015, 1)
            if strength is not None:
                strength.default_value = 0.55
        elif strength is not None and strength.default_value > 0.2:
            strength.default_value = 0.2

        if material.name in {"GeneratorBiomass_Inst", "MI_ConveyorBelt_Mk1_01", "MI_VA_GeneratorBiomass_01"}:
            specular = node.inputs.get("Specular IOR Level")
            coat = node.inputs.get("Coat Weight")
            coat_roughness = node.inputs.get("Coat Roughness")
            if specular is not None:
                specular.default_value = 0.58
            if coat is not None:
                coat.default_value = 0.07
            if coat_roughness is not None:
                coat_roughness.default_value = 0.22
            roughness = node.inputs.get("Roughness")
            if roughness is not None and roughness.is_linked:
                source = roughness.links[0].from_socket
                material.node_tree.links.remove(roughness.links[0])
                remap = material.node_tree.nodes.new("ShaderNodeMapRange")
                remap.name = "GameRoughnessRange"
                remap.inputs["From Min"].default_value = 0
                remap.inputs["From Max"].default_value = 1
                remap.inputs["To Min"].default_value = 0.08
                remap.inputs["To Max"].default_value = 0.78
                material.node_tree.links.new(source, remap.inputs["Value"])
                material.node_tree.links.new(remap.outputs["Result"], roughness)
            if material.name in {"GeneratorBiomass_Inst", "MI_VA_GeneratorBiomass_01"}:
                tree = material.node_tree
                base_color = node.inputs.get("Base Color")
                if base_color is not None and base_color.is_linked:
                    color_source = base_color.links[0].from_socket
                    tree.links.remove(base_color.links[0])
                    coordinates = tree.nodes.new("ShaderNodeTexCoord")
                    broad_noise = tree.nodes.new("ShaderNodeTexNoise")
                    broad_noise.inputs["Scale"].default_value = 7.5
                    broad_noise.inputs["Detail"].default_value = 5
                    broad_noise.inputs["Roughness"].default_value = 0.72
                    broad_noise.inputs["Distortion"].default_value = 0.08
                    weathering = tree.nodes.new("ShaderNodeValToRGB")
                    weathering.color_ramp.elements[0].position = 0.2
                    weathering.color_ramp.elements[0].color = (0.5, 0.53, 0.56, 1)
                    weathering.color_ramp.elements[1].position = 0.82
                    weathering.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
                    color_mix = tree.nodes.new("ShaderNodeMixRGB")
                    color_mix.blend_type = "MULTIPLY"
                    color_mix.inputs[0].default_value = 0.32
                    tree.links.new(coordinates.outputs["Generated"], broad_noise.inputs["Vector"])
                    tree.links.new(broad_noise.outputs["Fac"], weathering.inputs["Fac"])
                    tree.links.new(color_source, color_mix.inputs[1])
                    tree.links.new(weathering.outputs["Color"], color_mix.inputs[2])
                    tree.links.new(color_mix.outputs["Color"], base_color)

                    fine_noise = tree.nodes.new("ShaderNodeTexNoise")
                    fine_noise.inputs["Scale"].default_value = 115
                    fine_noise.inputs["Detail"].default_value = 2.6
                    fine_noise.inputs["Roughness"].default_value = 0.78
                    detail_bump = tree.nodes.new("ShaderNodeBump")
                    detail_bump.inputs["Strength"].default_value = 0.13
                    detail_bump.inputs["Distance"].default_value = 0.012
                    tree.links.new(coordinates.outputs["Generated"], fine_noise.inputs["Vector"])
                    tree.links.new(fine_noise.outputs["Fac"], detail_bump.inputs["Height"])
                    normal = node.inputs.get("Normal")
                    if normal is not None and normal.is_linked:
                        normal_source = normal.links[0].from_socket
                        tree.links.remove(normal.links[0])
                        tree.links.new(normal_source, detail_bump.inputs["Normal"])
                    if normal is not None:
                        tree.links.new(detail_bump.outputs["Normal"], normal)

camera_data = bpy.data.cameras.new("CodexIsometricCamera")
camera_data.type = "PERSP"
camera_data.lens = 85 if foundation_only else 78
camera_data.sensor_width = 36
camera = bpy.data.objects.new("CodexIsometricCamera", camera_data)

# 화면 기준 전면 우측에서 실제 고도 43°로 보며, 방위각은 제품 전면이 드러나는 방향을 사용한다.
direction = (Vector((0, -math.cos(math.radians(22)), math.sin(math.radians(22))))
             if foundation_only else Vector((math.cos(elevation) * math.cos(azimuth), math.cos(elevation) * math.sin(azimuth), math.sin(elevation)))).normalized()
vertical_fov = 2 * math.atan((camera_data.sensor_width / 2) / camera_data.lens)
distance = radius / math.sin(vertical_fov / 2) * frame
camera.location = center + direction * distance
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.shift_y = 0.10 if foundation_only else -0.035
scene.collection.objects.link(camera)
scene.camera = camera

# 넓은 면광원으로 금속 파이프와 패널에 길고 자연스러운 인게임형 반사선을 만든다.
area_light("IsoKey", center + Vector((-11, 11, 18)), 1180, 4.5, center)
area_light("IsoFill", center + Vector((12, -9, 10)), 460, 12.0, center)
area_light("IsoRim", center + Vector((8, 11, 15)), 520, 5.0, center)

world = scene.world or bpy.data.worlds.new("IsoWorld")
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.38, 0.43, 0.49, 1)
background.inputs["Strength"].default_value = 0.68

scene.render.engine = "CYCLES" if use_cycles else "BLENDER_EEVEE"
if use_cycles:
    scene.cycles.samples = 72
    scene.cycles.use_denoising = True
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
scene.view_settings.exposure = 0.68

# 발전기와 토대가 같은 장면·카메라·조명을 공유한다는 재현 증거를 보존한다.
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")))

bpy.ops.render.render(write_still=True)
print(f"ISOMETRIC_PREVIEW={output}")
