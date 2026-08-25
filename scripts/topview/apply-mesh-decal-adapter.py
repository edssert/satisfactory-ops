"""Normal-only Mesh Decal에 아래 수신 면의 재질·UV를 전사하고 decal normal을 합성한다."""

import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 3:
    raise ValueError("출력 BLEND, decal normal texture, decal material prefix가 필요합니다.")
output, normal_path = Path(args[0]).resolve(), Path(args[1]).resolve()
decal_prefix = args[2].casefold()
source = next((obj for obj in bpy.context.scene.objects if obj.type == "MESH"
               and any(slot.material and slot.material.name.casefold().startswith(decal_prefix) for slot in obj.material_slots)
               and any(slot.material and not slot.material.name.casefold().startswith(decal_prefix) for slot in obj.material_slots)), None)
if source is None:
    raise RuntimeError("Normal Mesh Decal 수신 메시를 찾지 못했습니다.")
decal_indices = {index for index, slot in enumerate(source.material_slots)
                 if slot.material and slot.material.name.casefold().startswith(decal_prefix)}
base_indices = set(range(len(source.material_slots))) - decal_indices


def filtered_copy(name, keep_indices):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.material_index not in keep_indices], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


receiver = filtered_copy("MeshDecalReceiver", base_indices)
decal = filtered_copy("MeshDecalOverlay", decal_indices)
source.hide_render = True
base_polygons = [polygon for polygon in source.data.polygons if polygon.material_index in base_indices]
tree = BVHTree.FromPolygons(
    [vertex.co for vertex in source.data.vertices],
    [tuple(polygon.vertices) for polygon in base_polygons],
    all_triangles=False,
)
source_uv = source.data.uv_layers.active
underlying = decal.data.uv_layers.get("UVMap.007") or decal.data.uv_layers.new(name="UnderlyingUV")
underlying.name = "UnderlyingUV"
material_for_index = {}
decal.data.materials.clear()


def adapted_material(base_material, material_index):
    material = base_material.copy()
    material.name = f"MeshDecalInherited_{material_index}_{base_material.name}"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    underlying_uv = nodes.new("ShaderNodeUVMap")
    underlying_uv.uv_map = "UnderlyingUV"
    for node in nodes:
        if node.type == "TEX_IMAGE":
            links.new(underlying_uv.outputs["UV"], node.inputs["Vector"])
    decal_uv = nodes.new("ShaderNodeUVMap")
    decal_uv.uv_map = "UVMap"
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(normal_path), check_existing=True)
    texture.image.colorspace_settings.name = "Non-Color"
    separate = nodes.new("ShaderNodeSeparateColor")
    invert = nodes.new("ShaderNodeInvert")
    combine = nodes.new("ShaderNodeCombineColor")
    decal_normal = nodes.new("ShaderNodeNormalMap")
    links.new(decal_uv.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Red"], combine.inputs["Red"])
    links.new(separate.outputs["Green"], invert.inputs["Color"])
    links.new(invert.outputs["Color"], combine.inputs["Green"])
    links.new(separate.outputs["Blue"], combine.inputs["Blue"])
    links.new(combine.outputs["Color"], decal_normal.inputs["Color"])
    for shader in (node for node in nodes if node.type == "BSDF_PRINCIPLED"):
        socket = shader.inputs["Normal"]
        if socket.is_linked:
            base_normal = socket.links[0].from_socket
            links.remove(socket.links[0])
            add = nodes.new("ShaderNodeVectorMath")
            add.operation = "ADD"
            subtract = nodes.new("ShaderNodeVectorMath")
            subtract.operation = "SUBTRACT"
            subtract.inputs[1].default_value = (0, 0, 1)
            normalize = nodes.new("ShaderNodeVectorMath")
            normalize.operation = "NORMALIZE"
            links.new(base_normal, add.inputs[0])
            links.new(decal_normal.outputs["Normal"], add.inputs[1])
            links.new(add.outputs["Vector"], subtract.inputs[0])
            links.new(subtract.outputs["Vector"], normalize.inputs[0])
            links.new(normalize.outputs["Vector"], socket)
        else:
            links.new(decal_normal.outputs["Normal"], socket)
    material["adapter"] = "Decal_Normal"
    material["underlying_material"] = base_material.name
    return material


for polygon in decal.data.polygons:
    nearest = tree.find_nearest(polygon.center)
    if nearest[2] is None:
        continue
    base_polygon = base_polygons[nearest[2]]
    base_uvs = [source_uv.data[index].uv for index in base_polygon.loop_indices]
    average_uv = sum((Vector(value) for value in base_uvs), Vector((0, 0))) / len(base_uvs)
    for loop_index in polygon.loop_indices:
        underlying.data[loop_index].uv = average_uv
    material_index = base_polygon.material_index
    if material_index not in material_for_index:
        base_material = source.material_slots[material_index].material
        material = adapted_material(base_material, material_index)
        decal.data.materials.append(material)
        material_for_index[material_index] = len(decal.data.materials) - 1
    polygon.material_index = material_for_index[material_index]

output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print(json.dumps({"status": "candidate", "adapter": "Decal_Normal", "receiverPolygons": len(receiver.data.polygons), "decalPolygons": len(decal.data.polygons), "inheritedMaterials": len(material_for_index)}, ensure_ascii=False))
