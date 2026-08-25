"""resolved scene의 state-mask 재질이 Blender emission color/strength에 연결됐는지 검사한다."""

import json
import sys
from pathlib import Path

import bpy


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
scene = json.loads(Path(args[0]).resolve().read_text(encoding="utf-8"))
errors = []
for material_name in scene["materials"].get("stateMask", {}):
    materials = [material for material in bpy.data.materials
                 if material.name == material_name or material.name.startswith(f"{material_name}.")]
    if not materials:
        errors.append(f"missing:{material_name}")
        continue
    for material in materials:
        state_node = material.node_tree.nodes.get("StateEmissionColor") if material.use_nodes else None
        shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None) if material.use_nodes else None
        if state_node is None or shader is None or not shader.inputs["Emission Strength"].is_linked:
            errors.append(f"unlinked:{material.name}")
result = {"status": "fail" if errors else "pass", "stateMaterials": len(scene["materials"].get("stateMask", {})), "errors": errors}
print(json.dumps(result, ensure_ascii=False))
if errors:
    raise RuntimeError(f"Emission audit failed: {', '.join(errors)}")
