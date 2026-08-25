"""원본 BuildGun 메시·재질값으로 clearance와 port hologram 장면을 조립한다."""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 3:
    raise ValueError("hologram export root, overlay contract, output BLEND가 필요합니다.")
export_root, contract_path, output = map(lambda value: Path(value).resolve(), args)
contract = json.loads(contract_path.read_text(encoding="utf-8"))
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh_root = export_root / "FactoryGame/Content/FactoryGame/Equipment/BuildGun/Mesh"
material_root = export_root / "FactoryGame/Content/FactoryGame/Equipment/BuildGun/Material"


def material_values(name):
    return json.loads((material_root / f"{name}.json").read_text(encoding="utf-8"))["Parameters"]


def connection_material(name, source):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.surface_render_method = "DITHERED"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output_node = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    color = source["color"]
    emission.inputs["Color"].default_value = (color["R"], color["G"], color["B"], 1)
    emission.inputs["Strength"].default_value = 1
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = source["opacity"]
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs[0], output_node.inputs["Surface"])
    material["adapter"] = "BuildHologram"
    material["source_contract"] = json.dumps(source)
    material["source_material"] = source["objectPath"]
    material["source_parent"] = source["parent"]["objectPath"]
    material["depth_test_disabled"] = bool(source["parent"]["properties"].get("bDisableDepthTest"))
    material["depth_test_adapter"] = "natural-scene-depth"
    return material


def create_clearance_material(values, color, edge_path, scan_path, gradient_path):
    scalars = values["Scalars"]
    material = bpy.data.materials.new("Clearance_Inst")
    material.use_nodes = True
    material.surface_render_method = "DITHERED"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output_node = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*color, 1)
    coordinates = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coordinates.outputs["UV"], separate.inputs["Vector"])

    def boundary_mask(name, path, coordinate_output, texture_axis):
        one_minus = nodes.new("ShaderNodeMath")
        one_minus.operation = "SUBTRACT"
        one_minus.inputs[0].default_value = 1
        links.new(coordinate_output, one_minus.inputs[1])
        nearest = nodes.new("ShaderNodeMath")
        nearest.operation = "MINIMUM"
        links.new(coordinate_output, nearest.inputs[0])
        links.new(one_minus.outputs[0], nearest.inputs[1])
        normalize = nodes.new("ShaderNodeMath")
        normalize.operation = "DIVIDE"
        normalize.inputs[1].default_value = scalars["LineStr"]
        links.new(nearest.outputs[0], normalize.inputs[0])
        cap = nodes.new("ShaderNodeMath")
        cap.operation = "MINIMUM"
        cap.inputs[1].default_value = 1
        links.new(normalize.outputs[0], cap.inputs[0])
        half = nodes.new("ShaderNodeMath")
        half.operation = "MULTIPLY"
        half.inputs[1].default_value = 0.5
        links.new(cap.outputs[0], half.inputs[0])
        combine = nodes.new("ShaderNodeCombineXYZ")
        combine.name = f"{name}Coordinates"
        combine.inputs["X"].default_value = 0.5
        combine.inputs["Y"].default_value = 0.5
        links.new(half.outputs[0], combine.inputs[texture_axis])
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = name
        texture.image = bpy.data.images.load(str(path), check_existing=True)
        texture.image.colorspace_settings.name = "Non-Color"
        texture.extension = "EXTEND"
        links.new(combine.outputs["Vector"], texture.inputs["Vector"])
        invert = nodes.new("ShaderNodeMath")
        invert.operation = "SUBTRACT"
        invert.inputs[0].default_value = 1
        links.new(texture.outputs["Color"], invert.inputs[1])
        subtract = nodes.new("ShaderNodeMath")
        subtract.operation = "SUBTRACT"
        subtract.inputs[1].default_value = scalars["edgesubtr"]
        links.new(invert.outputs[0], subtract.inputs[0])
        strength = nodes.new("ShaderNodeMath")
        strength.operation = "MULTIPLY"
        strength.inputs[1].default_value = scalars["edgestr"]
        links.new(subtract.outputs[0], strength.inputs[0])
        clamp = nodes.new("ShaderNodeClamp")
        links.new(strength.outputs[0], clamp.inputs["Value"])
        return clamp.outputs["Result"]

    vertical_edge = boundary_mask("Mam_EdgeLine_Alb", edge_path, separate.outputs["X"], "X")
    horizontal_edge = boundary_mask("Mam_ScanLine_Alb", scan_path, separate.outputs["Y"], "Y")
    gradient_coordinates = nodes.new("ShaderNodeCombineXYZ")
    gradient_coordinates.inputs["X"].default_value = 0.5
    links.new(separate.outputs["Y"], gradient_coordinates.inputs["Y"])
    gradient = nodes.new("ShaderNodeTexImage")
    gradient.name = "GradientVert"
    gradient.image = bpy.data.images.load(str(gradient_path), check_existing=True)
    gradient.image.colorspace_settings.name = "Non-Color"
    gradient.extension = "EXTEND"
    links.new(gradient_coordinates.outputs["Vector"], gradient.inputs["Vector"])
    faded_vertical = nodes.new("ShaderNodeMath")
    faded_vertical.operation = "MULTIPLY"
    links.new(vertical_edge, faded_vertical.inputs[0])
    links.new(gradient.outputs["Color"], faded_vertical.inputs[1])
    combined = nodes.new("ShaderNodeMath")
    combined.operation = "ADD"
    links.new(faded_vertical.outputs[0], combined.inputs[0])
    links.new(horizontal_edge, combined.inputs[1])
    alpha = nodes.new("ShaderNodeClamp")
    links.new(combined.outputs[0], alpha.inputs["Value"])
    glow = nodes.new("ShaderNodeMath")
    glow.operation = "MULTIPLY"
    glow.inputs[1].default_value = scalars["Glow"]
    links.new(combined.outputs[0], glow.inputs[0])
    links.new(glow.outputs[0], emission.inputs["Strength"])
    mix = nodes.new("ShaderNodeMixShader")
    links.new(alpha.outputs["Result"], mix.inputs[0])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs[0], output_node.inputs["Surface"])
    material["adapter"] = "BuildHologram"
    material["source_parameters"] = json.dumps(scalars)
    material["source_masks"] = json.dumps([str(edge_path), str(scan_path), str(gradient_path)])
    material["clearance_uv_shader"] = True
    return material


def import_mesh(path, name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), import_shading="NORMALS")
    objects = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH"]
    for index, obj in enumerate(objects):
        obj.name = f"{name}_{index}"
    return objects


def exported_mesh_path(source):
    return export_root / (source["objectPath"].split(".", 1)[0].replace("/Game/", "FactoryGame/Content/") + ".glb")


clearance_values = material_values("Clearance_Inst")
clearance_gradient = export_root / "FactoryGame/Content/FactoryGame/-Shared/Texture/Gradient/GradientVert.png"
clearance_edge_mask = export_root / "FactoryGame/Content/FactoryGame/Buildable/Factory/Mam/Texture/Mam_EdgeLine_Alb.png"
clearance_scan_mask = export_root / "FactoryGame/Content/FactoryGame/Buildable/Factory/Mam/Texture/Mam_ScanLine_Alb.png"
if not all(path.exists() for path in (clearance_gradient, clearance_edge_mask, clearance_scan_mask)):
    raise RuntimeError("게임 clearance mask 3종이 없습니다.")
clearance_material = create_clearance_material(
    clearance_values,
    contract["colors"]["clearance"]["linear"],
    clearance_edge_mask,
    clearance_scan_mask,
    clearance_gradient,
)
visualization = contract["visualization"]
placement = visualization.get("placement", {})
input_material = connection_material("Hologram_Input", visualization["materials"]["input"])
output_material = connection_material("Hologram_Output", visualization["materials"]["output"])
power_material = connection_material("Hologram_Power", visualization["materials"]["power"])

technical_meshes = contract.get("technicalMeshes", [])
if not technical_meshes:
    raise RuntimeError("runtime probe technicalMeshes가 없습니다.")

for index, entry in enumerate(technical_meshes):
    material = {
        "input": input_material,
        "output": output_material,
        "power": power_material,
        "clearance": clearance_material,
    }.get(entry["direction"], clearance_material)
    source = {"objectPath": entry["staticMesh"]}
    imported = import_mesh(exported_mesh_path(source), f"RuntimeTechnical_{index}_{entry['role']}")
    transform = entry["transform"]
    for obj in imported:
        obj.location = Vector(transform["translationM"])
        obj.rotation_mode = "QUATERNION"
        x, y, z, w = transform["rotationQuat"]
        obj.rotation_quaternion = Quaternion((w, x, y, z))
        obj.scale = Vector(transform["scale"])
        obj.data.materials.clear()
        obj.data.materials.append(material)
        obj["source_mesh"] = entry["staticMesh"].split("/")[-1].split(".")[0]
        obj["runtime_technical_id"] = entry["id"]
        obj["runtime_technical_index"] = index
        obj["technical_role"] = entry["role"]
        obj["port_direction"] = entry["direction"]
        obj["source_transform"] = json.dumps(transform)
        obj["source_probe"] = contract["runtimeProbe"]["path"]
        if entry["role"] == "clearance":
            bpy.context.view_layer.update()
            obj["clearance_uv_source"] = "ClearanceBox UV0 + Mam_EdgeLine_Alb + Mam_ScanLine_Alb + GradientVert"

output.parent.mkdir(parents=True, exist_ok=True)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print(json.dumps({"status": "game-source-clearance-candidate", "adapter": "BuildHologram", "technicalMeshes": len(technical_meshes), "depthTest": "natural-scene-depth"}, ensure_ascii=False))
