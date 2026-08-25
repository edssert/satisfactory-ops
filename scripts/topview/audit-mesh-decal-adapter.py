"""Mesh Decal 전사 결과가 receiver 색·UnderlyingUV·decal normal을 보존하는지 검사한다."""
import json
import bpy

receiver = bpy.data.objects.get("MeshDecalReceiver")
overlay = bpy.data.objects.get("MeshDecalOverlay")
errors = []
if receiver is None or overlay is None:
    errors.append("objects")
else:
    if overlay.data.uv_layers.get("UnderlyingUV") is None: errors.append("underlying-uv")
    materials = [material for material in overlay.data.materials if material]
    if not materials or any(material.get("adapter") != "Decal_Normal" for material in materials): errors.append("adapter-materials")
    if any(not any(node.type == "NORMAL_MAP" for node in material.node_tree.nodes) for material in materials): errors.append("normal-map")
    if not all(material.get("underlying_material") for material in materials): errors.append("underlying-material")
result = {"status": "fail" if errors else "pass", "adapter": "Decal_Normal", "errors": errors,
          "receiverPolygons": len(receiver.data.polygons) if receiver else 0,
          "decalPolygons": len(overlay.data.polygons) if overlay else 0,
          "materials": len(overlay.data.materials) if overlay else 0}
print(json.dumps(result, ensure_ascii=False))
if errors:
    raise RuntimeError(f"MeshDecal audit failed: {', '.join(errors)}")
