"""BuildHologram adapter가 원본 메시·재질값·clearance·port transform을 보존하는지 검사한다."""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion, Vector
import math


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
contract = json.loads(Path(args[0]).resolve().read_text(encoding="utf-8"))
errors = []
objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if contract.get("$schemaVersion") == 2:
    for index, entry in enumerate(contract.get("technicalMeshes", [])):
        matches = [obj for obj in objects if obj.get("runtime_technical_id") == entry["id"]]
        if not matches:
            errors.append(f"runtime-technical-{index}-missing")
            continue
        transform = entry["transform"]
        x, y, z, w = transform["rotationQuat"]
        expected_rotation = Quaternion((w, x, y, z))
        for obj in matches:
            if (obj.location - Vector(transform["translationM"])).length > 1e-5:
                errors.append(f"runtime-technical-{index}-translation")
            if obj.rotation_quaternion.rotation_difference(expected_rotation).angle > 1e-5:
                errors.append(f"runtime-technical-{index}-rotation")
            if (obj.scale - Vector(transform["scale"])).length > 1e-5:
                errors.append(f"runtime-technical-{index}-scale")
            material = next((slot.material for slot in obj.material_slots if slot.material), None)
            if material is None or material.get("adapter") != "BuildHologram":
                errors.append(f"runtime-technical-{index}-material")
            elif material.get("depth_test_adapter") not in (None, "natural-scene-depth"):
                errors.append(f"runtime-technical-{index}-depth")
        if entry["role"] == "clearance":
            for obj in matches:
                material = next((slot.material for slot in obj.material_slots if slot.material), None)
                if not material or not material.get("clearance_uv_shader"):
                    errors.append(f"runtime-technical-{index}-clearance-uv-shader")
                elif len(json.loads(material.get("source_masks", "[]"))) != 3:
                    errors.append(f"runtime-technical-{index}-clearance-source-masks")
            if index == next((candidate for candidate, item in enumerate(contract["technicalMeshes"]) if item["role"] == "clearance"), -1):
                points = [obj.matrix_world @ Vector(corner) for obj in matches for corner in obj.bound_box]
                actual_minimum = [min(point[axis] for point in points) for axis in range(3)]
                actual_maximum = [max(point[axis] for point in points) for axis in range(3)]
                for axis in range(3):
                    if abs(actual_minimum[axis] - contract["clearance"]["minimum"][axis]) > 1e-3:
                        errors.append(f"runtime-main-clearance-min-{axis}")
                    if abs(actual_maximum[axis] - contract["clearance"]["maximum"][axis]) > 1e-3:
                        errors.append(f"runtime-main-clearance-max-{axis}")
    result = {
        "status": "fail" if errors else "pass",
        "adapter": "BuildHologram",
        "errors": errors,
        "runtimeProbe": contract["runtimeProbe"],
        "technicalMeshes": len(contract.get("technicalMeshes", [])),
        "occlusionPolicy": contract["visualization"].get("occlusionPolicy"),
    }
    print(json.dumps(result, ensure_ascii=False))
    if errors:
        raise RuntimeError(f"BuildHologram audit failed: {', '.join(errors)}")
    sys.exit(0)
sources = {obj.get("source_mesh") for obj in objects}
if not {"ClearanceBox", "Input", "Arrows"}.issubset(sources): errors.append("source-meshes")
clearance = [obj for obj in objects if obj.get("source_mesh") == "ClearanceBox"]
if not clearance:
    errors.append("clearance")
else:
    points = [obj.matrix_world @ Vector(corner) for obj in clearance for corner in obj.bound_box]
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    for index in range(3):
        if abs(minimum[index] - contract["clearance"]["minimum"][index]) > 1e-4: errors.append(f"clearance-min-{index}")
        if abs(maximum[index] - contract["clearance"]["maximum"][index]) > 1e-4: errors.append(f"clearance-max-{index}")
for port in contract["ports"]:
    port_objects = [obj for obj in objects if obj.get("port_id") == port["id"]]
    if not port_objects: errors.append(f"port-{port['id']}")
    if port_objects:
        source_rotation = Euler(tuple(math.radians(value) for value in port["rotationEulerDeg"]), "XYZ").to_quaternion()
        outward = (source_rotation @ Vector((1, 0, 0))).normalized()
        expected_anchor = Vector(port["positionM"])
        frame_contract = contract["visualization"]["frameMesh"]
        arrow_contract = contract["visualization"]["arrowMesh"]
        frame_origin = Vector(frame_contract["authoredBounds"]["blenderOriginM"])
        frame_extent = Vector(frame_contract["authoredBounds"]["blenderExtentM"])
        arrow_origin = Vector(arrow_contract["authoredBounds"]["blenderOriginM"])
        arrow_extent = Vector(arrow_contract["authoredBounds"]["blenderExtentM"])
        placement = contract["visualization"].get("placement", {})
        if placement.get("status") != "verified-pdb-native":
            errors.append(f"port-placement-unresolved-{port['id']}")
            continue
        frame_relative = Vector(placement["frame"]["relativeLocationBlenderM"])
        arrow_placement = placement["inputArrow"] if port["direction"] == "input" else placement["outputArrow"]
        arrow_relative = Vector(arrow_placement["relativeLocationBlenderM"])
        for obj in port_objects:
            if not obj.get("source_port_anchored"):
                errors.append(f"port-source-anchor-{port['id']}")
        faces = [obj for obj in port_objects if obj.get("source_mesh") == "Input"]
        arrows = [obj for obj in port_objects if obj.get("source_mesh") == "Arrows"]
        if not faces or not arrows:
            errors.append(f"port-marker-parts-{port['id']}")
        else:
            face = faces[0]
            face_center = sum((face.matrix_world @ Vector(corner) for corner in face.bound_box), Vector()) / 8
            local_face_center = sum((Vector(corner) for corner in face.bound_box), Vector()) / 8
            local_face_extent = Vector(tuple((max(corner[axis] for corner in face.bound_box) - min(corner[axis] for corner in face.bound_box)) / 2 for axis in range(3)))
            if (local_face_center - frame_origin).length > 1e-4 or (local_face_extent - frame_extent).length > 1e-4:
                errors.append(f"port-frame-authored-bounds-{port['id']}")
            expected_face_center = expected_anchor + source_rotation @ (frame_relative + frame_origin)
            if (face_center - expected_face_center).length > 1e-4:
                errors.append(f"port-face-position-{port['id']}")
            face_normal = face.matrix_world.to_quaternion() @ Vector((1, 0, 0))
            if face_normal.dot(outward) < 0.999:
                errors.append(f"port-face-rotation-{port['id']}")
            for obj in arrows:
                arrow_direction = obj.matrix_world.to_quaternion() @ Vector((1, 0, 0))
                arrow_center = sum((obj.matrix_world @ Vector(corner) for corner in obj.bound_box), Vector()) / 8
                local_arrow_center = sum((Vector(corner) for corner in obj.bound_box), Vector()) / 8
                local_arrow_extent = Vector(tuple((max(corner[axis] for corner in obj.bound_box) - min(corner[axis] for corner in obj.bound_box)) / 2 for axis in range(3)))
                if (local_arrow_center - arrow_origin).length > 1e-4 or (local_arrow_extent - arrow_extent).length > 1e-4:
                    errors.append(f"port-arrow-authored-bounds-{port['id']}")
                expected_arrow_center = expected_anchor + source_rotation @ arrow_relative + obj.matrix_world.to_quaternion() @ arrow_origin
                if (arrow_center - expected_arrow_center).length > 1e-4:
                    errors.append(f"port-arrow-position-{port['id']}")
                expected_direction = -outward if port["direction"] == "input" else outward
                if arrow_direction.dot(expected_direction) < 0.999:
                    errors.append(f"port-arrow-direction-{port['id']}")
materials = {material.name: material for material in bpy.data.materials if material.get("adapter") == "BuildHologram"}
required_materials = ["Clearance_Inst"]
if any(port["direction"] == "input" for port in contract["ports"]): required_materials.append("Hologram_Input")
if any(port["direction"] == "output" for port in contract["ports"]): required_materials.append("Hologram_Output")
for name in required_materials:
    if not any(material_name.startswith(name) for material_name in materials): errors.append(f"material-{name}")
input_material = next((material for name, material in materials.items() if name.startswith("Hologram_Input")), None)
if input_material:
    source = contract["visualization"]["materials"]["input"]
    if input_material.get("source_material") != source["objectPath"]:
        errors.append("input-material-source")
    if input_material.get("source_parent") != source["parent"]["objectPath"]:
        errors.append("input-material-parent")
    if not input_material.get("depth_test_disabled") or not source["parent"]["properties"].get("bDisableDepthTest"):
        errors.append("input-depth-test-contract")
    if input_material.get("depth_test_adapter") != "native":
        errors.append("input-depth-test-runtime-unimplemented")
result = {"status": "fail" if errors else "pass", "adapter": "BuildHologram", "errors": errors, "sourceMeshes": sorted(value for value in sources if value)}
print(json.dumps(result, ensure_ascii=False))
if errors:
    raise RuntimeError(f"BuildHologram audit failed: {', '.join(errors)}")
