"""CUE4Parse GLB를 실축 점유영역과 합성해 결정적 Blender 탑뷰를 생성한다.

사용: blender --background --python scripts/topview/render-topview.py -- --help
종료: 성공 0, 인자·입력·렌더 오류는 비영(Blender/Python 표준 종료 코드).
"""

from __future__ import annotations

import argparse
from collections import defaultdict, deque
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def canonical_material_key(name: str) -> str:
    return re.sub(r"\.\d{3}$", "", name.casefold())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--scene")
    parser.add_argument("--glb", nargs="+")
    parser.add_argument("--component-transform", action="append", default=[])
    parser.add_argument("--indicator-glb")
    parser.add_argument("--indicator-location", nargs=3, type=float)
    parser.add_argument("--indicator-yaw", type=float, default=0.0)
    parser.add_argument("--material-albedo", action="append", default=[])
    parser.add_argument("--material-ao", action="append", default=[])
    parser.add_argument("--material-normal", action="append", default=[])
    parser.add_argument("--material-reflection", action="append", default=[])
    parser.add_argument("--material-alpha", action="append", default=[])
    parser.add_argument("--material-pbr", action="append", default=[])
    parser.add_argument("--material-normal-only", action="append", default=[])
    parser.add_argument("--material-paint", action="append", default=[])
    parser.add_argument("--material-base-color", action="append", default=[])
    parser.add_argument("--material-emissive-accent", action="append", default=[])
    parser.add_argument("--material-state-mask", action="append", default=[])
    parser.add_argument("--state-color", default="#18ff45")
    parser.add_argument("--state-color-override")
    parser.add_argument("--state-strength", type=float, default=4.0)
    parser.add_argument("--footprint", nargs=2, type=float)
    parser.add_argument("--footprint-height", type=float, default=0.0)
    parser.add_argument("--footprint-ground-z", type=float)
    parser.add_argument("--footprint-center", nargs=2, type=float, default=(0.0, 0.0))
    parser.add_argument("--display-yaw", type=float, default=0.0)
    parser.add_argument("--camera-tilt", type=float, default=0.0)
    parser.add_argument("--display-yaw-override", type=float)
    parser.add_argument("--camera-tilt-override", type=float)
    parser.add_argument("--hide-corners", action="store_true")
    parser.add_argument("--diagnostic-allow-incomplete-vat", action="store_true")
    parser.add_argument("--harness-token")
    parser.add_argument("--ground-ao", action="store_true")
    parser.add_argument("--bloom", action="store_true")
    parser.add_argument("--sun", action="store_true")
    parser.add_argument("--key-energy", type=float, default=1.9)
    parser.add_argument("--fill-energy", type=float, default=0.72)
    parser.add_argument("--world-strength", type=float, default=0.24)
    parser.add_argument("--exposure", type=float, default=0.0)
    parser.set_defaults(emissive_geometry_selectors=[], opacity_geometry_selectors=[])
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(script_args)
    args.camera_projection = "orthographic-unverified"
    args.corner_envelope = None
    args.runtime_top_validation = False
    return apply_scene_config(args) if args.scene else args


def apply_scene_config(args: argparse.Namespace) -> argparse.Namespace:
    scene_path = Path(args.scene).resolve()
    config = json.loads(scene_path.read_text(encoding="utf-8"))
    repository_root = scene_path.parents[3]

    def resolve_source(raw_path: str) -> str:
        path = Path(raw_path)
        return str(path.resolve() if path.is_absolute() else (repository_root / path).resolve())

    body_components = [
        component for component in config["components"]
        if component.get("renderMode") == "body" and component.get("enabled", True)
    ]
    for component in body_components:
        if component.get("vatPose"):
            component["vatPose"]["positionData"] = resolve_source(component["vatPose"]["positionData"])
            component["vatPose"]["rotationData"] = resolve_source(component["vatPose"]["rotationData"])
    args.body_component_specs = body_components
    args.pending_vat_components = [
        component["id"] for component in body_components
        if component.get("vatPose", {}).get("status") not in (None, "applied", "base-pose-verified")
    ]
    indicator_components = [
        component for component in config["components"]
        if component.get("renderMode") == "production-indicator" and component.get("enabled", True)
    ]
    if not body_components:
        raise ValueError(f"{scene_path}: 활성 본체 구성품이 없습니다.")
    if len(indicator_components) > 1:
        raise ValueError(f"{scene_path}: 생산 표시등은 현재 하나만 지원합니다.")

    args.glb = [resolve_source(component["path"]) for component in body_components]
    args.component_transform = [
        f"{index}={','.join(str(value) for value in component.get('transform', [0, 0, 0, 0]))}"
        for index, component in enumerate(body_components)
    ]
    if indicator_components:
        indicator = indicator_components[0]
        transform = indicator.get("transform", [0, 0, 0, 0])
        args.indicator_glb = resolve_source(indicator["path"])
        args.indicator_location = transform[:3]
        args.indicator_yaw = transform[3]

    material = config["materials"]

    def material_entries(key: str) -> list[str]:
        return [f"{name}={resolve_source(path)}" for name, path in material.get(key, {}).items()]

    args.material_albedo = material_entries("albedo")
    args.material_ao = material_entries("ao")
    args.material_normal = material_entries("normal")
    args.material_reflection = material_entries("reflection")
    args.material_state_mask = material_entries("stateMask")
    args.material_alpha = material.get("alpha", [])
    args.material_pbr = material.get("pbr", [])
    args.material_normal_only = material.get("normalOnly", [])
    args.material_paint = [
        f"{name}={colors['primary']},{colors['secondary']}"
        for name, colors in material.get("paint", {}).items()
    ]
    args.material_base_color = [f"{name}={color}" for name, color in material.get("baseColor", {}).items()]
    args.material_emissive_accent = material.get("emissiveAccent", [])
    args.emissive_geometry_selectors = material.get("emissiveGeometrySelectors", [])
    args.opacity_geometry_selectors = material.get("opacityGeometrySelectors", [])
    state = material.get("state", {})
    args.state_color = args.state_color_override if args.state_color_override is not None else state.get("color", args.state_color)
    args.state_strength = state.get("strength", args.state_strength)

    footprint = config["footprint"]
    if footprint.get("cornerEnvelope") != "game-hard-clearance":
        raise ValueError(
            f"{scene_path}: 점유 코너는 game-hard-clearance만 허용합니다. "
            "시각 메시 외곽으로 임의 확장할 수 없습니다."
        )
    args.footprint = [footprint["widthM"], footprint["lengthM"]]
    args.footprint_height = footprint["heightM"]
    args.footprint_ground_z = footprint.get("groundZM")
    args.footprint_center = footprint.get("centerM", [0, 0])
    args.corner_envelope = footprint["cornerEnvelope"]
    camera = config["camera"]
    args.camera_projection = camera.get("projection", "orthographic-unverified")
    args.display_yaw = args.display_yaw_override if args.display_yaw_override is not None else camera.get("displayYawDeg", 0)
    args.camera_tilt = args.camera_tilt_override if args.camera_tilt_override is not None else camera.get("frontTiltDeg", 0)
    args.runtime_top_validation = (
        args.camera_projection == "orthographic-top"
        and args.camera_tilt_override is None
    )
    if args.runtime_top_validation and args.harness_token != "validated-render-v1":
        raise ValueError(
            f"{scene_path}: 제품 탑뷰 직접 렌더를 금지합니다. "
            "scripts/topview/run-validated-render.mjs 하네스를 사용하십시오."
        )
    lighting = config["lighting"]
    args.ground_ao = lighting.get("groundAo", False)
    args.bloom = lighting.get("bloom", False)
    args.sun = lighting.get("sun", False)
    args.key_energy = lighting.get("keyEnergy", args.key_energy)
    args.fill_energy = lighting.get("fillEnergy", args.fill_energy)
    args.world_strength = lighting.get("worldStrength", args.world_strength)
    args.exposure = lighting.get("exposure", args.exposure)
    return args


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def apply_vat_idle_pose(component: dict, imported: list[bpy.types.Object]) -> None:
    pose = component.get("vatPose")
    if not pose or pose.get("status") != "applied":
        return
    position_data = json.loads(Path(pose["positionData"]).read_text(encoding="utf-8"))
    rotation_data = json.loads(Path(pose["rotationData"]).read_text(encoding="utf-8"))
    if position_data.get("Width") != 1 or position_data.get("Height") != 9 or len(position_data.get("pixels", [])) != 9:
        raise RuntimeError(f"{component['id']}: Idle POS는 1×9여야 합니다.")
    if rotation_data.get("Width") != 1 or rotation_data.get("Height") != 9 or len(rotation_data.get("pixels", [])) != 9:
        raise RuntimeError(f"{component['id']}: Idle Quat는 1×9여야 합니다.")
    if pose.get("allowQuaternionDeformation"):
        raise RuntimeError(f"{component['id']}: 현재 구현은 quaternion 변형을 허용하지 않습니다.")

    scale = float(pose["upscale"]) / 100.0
    total_groups = {}
    for obj in imported:
        if obj.type != "MESH" or not any(slot.material and slot.material.name.casefold() == "mi_vat_smelter" for slot in obj.material_slots):
            continue
        uv_layer = obj.data.uv_layers.get(pose["lookupUvLayer"])
        if uv_layer is None:
            raise RuntimeError(f"{component['id']}: {pose['lookupUvLayer']} 누락")
        vertex_rows: dict[int, int] = {}
        for polygon in obj.data.polygons:
            for loop_index in polygon.loop_indices:
                vertex_index = obj.data.loops[loop_index].vertex_index
                lookup = uv_layer.data[loop_index].uv.y
                row = round(pose["rowOffset"] + pose["rowScale"] * lookup)
                previous = vertex_rows.get(vertex_index)
                if previous is not None and previous != row:
                    raise RuntimeError(f"{component['id']}: 정점 {vertex_index} VAT 행 불일치 {previous}/{row}")
                vertex_rows[vertex_index] = row
        for vertex_index, row in vertex_rows.items():
            if row < 0 or row >= len(position_data["pixels"]):
                raise RuntimeError(f"{component['id']}: VAT 행 범위 오류 {row}")
            red, green, blue, _ = position_data["pixels"][row]
            offset = Vector((red, -green, blue)) * scale
            obj.data.vertices[vertex_index].co += offset
            group = total_groups.setdefault(row, {"vertices": 0, "offset": [round(value, 6) for value in offset]})
            group["vertices"] += 1
    if len(total_groups) != pose["expectedGroups"]:
        raise RuntimeError(f"{component['id']}: VAT 그룹 {len(total_groups)}개, 기대 {pose['expectedGroups']}개")
    print(f"VAT_POSE={component['id']} GROUPS={json.dumps(total_groups, sort_keys=True)}")


def scaled(color: tuple[float, float, float], factor: float) -> tuple[float, float, float, float]:
    return tuple(min(1.0, channel * factor) for channel in color) + (1.0,)


def palette(material_name: str) -> tuple[float, float, float]:
    name = material_name.lower()
    if "decalcolor" in name:
        return (0.95, 0.28, 0.025)
    if "decal_normal" in name:
        return (0.018, 0.032, 0.046)
    if "biomass" in name:
        return (0.20, 0.28, 0.34)
    if "prodlight" in name or "productionlight" in name:
        return (0.015, 1.0, 0.08)
    if "va_" in name or "vat" in name:
        return (0.78, 0.24, 0.035)
    return (0.085, 0.13, 0.19)


def parse_material_map(entries: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for entry in entries:
        name, separator, raw_path = entry.partition("=")
        if not separator:
            raise ValueError(f"재질 매핑은 material=path 형식이어야 합니다: {entry}")
        result[name.casefold()] = Path(raw_path).resolve()
    return result


def parse_component_transforms(entries: list[str]) -> dict[int, tuple[float, float, float, float]]:
    result: dict[int, tuple[float, float, float, float]] = {}
    for entry in entries:
        raw_index, separator, raw_values = entry.partition("=")
        values = raw_values.split(",") if separator else []
        if not separator or len(values) != 4:
            raise ValueError(f"컴포넌트 변환은 index=x,y,z,yaw 형식이어야 합니다: {entry}")
        result[int(raw_index)] = tuple(float(value) for value in values)
    return result


def srgb_channel_to_linear(value: int) -> float:
    channel = value / 255
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def parse_hex_color(value: str) -> tuple[float, float, float, float]:
    raw = value.removeprefix("#")
    if len(raw) != 6:
        raise ValueError(f"색은 #rrggbb 형식이어야 합니다: {value}")
    channels = [int(raw[index:index + 2], 16) for index in (0, 2, 4)]
    return tuple(srgb_channel_to_linear(channel) for channel in channels) + (1.0,)


def parse_paint_map(entries: list[str]) -> dict[str, tuple[tuple[float, float, float, float], tuple[float, float, float, float]]]:
    result = {}
    for entry in entries:
        name, separator, raw_colors = entry.partition("=")
        colors = raw_colors.split(",") if separator else []
        if not separator or len(colors) != 2:
            raise ValueError(f"도색 매핑은 material=#primary,#secondary 형식이어야 합니다: {entry}")
        result[name.casefold()] = (parse_hex_color(colors[0]), parse_hex_color(colors[1]))
    return result


def parse_color_map(entries: list[str]) -> dict[str, tuple[float, float, float, float]]:
    result = {}
    for entry in entries:
        name, separator, raw_color = entry.partition("=")
        if not separator:
            raise ValueError(f"기본색 매핑은 material=#rrggbb 형식이어야 합니다: {entry}")
        result[name.casefold()] = parse_hex_color(raw_color)
    return result


def add_image_node(nodes: bpy.types.Nodes, path: Path, *, non_color: bool = False) -> bpy.types.Node:
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def add_directx_normal(nodes: bpy.types.Nodes, links: bpy.types.NodeLinks, path: Path):
    normal_image = add_image_node(nodes, path, non_color=True)
    normal_channels = nodes.new("ShaderNodeSeparateColor")
    invert_green = nodes.new("ShaderNodeInvert")
    combine_normal = nodes.new("ShaderNodeCombineColor")
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(normal_image.outputs["Color"], normal_channels.inputs["Color"])
    links.new(normal_channels.outputs["Red"], combine_normal.inputs["Red"])
    links.new(normal_channels.outputs["Green"], invert_green.inputs["Color"])
    links.new(invert_green.outputs["Color"], combine_normal.inputs["Green"])
    links.new(normal_channels.outputs["Blue"], combine_normal.inputs["Blue"])
    links.new(combine_normal.outputs["Color"], normal_map.inputs["Color"])
    return normal_map.outputs["Normal"]


def apply_pbr_material(
    material: bpy.types.Material,
    albedo_paths: dict[str, Path],
    ao_paths: dict[str, Path],
    normal_paths: dict[str, Path],
    reflection_paths: dict[str, Path],
    alpha_materials: set[str],
    paint_colors: dict[str, tuple[tuple[float, float, float, float], tuple[float, float, float, float]]],
    base_colors: dict[str, tuple[float, float, float, float]],
    emissive_accent_materials: set[str],
    normal_only_materials: set[str],
) -> None:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    material_key = canonical_material_key(material.name)
    if material_key in normal_only_materials:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        links.new(transparent.outputs["BSDF"], output.inputs["Surface"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        return
    albedo_path = albedo_paths.get(material_key)
    ao_path = ao_paths.get(material_key)
    normal_path = normal_paths.get(material_key)
    reflection_path = reflection_paths.get(material_key)

    if albedo_path:
        albedo = add_image_node(nodes, albedo_path)
        base_color = albedo.outputs["Color"]
    else:
        albedo = None
        base = nodes.new("ShaderNodeRGB")
        base.outputs[0].default_value = base_colors.get(material_key, (*palette(material.name), 1))
        base_color = base.outputs[0]

    if ao_path:
        ao = add_image_node(nodes, ao_path, non_color=True)
        ao_channels = nodes.new("ShaderNodeSeparateColor")
        links.new(ao.outputs["Color"], ao_channels.inputs["Color"])
        if albedo is not None and material_key in paint_colors:
            primary_color, secondary_color = paint_colors[material_key]
            primary = nodes.new("ShaderNodeRGB")
            secondary = nodes.new("ShaderNodeRGB")
            primary.outputs[0].default_value = primary_color
            secondary.outputs[0].default_value = secondary_color
            primary_tint = nodes.new("ShaderNodeMixRGB")
            primary_tint.blend_type = "MULTIPLY"
            primary_tint.inputs[0].default_value = 1.0
            secondary_tint = nodes.new("ShaderNodeMixRGB")
            secondary_tint.blend_type = "MULTIPLY"
            secondary_tint.inputs[0].default_value = 1.0
            primary_mix = nodes.new("ShaderNodeMixRGB")
            secondary_mix = nodes.new("ShaderNodeMixRGB")
            links.new(albedo.outputs["Color"], primary_tint.inputs[1])
            links.new(primary.outputs[0], primary_tint.inputs[2])
            links.new(albedo.outputs["Color"], secondary_tint.inputs[1])
            links.new(secondary.outputs[0], secondary_tint.inputs[2])
            links.new(ao_channels.outputs["Green"], primary_mix.inputs[0])
            links.new(base_color, primary_mix.inputs[1])
            links.new(primary_tint.outputs["Color"], primary_mix.inputs[2])
            links.new(ao_channels.outputs["Blue"], secondary_mix.inputs[0])
            links.new(primary_mix.outputs["Color"], secondary_mix.inputs[1])
            links.new(secondary_tint.outputs["Color"], secondary_mix.inputs[2])
            base_color = secondary_mix.outputs["Color"]
        ao_multiply = nodes.new("ShaderNodeMixRGB")
        ao_multiply.blend_type = "MULTIPLY"
        ao_multiply.inputs[0].default_value = 1.0
        links.new(base_color, ao_multiply.inputs[1])
        links.new(ao_channels.outputs["Red"], ao_multiply.inputs[2])
        base_color = ao_multiply.outputs["Color"]
    links.new(base_color, bsdf.inputs["Base Color"])

    if normal_path:
        normal_output = add_directx_normal(nodes, links, normal_path)
        links.new(normal_output, bsdf.inputs["Normal"])

    if albedo and material_key in emissive_accent_materials:
        accent_channels = nodes.new("ShaderNodeSeparateColor")
        orange_difference = nodes.new("ShaderNodeMath")
        orange_difference.operation = "SUBTRACT"
        orange_threshold = nodes.new("ShaderNodeMath")
        orange_threshold.operation = "GREATER_THAN"
        orange_threshold.inputs[1].default_value = 0.12
        hot_tint = nodes.new("ShaderNodeMixRGB")
        hot_tint.blend_type = "MULTIPLY"
        hot_tint.inputs[0].default_value = 1.0
        hot_tint.inputs[2].default_value = (1.25, 1.08, 0.9, 1)
        masked_emission = nodes.new("ShaderNodeMixRGB")
        masked_emission.inputs[1].default_value = (0, 0, 0, 1)
        links.new(albedo.outputs["Color"], accent_channels.inputs["Color"])
        links.new(accent_channels.outputs["Red"], orange_difference.inputs[0])
        links.new(accent_channels.outputs["Blue"], orange_difference.inputs[1])
        links.new(orange_difference.outputs[0], orange_threshold.inputs[0])
        links.new(albedo.outputs["Color"], hot_tint.inputs[1])
        links.new(orange_threshold.outputs[0], masked_emission.inputs[0])
        links.new(hot_tint.outputs["Color"], masked_emission.inputs[2])
        links.new(masked_emission.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.15

    if reflection_path:
        reflection = add_image_node(nodes, reflection_path, non_color=True)
        channels = nodes.new("ShaderNodeSeparateColor")
        emission_scale = nodes.new("ShaderNodeMath")
        emission_scale.operation = "MULTIPLY"
        emission_scale.inputs[1].default_value = 7.5
        links.new(reflection.outputs["Color"], channels.inputs["Color"])
        links.new(channels.outputs["Red"], bsdf.inputs["Metallic"])
        links.new(channels.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(base_color, bsdf.inputs["Emission Color"])
        links.new(channels.outputs["Blue"], emission_scale.inputs[0])
        links.new(emission_scale.outputs[0], bsdf.inputs["Emission Strength"])
    else:
        bsdf.inputs["Metallic"].default_value = 0.55
        bsdf.inputs["Roughness"].default_value = 0.38

    surface_output = bsdf.outputs["BSDF"]
    if material_key in alpha_materials and albedo:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        alpha_mix = nodes.new("ShaderNodeMixShader")
        links.new(albedo.outputs["Alpha"], alpha_mix.inputs[0])
        links.new(transparent.outputs["BSDF"], alpha_mix.inputs[1])
        links.new(surface_output, alpha_mix.inputs[2])
        surface_output = alpha_mix.outputs[0]
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
    links.new(surface_output, output.inputs["Surface"])


def apply_fake_material(
    material: bpy.types.Material,
    albedo_paths: dict[str, Path],
    ao_paths: dict[str, Path],
    normal_paths: dict[str, Path],
    reflection_paths: dict[str, Path],
    alpha_materials: set[str],
    paint_colors: dict[str, tuple[tuple[float, float, float, float], tuple[float, float, float, float]]],
    emissive_accent_materials: set[str],
    state_mask_paths: dict[str, Path],
    state_color_value: tuple[float, float, float, float],
    base_colors: dict[str, tuple[float, float, float, float]],
) -> None:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    facing_multiply = nodes.new("ShaderNodeMixRGB")
    facing_multiply.blend_type = "MULTIPLY"
    facing_multiply.inputs[0].default_value = 1.0
    ao_multiply = nodes.new("ShaderNodeMixRGB")
    ao_multiply.blend_type = "MULTIPLY"
    ao_multiply.inputs[0].default_value = 1.0
    facing = nodes.new("ShaderNodeLayerWeight")
    ramp = nodes.new("ShaderNodeValToRGB")
    material_key = canonical_material_key(material.name)
    color = base_colors.get(material_key, (*palette(material.name), 1))[:3]
    ramp.color_ramp.elements[0].position = 0.05
    ramp.color_ramp.elements[0].color = scaled(color, 0.34)
    ramp.color_ramp.elements[1].position = 0.98
    ramp.color_ramp.elements[1].color = scaled(color, 1.15)
    albedo_path = albedo_paths.get(material_key)
    ao_path = ao_paths.get(material_key)
    normal_path = normal_paths.get(material_key)
    reflection_path = reflection_paths.get(material_key)
    state_mask_path = state_mask_paths.get(material_key)
    albedo = None
    if albedo_path:
        ramp.color_ramp.elements[0].color = (0.58, 0.58, 0.58, 1)
        ramp.color_ramp.elements[1].color = (1.22, 1.22, 1.22, 1)
        albedo = add_image_node(nodes, albedo_path)
        links.new(albedo.outputs["Color"], facing_multiply.inputs[1])
        links.new(ramp.outputs["Color"], facing_multiply.inputs[2])
    else:
        links.new(ramp.outputs["Color"], facing_multiply.inputs[1])
        facing_multiply.inputs[2].default_value = (1, 1, 1, 1)

    normal_output = None
    if normal_path:
        normal_image = add_image_node(nodes, normal_path, non_color=True)
        normal_channels = nodes.new("ShaderNodeSeparateColor")
        invert_green = nodes.new("ShaderNodeInvert")
        combine_normal = nodes.new("ShaderNodeCombineColor")
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(normal_image.outputs["Color"], normal_channels.inputs["Color"])
        links.new(normal_channels.outputs["Red"], combine_normal.inputs["Red"])
        links.new(normal_channels.outputs["Green"], invert_green.inputs["Color"])
        links.new(invert_green.outputs["Color"], combine_normal.inputs["Green"])
        links.new(normal_channels.outputs["Blue"], combine_normal.inputs["Blue"])
        links.new(combine_normal.outputs["Color"], normal_map.inputs["Color"])
        normal_output = normal_map.outputs["Normal"]
        links.new(normal_output, facing.inputs["Normal"])

    if ao_path:
        ao = add_image_node(nodes, ao_path, non_color=True)
        channels = nodes.new("ShaderNodeSeparateColor")
        links.new(ao.outputs["Color"], channels.inputs["Color"])
        if albedo is not None and material_key in paint_colors:
            primary_color, secondary_color = paint_colors[material_key]
            primary = nodes.new("ShaderNodeRGB")
            secondary = nodes.new("ShaderNodeRGB")
            primary.outputs[0].default_value = primary_color
            secondary.outputs[0].default_value = secondary_color
            primary_tint = nodes.new("ShaderNodeMixRGB")
            primary_tint.blend_type = "MULTIPLY"
            primary_tint.inputs[0].default_value = 1.0
            secondary_tint = nodes.new("ShaderNodeMixRGB")
            secondary_tint.blend_type = "MULTIPLY"
            secondary_tint.inputs[0].default_value = 1.0
            primary_mix = nodes.new("ShaderNodeMixRGB")
            secondary_mix = nodes.new("ShaderNodeMixRGB")
            links.new(albedo.outputs["Color"], primary_tint.inputs[1])
            links.new(primary.outputs[0], primary_tint.inputs[2])
            links.new(albedo.outputs["Color"], secondary_tint.inputs[1])
            links.new(secondary.outputs[0], secondary_tint.inputs[2])
            links.new(channels.outputs["Green"], primary_mix.inputs[0])
            links.new(albedo.outputs["Color"], primary_mix.inputs[1])
            links.new(primary_tint.outputs["Color"], primary_mix.inputs[2])
            links.new(channels.outputs["Blue"], secondary_mix.inputs[0])
            links.new(primary_mix.outputs["Color"], secondary_mix.inputs[1])
            links.new(secondary_tint.outputs["Color"], secondary_mix.inputs[2])
            links.new(secondary_mix.outputs["Color"], facing_multiply.inputs[1])
        links.new(channels.outputs["Red"], ao_multiply.inputs[2])
    else:
        ao = nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Distance"].default_value = 2.5
        links.new(ao.outputs["Color"], ao_multiply.inputs[2])
    emission.inputs["Strength"].default_value = 1.0
    links.new(facing.outputs["Facing"], ramp.inputs["Fac"])
    links.new(facing_multiply.outputs["Color"], ao_multiply.inputs[1])
    final_color = ao_multiply.outputs["Color"]
    if albedo and material_key in emissive_accent_materials:
        channels = nodes.new("ShaderNodeSeparateColor")
        orange_mask = nodes.new("ShaderNodeMath")
        orange_mask.operation = "SUBTRACT"
        threshold = nodes.new("ShaderNodeMath")
        threshold.operation = "GREATER_THAN"
        threshold.inputs[1].default_value = 0.16
        hot = nodes.new("ShaderNodeMixRGB")
        hot.blend_type = "MULTIPLY"
        hot.inputs[0].default_value = 1.0
        hot.inputs[2].default_value = (8.0, 8.0, 8.0, 1)
        accent = nodes.new("ShaderNodeMixRGB")
        links.new(albedo.outputs["Color"], channels.inputs["Color"])
        links.new(channels.outputs["Red"], orange_mask.inputs[0])
        links.new(channels.outputs["Blue"], orange_mask.inputs[1])
        links.new(orange_mask.outputs[0], threshold.inputs[0])
        links.new(albedo.outputs["Color"], hot.inputs[1])
        links.new(threshold.outputs[0], accent.inputs[0])
        links.new(ao_multiply.outputs["Color"], accent.inputs[1])
        links.new(hot.outputs["Color"], accent.inputs[2])
        final_color = accent.outputs["Color"]
    if state_mask_path:
        state_mask = add_image_node(nodes, state_mask_path, non_color=True)
        state_channels = nodes.new("ShaderNodeSeparateColor")
        state_color = nodes.new("ShaderNodeRGB")
        state_color.outputs[0].default_value = state_color_value
        state_mix = nodes.new("ShaderNodeMixRGB")
        links.new(state_mask.outputs["Color"], state_channels.inputs["Color"])
        links.new(state_channels.outputs["Blue"], state_mix.inputs[0])
        links.new(final_color, state_mix.inputs[1])
        links.new(state_color.outputs[0], state_mix.inputs[2])
        final_color = state_mix.outputs["Color"]
    links.new(final_color, emission.inputs["Color"])
    surface_output = emission.outputs["Emission"]

    if reflection_path:
        reflection = add_image_node(nodes, reflection_path, non_color=True)
        reflection_channels = nodes.new("ShaderNodeSeparateColor")
        invert_roughness = nodes.new("ShaderNodeMath")
        invert_roughness.operation = "SUBTRACT"
        invert_roughness.inputs[0].default_value = 1.0
        metal_factor = nodes.new("ShaderNodeMath")
        metal_factor.operation = "MULTIPLY"
        metal_ramp = nodes.new("ShaderNodeValToRGB")
        metal_ramp.color_ramp.elements[0].position = 0.08
        metal_ramp.color_ramp.elements[0].color = (0.16, 0.16, 0.16, 1)
        metal_ramp.color_ramp.elements[1].position = 0.92
        metal_ramp.color_ramp.elements[1].color = (1.45, 1.45, 1.45, 1)
        metal_highlight = nodes.new("ShaderNodeMixRGB")
        metal_highlight.blend_type = "MULTIPLY"
        metal_highlight.inputs[0].default_value = 1.0
        metal_color = nodes.new("ShaderNodeMixRGB")
        hot_emission = nodes.new("ShaderNodeEmission")
        hot_emission.inputs["Strength"].default_value = 5.0
        emissive_mix = nodes.new("ShaderNodeMixShader")
        links.new(reflection.outputs["Color"], reflection_channels.inputs["Color"])
        links.new(reflection_channels.outputs["Green"], invert_roughness.inputs[1])
        links.new(reflection_channels.outputs["Red"], metal_factor.inputs[0])
        links.new(invert_roughness.outputs[0], metal_factor.inputs[1])
        links.new(facing.outputs["Facing"], metal_ramp.inputs["Fac"])
        links.new(final_color, metal_highlight.inputs[1])
        links.new(metal_ramp.outputs["Color"], metal_highlight.inputs[2])
        links.new(metal_factor.outputs[0], metal_color.inputs[0])
        links.new(final_color, metal_color.inputs[1])
        links.new(metal_highlight.outputs["Color"], metal_color.inputs[2])
        links.new(metal_color.outputs["Color"], emission.inputs["Color"])
        links.new(metal_color.outputs["Color"], hot_emission.inputs["Color"])
        links.new(reflection_channels.outputs["Blue"], emissive_mix.inputs[0])
        links.new(emission.outputs["Emission"], emissive_mix.inputs[1])
        links.new(hot_emission.outputs["Emission"], emissive_mix.inputs[2])
        surface_output = emissive_mix.outputs[0]

    if material_key in alpha_materials and albedo:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        alpha_mix = nodes.new("ShaderNodeMixShader")
        links.new(albedo.outputs["Alpha"], alpha_mix.inputs[0])
        links.new(transparent.outputs["BSDF"], alpha_mix.inputs[1])
        links.new(surface_output, alpha_mix.inputs[2])
        surface_output = alpha_mix.outputs[0]
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"

    links.new(surface_output, output.inputs["Surface"])


def add_occupancy_corners(
    camera: bpy.types.Object,
    center_x: float,
    center_y: float,
    width: float,
    depth: float,
    ground_z: float,
    height: float,
) -> tuple[float, float, float, float]:
    """실축 점유 부피의 투영 사각형을 카메라 전면 오버레이로 그린다.

    지면 사각형만 쓰면 사선 평행투영에서 높은 설비가 프레임을 넘어 보인다.
    게임 하드 박스의 8개 꼭짓점을 카메라 로컬 좌표로 투영한 뒤 렌즈 앞에 배치한다.
    """
    material = bpy.data.materials.new("OccupancyCorners")
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (1, 1, 1, 1)
    principled.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    principled.inputs["Emission Strength"].default_value = 1.0
    projected = [
        camera.matrix_world.inverted() @ Vector((
            center_x + x_sign * width / 2,
            center_y + y_sign * depth / 2,
            ground_z + z_sign * height,
        ))
        for x_sign, y_sign in ((-1, -1), (1, -1), (1, 1), (-1, 1))
        for z_sign in (0, 1)
    ]
    minimum_x = min(point.x for point in projected)
    maximum_x = max(point.x for point in projected)
    minimum_y = min(point.y for point in projected)
    maximum_y = max(point.y for point in projected)
    projected_width = maximum_x - minimum_x
    projected_height = maximum_y - minimum_y
    length = min(projected_width, projected_height) * 0.15
    thickness = min(projected_width, projected_height) * 0.004
    for index, (x, y, x_sign, y_sign) in enumerate((
        (minimum_x, minimum_y, -1, -1),
        (maximum_x, minimum_y, 1, -1),
        (maximum_x, maximum_y, 1, 1),
        (minimum_x, maximum_y, -1, 1),
    )):
        curve = bpy.data.curves.new(f"OccupancyCorner{index}", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = thickness
        curve.bevel_resolution = 0
        spline = curve.splines.new("POLY")
        spline.points.add(2)
        coordinates = (
            (x, y - y_sign * length, -0.2, 1),
            (x, y, -0.2, 1),
            (x - x_sign * length, y, -0.2, 1),
        )
        for point, coordinate in zip(spline.points, coordinates):
            point.co = coordinate
        curve.materials.append(material)
        obj = bpy.data.objects.new(curve.name, curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = camera
    return minimum_x, minimum_y, maximum_x, maximum_y


def add_ao_ground(center_x: float, center_y: float, width: float, depth: float, z: float) -> None:
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(center_x, center_y, z))
    ground = bpy.context.object
    ground.name = "TopViewAOGround"
    ground.scale = (width * 0.62, depth * 0.62, 1)
    material = bpy.data.materials.new("TopViewAOGround")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Base Color"].default_value = (0, 0, 0, 1)
    surface.inputs["Roughness"].default_value = 1.0
    surface.inputs["Metallic"].default_value = 0.0
    ao_near = nodes.new("ShaderNodeAmbientOcclusion")
    ao_mid = nodes.new("ShaderNodeAmbientOcclusion")
    ao_far = nodes.new("ShaderNodeAmbientOcclusion")
    ao_near.inputs["Distance"].default_value = 0.8
    ao_mid.inputs["Distance"].default_value = 2.4
    ao_far.inputs["Distance"].default_value = 5.0
    multiply_near = nodes.new("ShaderNodeMixRGB")
    multiply_near.blend_type = "MULTIPLY"
    multiply_near.inputs[0].default_value = 1.0
    multiply_far = nodes.new("ShaderNodeMixRGB")
    multiply_far.blend_type = "MULTIPLY"
    multiply_far.inputs[0].default_value = 1.0
    links.new(ao_near.outputs["Color"], multiply_near.inputs[1])
    links.new(ao_mid.outputs["Color"], multiply_near.inputs[2])
    links.new(multiply_near.outputs["Color"], multiply_far.inputs[1])
    links.new(ao_far.outputs["Color"], multiply_far.inputs[2])
    invert_ao = nodes.new("ShaderNodeInvert")
    links.new(multiply_far.outputs["Color"], invert_ao.inputs["Color"])
    links.new(invert_ao.outputs["Color"], surface.inputs["Alpha"])
    links.new(surface.outputs["BSDF"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    ground.data.materials.append(material)


def fit_orthographic_camera(camera: bpy.types.Object, points: list[Vector], margin: float = 1.1) -> None:
    """월드 좌표 점 집합이 정사각 렌더 안에 들어오도록 평행투영 카메라를 맞춘다."""
    bpy.context.view_layer.update()
    local_points = [camera.matrix_world.inverted() @ point for point in points]
    minimum_x = min(point.x for point in local_points)
    maximum_x = max(point.x for point in local_points)
    minimum_y = min(point.y for point in local_points)
    maximum_y = max(point.y for point in local_points)
    local_center = Vector(((minimum_x + maximum_x) / 2, (minimum_y + maximum_y) / 2, 0))
    camera.location += camera.matrix_world.to_3x3() @ local_center
    camera.data.ortho_scale = max(maximum_x - minimum_x, maximum_y - minimum_y) * margin
    bpy.context.view_layer.update()


def validate_runtime_top_camera(camera: bpy.types.Object, configured_tilt_deg: float) -> None:
    """런타임 탑뷰가 수직 정사영이라는 기하 계약을 렌더 전에 강제한다."""
    if camera.data.type != "ORTHO":
        raise RuntimeError(f"런타임 탑뷰 카메라는 ORTHO여야 합니다: {camera.data.type}")
    if abs(configured_tilt_deg) > 1e-9:
        raise RuntimeError(f"런타임 탑뷰 카메라 기울기는 0°여야 합니다: {configured_tilt_deg}")
    forward = (camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))).normalized()
    if abs(forward.x) > 1e-8 or abs(forward.y) > 1e-8 or abs(forward.z + 1.0) > 1e-8:
        raise RuntimeError(
            "런타임 탑뷰 카메라 축이 월드 -Z와 일치하지 않습니다: "
            f"forward=({forward.x:.12f},{forward.y:.12f},{forward.z:.12f})"
        )


def configure_bloom(scene: bpy.types.Scene) -> None:
    tree = bpy.data.node_groups.new("TopViewCompositor", "CompositorNodeTree")
    scene.compositing_node_group = tree
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    render_layers = tree.nodes.new("CompositorNodeRLayers")
    glare = tree.nodes.new("CompositorNodeGlare")
    output = tree.nodes.new("NodeGroupOutput")
    glare.inputs["Type"].default_value = "Fog Glow"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = 1.1
    glare.inputs["Smoothness"].default_value = 0.35
    glare.inputs["Strength"].default_value = 0.9
    glare.inputs["Saturation"].default_value = 1.05
    glare.inputs["Size"].default_value = 0.22
    tree.links.new(render_layers.outputs["Image"], glare.inputs["Image"])
    tree.links.new(glare.outputs["Image"], output.inputs["Image"])
    scene.render.use_compositing = True


def add_material_study_lights(key_energy: float, fill_energy: float) -> None:
    key_data = bpy.data.lights.new("MaterialStudyKey", type="SUN")
    key_data.energy = key_energy
    key_data.angle = math.radians(11)
    key = bpy.data.objects.new("MaterialStudyKey", key_data)
    key.rotation_euler = (math.radians(28), math.radians(-22), math.radians(-32))
    bpy.context.scene.collection.objects.link(key)

    fill_data = bpy.data.lights.new("MaterialStudyFill", type="SUN")
    fill_data.energy = fill_energy
    fill_data.angle = math.radians(18)
    fill = bpy.data.objects.new("MaterialStudyFill", fill_data)
    fill.rotation_euler = (math.radians(42), math.radians(18), math.radians(142))
    bpy.context.scene.collection.objects.link(fill)


def apply_emissive_geometry_selectors(
    selectors: list[dict],
    objects: list[bpy.types.Object],
) -> None:
    def within(value: float, limits: list[float]) -> bool:
        return limits[0] - 1e-5 <= value <= limits[1] + 1e-5

    for selector in selectors:
        material_name = selector["material"].casefold()
        matches: list[tuple[bpy.types.Object, set[int]]] = []
        for obj in objects:
            if obj.type != "MESH":
                continue
            mesh = obj.data
            slot_indices = {
                index for index, slot in enumerate(obj.material_slots)
                if slot.material and canonical_material_key(slot.material.name) == material_name
            }
            if not slot_indices:
                continue
            vertex_to_polygons = defaultdict(set)
            for polygon in mesh.polygons:
                if polygon.material_index in slot_indices:
                    for vertex in polygon.vertices:
                        vertex_to_polygons[vertex].add(polygon.index)
            pending = {
                polygon.index for polygon in mesh.polygons
                if polygon.material_index in slot_indices
            }
            while pending:
                seed = pending.pop()
                component = {seed}
                queue = deque([seed])
                while queue:
                    polygon = mesh.polygons[queue.popleft()]
                    neighbours = set().union(*(vertex_to_polygons[vertex] for vertex in polygon.vertices)) & pending
                    for neighbour in neighbours:
                        pending.remove(neighbour)
                        component.add(neighbour)
                        queue.append(neighbour)
                vertices = {
                    vertex
                    for polygon_index in component
                    for vertex in mesh.polygons[polygon_index].vertices
                }
                points = [obj.matrix_world @ mesh.vertices[index].co for index in vertices]
                minimum = [min(point[axis] for point in points) for axis in range(3)]
                maximum = [max(point[axis] for point in points) for axis in range(3)]
                size = [maximum[axis] - minimum[axis] for axis in range(3)]
                center = [(maximum[axis] + minimum[axis]) / 2 for axis in range(3)]
                if all(within(size[axis], selector["sizeM"][axis_name]) for axis, axis_name in enumerate(("x", "y", "z"))) and \
                   all(within(center[axis], selector["centerM"][axis_name]) for axis, axis_name in enumerate(("x", "y", "z"))):
                    matches.append((obj, component))

        expected = selector["expectedComponents"]
        if len(matches) != expected:
            raise RuntimeError(f"{selector['id']}: 발광 기하 {len(matches)}개, 기대 {expected}개")
        material = bpy.data.materials.new(f"TopViewEmissive_{selector['id']}")
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = parse_hex_color(selector["color"])
        emission.inputs["Strength"].default_value = selector["strength"]
        material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
        slots: dict[int, int] = {}
        for obj, component in matches:
            key = id(obj.data)
            if key not in slots:
                obj.data.materials.append(material)
                slots[key] = len(obj.data.materials) - 1
            for polygon_index in component:
                obj.data.polygons[polygon_index].material_index = slots[key]
        print(f"EMISSIVE_SELECTOR={selector['id']} COMPONENTS={len(matches)}")


def apply_opacity_geometry_selectors(
    selectors: list[dict],
    objects: list[bpy.types.Object],
) -> None:
    """탑뷰 전용 가림 처리: 공용 재질의 지정 연결 성분만 목표 합성 불투명도로 분리한다."""
    def within(value: float, limits: list[float]) -> bool:
        return limits[0] - 1e-5 <= value <= limits[1] + 1e-5

    for selector in selectors:
        material_name = selector["material"].casefold()
        matches: list[tuple[bpy.types.Object, set[int]]] = []
        source_material = None
        for obj in objects:
            if obj.type != "MESH":
                continue
            mesh = obj.data
            slot_indices = set()
            for index, slot in enumerate(obj.material_slots):
                if slot.material and canonical_material_key(slot.material.name) == material_name:
                    slot_indices.add(index)
                    source_material = slot.material
            if not slot_indices:
                continue
            vertex_to_polygons = defaultdict(set)
            for polygon in mesh.polygons:
                if polygon.material_index in slot_indices:
                    for vertex in polygon.vertices:
                        vertex_to_polygons[vertex].add(polygon.index)
            pending = {polygon.index for polygon in mesh.polygons if polygon.material_index in slot_indices}
            while pending:
                seed = pending.pop()
                component = {seed}
                queue = deque([seed])
                while queue:
                    polygon = mesh.polygons[queue.popleft()]
                    neighbours = set().union(*(vertex_to_polygons[vertex] for vertex in polygon.vertices)) & pending
                    for neighbour in neighbours:
                        pending.remove(neighbour)
                        component.add(neighbour)
                        queue.append(neighbour)
                vertices = {
                    vertex
                    for polygon_index in component
                    for vertex in mesh.polygons[polygon_index].vertices
                }
                points = [obj.matrix_world @ mesh.vertices[index].co for index in vertices]
                minimum = [min(point[axis] for point in points) for axis in range(3)]
                maximum = [max(point[axis] for point in points) for axis in range(3)]
                size = [maximum[axis] - minimum[axis] for axis in range(3)]
                center = [(maximum[axis] + minimum[axis]) / 2 for axis in range(3)]
                if all(within(size[axis], selector["sizeM"][axis_name]) for axis, axis_name in enumerate(("x", "y", "z"))) and \
                   all(within(center[axis], selector["centerM"][axis_name]) for axis, axis_name in enumerate(("x", "y", "z"))):
                    matches.append((obj, component))

        expected = selector["expectedComponents"]
        if len(matches) != expected or source_material is None:
            raise RuntimeError(f"{selector['id']}: 투과 기하 {len(matches)}개, 기대 {expected}개")
        combined_opacity = selector.get("combinedOpacity")
        if "perComponentOpacity" in selector:
            layer_opacity = selector["perComponentOpacity"]
            reported_opacity = layer_opacity
        else:
            overlap_layers = selector.get("overlapLayers", 1)
            layer_opacity = 0.0 if combined_opacity == 0 else 1.0 - pow(1.0 - combined_opacity, 1.0 / overlap_layers)
            reported_opacity = combined_opacity
        material = source_material.copy()
        material.name = f"TopViewOpacity_{selector['id']}"
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        output = next((node for node in nodes if node.type == "OUTPUT_MATERIAL"), None)
        if output is None or not output.inputs["Surface"].links:
            raise RuntimeError(f"{selector['id']}: 원본 재질 Surface 연결 누락")
        source_link = output.inputs["Surface"].links[0]
        source_socket = source_link.from_socket
        links.remove(source_link)
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = layer_opacity
        links.new(transparent.outputs["BSDF"], mix.inputs[1])
        links.new(source_socket, mix.inputs[2])
        links.new(mix.outputs[0], output.inputs["Surface"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        slots: dict[int, int] = {}
        for obj, component in matches:
            key = id(obj.data)
            if key not in slots:
                obj.data.materials.append(material)
                slots[key] = len(obj.data.materials) - 1
            for polygon_index in component:
                obj.data.polygons[polygon_index].material_index = slots[key]
        print(
            f"OPACITY_SELECTOR={selector['id']} COMPONENTS={len(matches)} "
            f"LAYER_OPACITY={layer_opacity:.6f} TARGET_OPACITY={reported_opacity:.6f}"
        )


args = parse_args()
if not args.glb:
    raise ValueError("--scene 또는 --glb로 본체 메시를 지정해야 합니다.")
if getattr(args, "pending_vat_components", []) and not args.diagnostic_allow_incomplete_vat:
    raise RuntimeError(f"Idle VAT 미적용 제품 렌더 금지: {', '.join(args.pending_vat_components)}")
Path(args.output).resolve().parent.mkdir(parents=True, exist_ok=True)
Path(args.blend).resolve().parent.mkdir(parents=True, exist_ok=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

component_transforms = parse_component_transforms(args.component_transform)
for component_index, glb in enumerate(args.glb):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(glb).resolve()), import_shading="NORMALS")
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    if component_index in component_transforms:
        x, y, z, yaw = component_transforms[component_index]
        component_spec = args.body_component_specs[component_index] if getattr(args, "body_component_specs", None) else {}
        component_id = component_spec.get("id", f"component-{component_index}")
        parent = bpy.data.objects.new(f"Component_{component_id}", None)
        parent.location = (x, y, z)
        parent.rotation_euler[2] = math.radians(yaw)
        if component_spec.get("scale"):
            parent.scale = tuple(component_spec["scale"])
        parent["source_component_id"] = component_id
        parent["source_transform"] = [x, y, z, yaw]
        parent["source_scale"] = list(component_spec.get("scale", [1, 1, 1]))
        bpy.context.scene.collection.objects.link(parent)
        for obj in imported:
            if obj.parent is None:
                obj.parent = parent
    if getattr(args, "body_component_specs", None):
        apply_vat_idle_pose(args.body_component_specs[component_index], imported)

if args.indicator_glb:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.indicator_glb).resolve()), import_shading="NORMALS")
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    parent = bpy.data.objects.new("ProductionIndicatorPlacement", None)
    parent.location = tuple(args.indicator_location or (0.0, 0.0, 0.0))
    parent.rotation_euler[2] = math.radians(args.indicator_yaw)
    bpy.context.scene.collection.objects.link(parent)
    for obj in imported:
        if obj.parent is None:
            obj.parent = parent
bpy.context.view_layer.update()

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not mesh_objects:
    raise RuntimeError("GLB에서 메시를 찾지 못했습니다.")

minimum, maximum = bounds(mesh_objects)
width = maximum.x - minimum.x
depth = maximum.y - minimum.y
height = maximum.z - minimum.z
frame_minimum = minimum.copy()
frame_maximum = maximum.copy()

albedo_paths = parse_material_map(args.material_albedo)
ao_paths = parse_material_map(args.material_ao)
normal_paths = parse_material_map(args.material_normal)
reflection_paths = parse_material_map(args.material_reflection)
alpha_materials = {name.casefold() for name in args.material_alpha}
pbr_materials = {name.casefold() for name in args.material_pbr}
normal_only_materials = {name.casefold() for name in args.material_normal_only}
paint_colors = parse_paint_map(args.material_paint)
base_colors = parse_color_map(args.material_base_color)
emissive_accent_materials = {name.casefold() for name in args.material_emissive_accent}
state_mask_paths = parse_material_map(args.material_state_mask)
parsed_state_color = parse_hex_color(args.state_color)
state_color_value = tuple(channel * args.state_strength for channel in parsed_state_color[:3]) + (1.0,)
for material in bpy.data.materials:
    if canonical_material_key(material.name) in pbr_materials:
        apply_pbr_material(
            material,
            albedo_paths,
            ao_paths,
            normal_paths,
            reflection_paths,
            alpha_materials,
            paint_colors,
            base_colors,
            emissive_accent_materials,
            normal_only_materials,
        )
    else:
        apply_fake_material(
            material,
            albedo_paths,
            ao_paths,
            normal_paths,
            reflection_paths,
            alpha_materials,
            paint_colors,
            emissive_accent_materials,
            state_mask_paths,
            state_color_value,
            base_colors,
        )

apply_emissive_geometry_selectors(args.emissive_geometry_selectors, mesh_objects)
apply_opacity_geometry_selectors(args.opacity_geometry_selectors, mesh_objects)

if args.footprint:
    footprint_width, footprint_depth = args.footprint
    footprint_x, footprint_y = args.footprint_center
    frame_minimum.x = min(frame_minimum.x, footprint_x - footprint_width / 2)
    frame_minimum.y = min(frame_minimum.y, footprint_y - footprint_depth / 2)
    frame_maximum.x = max(frame_maximum.x, footprint_x + footprint_width / 2)
    frame_maximum.y = max(frame_maximum.y, footprint_y + footprint_depth / 2)

center = (frame_minimum + frame_maximum) / 2
frame_width = frame_maximum.x - frame_minimum.x
frame_depth = frame_maximum.y - frame_minimum.y

if args.ground_ao:
    add_ao_ground(center.x, center.y, frame_width, frame_depth, minimum.z - 0.05)

camera_data = bpy.data.cameras.new("TopViewCamera")
camera_data.type = "ORTHO"
camera = bpy.data.objects.new("TopViewCamera", camera_data)
camera_distance = max(width, depth, height) * 2.0
tilt = math.radians(args.camera_tilt)
display_yaw = math.radians(args.display_yaw)
front = Vector((math.sin(display_yaw), -math.cos(display_yaw), 0))
camera.location = (
    center.x + front.x * camera_distance * math.sin(tilt),
    center.y + front.y * camera_distance * math.sin(tilt),
    maximum.z + camera_distance * math.cos(tilt),
)
target = Vector((center.x, center.y, (minimum.z + maximum.z) / 2))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.collection.objects.link(camera)
bpy.context.scene.camera = camera
bpy.context.view_layer.update()
frame_points = [
    Vector((x, y, z))
    for x in (minimum.x, maximum.x)
    for y in (minimum.y, maximum.y)
    for z in (minimum.z, maximum.z)
]
if args.footprint:
    frame_points.extend(
        Vector((
            footprint_x + x_sign * footprint_width / 2,
            footprint_y + y_sign * footprint_depth / 2,
            (args.footprint_ground_z if args.footprint_ground_z is not None else minimum.z) + z_sign * (args.footprint_height or height),
        ))
        for x_sign in (-1, 1)
        for y_sign in (-1, 1)
        for z_sign in (0, 1)
    )
fit_orthographic_camera(camera, frame_points)
if args.runtime_top_validation:
    validate_runtime_top_camera(camera, args.camera_tilt)
corner_frame_local = None
if args.footprint and not args.hide_corners:
    footprint_ground_z = args.footprint_ground_z if args.footprint_ground_z is not None else minimum.z
    corner_frame_local = add_occupancy_corners(
        camera,
        footprint_x,
        footprint_y,
        footprint_width,
        footprint_depth,
        footprint_ground_z,
        args.footprint_height or height,
    )

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.render.filepath = str(Path(args.output).resolve())
scene.render.image_settings.color_depth = "8"
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"
scene.view_settings.exposure = args.exposure
if args.bloom:
    configure_bloom(scene)
if args.sun:
    add_material_study_lights(args.key_energy, args.fill_energy)

world = bpy.data.worlds.new("World") if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (.018, .022, .028, 1)
background.inputs["Strength"].default_value = args.world_strength if args.sun else 0.0

scene["source_bounds"] = [*minimum, *maximum]
scene["source_size"] = [width, depth, height]
scene["camera_projection_contract"] = args.camera_projection
scene["camera_tilt_deg"] = args.camera_tilt
scene["camera_forward_world"] = [
    *(camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))).normalized()
]
scene["runtime_top_validated"] = args.runtime_top_validation
scene["corner_envelope_contract"] = args.corner_envelope or "unverified"
if args.footprint:
    scene["hard_footprint_m"] = [
        footprint_x, footprint_y, footprint_width, footprint_depth, args.footprint_height,
        args.footprint_ground_z if args.footprint_ground_z is not None else minimum.z,
    ]
if corner_frame_local:
    minimum_x, minimum_y, maximum_x, maximum_y = corner_frame_local
    scale = camera.data.ortho_scale
    scene["hard_footprint_frame_normalized"] = [
        0.5 + minimum_x / scale,
        0.5 - maximum_y / scale,
        (maximum_x - minimum_x) / scale,
        (maximum_y - minimum_y) / scale,
    ]
bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.blend).resolve()))
bpy.ops.render.render(write_still=True)
print(f"BOUNDS={width:.4f},{depth:.4f},{height:.4f}")
print(f"OUTPUT={Path(args.output).resolve()}")
