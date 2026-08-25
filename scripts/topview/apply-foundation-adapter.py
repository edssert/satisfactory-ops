"""MM_BakedStencil_01 기본 Foundation(PatternID 0)을 Blender 재질로 조립한다."""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 3:
    raise ValueError("foundation GLB, placement contract, output BLEND가 필요합니다.")
glb, contract_path, output = map(lambda value: Path(value).resolve(), args)
contract = json.loads(contract_path.read_text(encoding="utf-8"))
bpy.ops.wm.read_factory_settings(use_empty=True)
before = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(glb), import_shading="NORMALS")
objects = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH"]
foundation_instances = contract.get("foundationInstances", [])
if len(foundation_instances) != 1:
    raise RuntimeError(f"foundation instance는 현재 정확히 1개여야 합니다: {len(foundation_instances)}")
instance = foundation_instances[0]
transform = instance["transform"]
x, y, z, w = transform["rotationQuat"]
for obj in objects:
    obj.location = Vector(transform["translationM"])
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Quaternion((w, x, y, z))
    obj.scale = Vector(transform["scale"])
    obj["runtime_foundation_source"] = instance["source"]
bpy.context.view_layer.update()

material = next(slot.material for obj in objects for slot in obj.material_slots if slot.material)
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
nodes.clear()
output_node = nodes.new("ShaderNodeOutputMaterial")
shader = nodes.new("ShaderNodeBsdfPrincipled")
root = glb.parent / "Textures"


def texture(name, non_color=False):
    node = nodes.new("ShaderNodeTexImage")
    node.name = name
    node.image = bpy.data.images.load(str(root / name), check_existing=True)
    node.extension = "MIRROR"
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


albedo = texture("TX_Ficsit_Foundation_01_BC.png")
ao = texture("TX_Ficsit_Foundation_01_AOMasks.png", True)
reflection = texture("TX_Ficsit_Foundation_01_Relf.png", True)
normal = texture("TX_Ficsit_Foundation_01_N.png", True)
ao_channels = nodes.new("ShaderNodeSeparateColor")
reflection_channels = nodes.new("ShaderNodeSeparateColor")
primary = nodes.new("ShaderNodeRGB")
secondary = nodes.new("ShaderNodeRGB")
primary.name = "FoundationPrimarySlot16"
secondary.name = "FoundationSecondarySlot16"
primary_value = contract["foundationColorSlot"]["primary"]
secondary_value = contract["foundationColorSlot"]["secondary"]
primary.outputs[0].default_value = (primary_value["R"], primary_value["G"], primary_value["B"], 1)
secondary.outputs[0].default_value = (secondary_value["R"], secondary_value["G"], secondary_value["B"], 1)
primary_tint = nodes.new("ShaderNodeMixRGB")
secondary_tint = nodes.new("ShaderNodeMixRGB")
primary_tint.blend_type = secondary_tint.blend_type = "MULTIPLY"
primary_tint.inputs[0].default_value = secondary_tint.inputs[0].default_value = 1
primary_mix = nodes.new("ShaderNodeMixRGB")
secondary_mix = nodes.new("ShaderNodeMixRGB")
occlusion = nodes.new("ShaderNodeMixRGB")
occlusion.blend_type = "MULTIPLY"
occlusion.inputs[0].default_value = 1
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
links.new(secondary_mix.outputs["Color"], occlusion.inputs[1])
links.new(ao_channels.outputs["Red"], occlusion.inputs[2])
links.new(occlusion.outputs["Color"], shader.inputs["Base Color"])
links.new(reflection.outputs["Color"], reflection_channels.inputs["Color"])
links.new(reflection_channels.outputs["Red"], shader.inputs["Metallic"])
links.new(reflection_channels.outputs["Green"], shader.inputs["Roughness"])
links.new(normal.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
links.new(shader.outputs["BSDF"], output_node.inputs["Surface"])
material["adapter"] = "MM_BakedStencil_01"
material["pattern_id"] = 0
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print(json.dumps({"status": "candidate", "adapter": "MM_BakedStencil_01", "objects": len(objects), "patternId": 0}, ensure_ascii=False))
