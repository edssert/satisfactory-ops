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
bpy.context.preferences.filepaths.file_preview_type = "NONE"
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


def create_clearance_material(values, color, gradient_path):
    runtime_shader = json.loads(Path(__file__).with_name("clearance-runtime-shader.json").read_text(encoding="utf-8"))
    register0, register1, register2 = runtime_shader["materialCbuffer"]["registers"]
    scalars = {
        **values["Scalars"],
        "edgestr": register0[0],
        "edgesubtr": register0[1],
        "EncroachingAClearance": register0[2],
        "Glow": register1[3],
        "LineStr": register2[0],
    }
    material = bpy.data.materials.new("Clearance_Inst")
    material.use_nodes = True
    material.surface_render_method = "DITHERED"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output_node = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1
    coordinates = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coordinates.outputs["UV"], separate.inputs["Vector"])

    def shader_edge_axis(name, coordinate):
        pi_scale = nodes.new("ShaderNodeMath")
        pi_scale.name = f"{name}_Pi"
        pi_scale.operation = "MULTIPLY"
        pi_scale.inputs[1].default_value = math.pi
        links.new(coordinate, pi_scale.inputs[0])
        sine = nodes.new("ShaderNodeMath")
        sine.name = f"{name}_Sin"
        sine.operation = "SINE"
        links.new(pi_scale.outputs[0], sine.inputs[0])
        invert = nodes.new("ShaderNodeMath")
        invert.name = f"{name}_OneMinusSin"
        invert.operation = "SUBTRACT"
        invert.inputs[0].default_value = 1
        links.new(sine.outputs[0], invert.inputs[1])
        power = nodes.new("ShaderNodeMath")
        power.name = f"{name}_PowEdgeStrength"
        power.operation = "POWER"
        power.inputs[1].default_value = scalars["edgestr"]
        links.new(invert.outputs[0], power.inputs[0])
        return power.outputs[0]

    edge_x = shader_edge_axis("EdgeU", separate.outputs["X"])
    edge_y = shader_edge_axis("EdgeV", separate.outputs["Y"])
    edge_sum = nodes.new("ShaderNodeMath")
    edge_sum.operation = "ADD"
    links.new(edge_x, edge_sum.inputs[0])
    links.new(edge_y, edge_sum.inputs[1])
    edge_half = nodes.new("ShaderNodeMath")
    edge_half.operation = "MULTIPLY"
    edge_half.inputs[1].default_value = 0.5
    links.new(edge_sum.outputs[0], edge_half.inputs[0])
    edge = nodes.new("ShaderNodeMath")
    edge.name = "DXIL_Edge"
    edge.operation = "SUBTRACT"
    edge.inputs[1].default_value = scalars["edgesubtr"]
    links.new(edge_half.outputs[0], edge.inputs[0])

    source_color = tuple(register1[:3])
    line_color = tuple(register2[1:4])
    color_node = nodes.new("ShaderNodeRGB")
    color_node.outputs[0].default_value = (*source_color[:3], 1)
    edge_color = nodes.new("ShaderNodeVectorMath")
    edge_color.operation = "SCALE"
    links.new(color_node.outputs[0], edge_color.inputs[0])
    links.new(edge.outputs[0], edge_color.inputs[3])
    glow_color = nodes.new("ShaderNodeVectorMath")
    glow_color.operation = "SCALE"
    glow_color.inputs[3].default_value = scalars["Glow"]
    links.new(edge_color.outputs[0], glow_color.inputs[0])
    line_mix = nodes.new("ShaderNodeMixRGB")
    line_mix.name = "DXIL_LineColorLerp"
    line_mix.blend_type = "MIX"
    line_mix.inputs[0].default_value = scalars["LineStr"]
    links.new(glow_color.outputs[0], line_mix.inputs[1])
    line_mix.inputs[2].default_value = (*line_color[:3], 1)
    nonnegative = nodes.new("ShaderNodeVectorMath")
    nonnegative.name = "DXIL_FMaxZero"
    nonnegative.operation = "MAXIMUM"
    nonnegative.inputs[1].default_value = (0, 0, 0)
    links.new(line_mix.outputs[0], nonnegative.inputs[0])

    gradient = nodes.new("ShaderNodeTexImage")
    gradient.name = "GradientVert"
    gradient.image = bpy.data.images.load(str(gradient_path), check_existing=True)
    gradient.image.colorspace_settings.name = "Non-Color"
    gradient.extension = "REPEAT"
    links.new(coordinates.outputs["UV"], gradient.inputs["Vector"])
    opacity_power = nodes.new("ShaderNodeMath")
    opacity_power.name = "DXIL_GradientPow5"
    opacity_power.operation = "POWER"
    opacity_power.inputs[1].default_value = 5
    links.new(gradient.outputs["Color"], opacity_power.inputs[0])
    opacity = nodes.new("ShaderNodeClamp")
    links.new(opacity_power.outputs[0], opacity.inputs["Value"])
    final_color = nodes.new("ShaderNodeVectorMath")
    final_color.name = "DXIL_OpacityMultiply"
    final_color.operation = "SCALE"
    links.new(nonnegative.outputs[0], final_color.inputs[0])
    links.new(opacity.outputs["Result"], final_color.inputs[3])
    links.new(final_color.outputs[0], emission.inputs["Color"])
    additive = nodes.new("ShaderNodeAddShader")
    links.new(transparent.outputs["BSDF"], additive.inputs[0])
    links.new(emission.outputs["Emission"], additive.inputs[1])
    links.new(additive.outputs[0], output_node.inputs["Surface"])
    material["adapter"] = "BuildHologram"
    material["source_parameters"] = json.dumps(scalars)
    material["source_vectors"] = json.dumps({"Color": source_color, "LineColor": line_color})
    material["source_masks"] = json.dumps([str(gradient_path)])
    material["clearance_uv_shader"] = True
    material["clearance_renderdoc_shader_hash"] = runtime_shader["renderDocShaderHash"]
    material["clearance_dxil_sha256"] = runtime_shader["dxilSha256"]
    material["clearance_runtime_cbuffer"] = json.dumps(runtime_shader["materialCbuffer"])
    material["clearance_gradient_sampler"] = json.dumps(runtime_shader["gradientSampler"])
    material["clearance_uv_formula"] = "0.5*(pow(1-sin(pi*U),edgestr)+pow(1-sin(pi*V),edgestr))-edgesubtr"
    material["clearance_opacity_formula"] = "saturate(pow(GradientVert.r,5))"
    material["blend_contract"] = "D3D12 ONE+ONE; Blender AddShader(Transparent,Emission)"
    material["depth_test_adapter"] = "same-scene-view-layer-no-depth"
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
if not clearance_gradient.exists():
    raise RuntimeError("게임 GradientVert 텍스처가 없습니다.")
clearance_material = create_clearance_material(
    clearance_values,
    contract["colors"]["clearance"]["linear"],
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
clearance_collection = bpy.data.collections.new("RuntimeClearanceOverlay")
bpy.context.scene.collection.children.link(clearance_collection)

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
            clearance_collection.objects.link(obj)
            for source_collection in list(obj.users_collection):
                if source_collection != clearance_collection:
                    source_collection.objects.unlink(obj)
            bpy.context.view_layer.update()
            obj["clearance_uv_source"] = "ClearanceBox UV0 + captured DXIL formula + GradientVert"

output.parent.mkdir(parents=True, exist_ok=True)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print(json.dumps({
    "status": "game-source-clearance-candidate",
    "adapter": "BuildHologram",
    "technicalMeshes": len(technical_meshes),
    "portDepth": "natural-scene-depth",
    "clearanceDepth": "same-scene-view-layer-no-depth",
}, ensure_ascii=False))
