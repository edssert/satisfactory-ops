"""Foundation adapter가 mirrored UV·slot16·PatternID 0·clearance 정렬을 보존하는지 검사한다."""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
contract = json.loads(Path(args[0]).resolve().read_text(encoding="utf-8")) if args else None
obj = next((item for item in bpy.context.scene.objects if item.type == "MESH" and item.name.startswith("LOD0")), None)
errors = []
if obj is None:
    errors.append("mesh")
else:
    material = next((slot.material for slot in obj.material_slots if slot.material), None)
    if material is None or material.get("adapter") != "MM_BakedStencil_01" or material.get("pattern_id") != 0:
        errors.append("adapter-metadata")
    textures = [node for node in material.node_tree.nodes if node.type == "TEX_IMAGE"] if material else []
    if len(textures) != 4 or any(node.extension != "MIRROR" for node in textures):
        errors.append("mirrored-textures")
    primary = material.node_tree.nodes.get("FoundationPrimarySlot16") if material else None
    secondary = material.node_tree.nodes.get("FoundationSecondarySlot16") if material else None
    if contract and primary and secondary:
        expected_primary = contract["foundationColorSlot"]["primary"]
        expected_secondary = contract["foundationColorSlot"]["secondary"]
        actual_primary = primary.outputs[0].default_value
        actual_secondary = secondary.outputs[0].default_value
        for channel, key in enumerate(("R", "G", "B")):
            if abs(actual_primary[channel] - expected_primary[key]) > 1e-6: errors.append(f"primary-{key}")
            if abs(actual_secondary[channel] - expected_secondary[key]) > 1e-6: errors.append(f"secondary-{key}")
    if contract and contract.get("foundationInstances"):
        transform = contract["foundationInstances"][0]["transform"]
        x, y, z, w = transform["rotationQuat"]
        if (obj.location - Vector(transform["translationM"])).length > 1e-5:
            errors.append("runtime-translation")
        if obj.rotation_quaternion.rotation_difference(Quaternion((w, x, y, z))).angle > 1e-5:
            errors.append("runtime-rotation")
        if (obj.scale - Vector(transform["scale"])).length > 1e-5:
            errors.append("runtime-scale")
result = {"status": "fail" if errors else "pass", "adapter": "MM_BakedStencil_01", "errors": errors}
print(json.dumps(result, ensure_ascii=False))
if errors:
    raise RuntimeError(f"Foundation audit failed: {', '.join(errors)}")
