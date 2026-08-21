#!/usr/bin/env python3
"""검토가 끝난 AndersPottemager 시트 영역을 투명 WebP 설비 자산으로 만든다.

사용: python scripts/build-topview-assets.py <Assets 폴더> <출력 폴더>
작물 식별과 좌표는 src/data/curated/topview-assets.json이 정본이다.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    manifest_path = root / "src/data/curated/topview-assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sheets: dict[str, Image.Image] = {}
    args.output_directory.mkdir(parents=True, exist_ok=True)

    generated = []
    for asset in manifest["assets"]:
        # 게임 설치본에서 직접 렌더한 항목은 이 크롭 파이프라인의 입력이 아니다.
        if "cropPx" not in asset:
            continue
        source = manifest["$sources"][asset["sourceId"]]
        sheet_name = asset.get("sheet", source["sheet"])
        asset_id = asset.get("assetId", asset.get("buildingClass"))
        if not asset_id:
            raise SystemExit("buildingClass 또는 assetId가 없는 자산 항목")
        if sheet_name not in sheets:
            sheets[sheet_name] = Image.open(args.source_directory / sheet_name).convert("RGBA")
        sheet = sheets[sheet_name]
        crop = asset["cropPx"]
        left = crop["x"]
        top = crop["y"]
        image = sheet.crop((left, top, left + crop["width"], top + crop["height"]))
        alpha_box = image.getchannel("A").getbbox()
        if alpha_box is None:
            raise SystemExit(f"투명하지 않은 자산 영역: {asset_id}")
        image = image.crop(alpha_box)
        output = args.output_directory / f"{asset_id}.webp"
        image.save(output, "WEBP", lossless=True, quality=100, method=6)
        generated.append({"assetId": asset_id, "width": image.width, "height": image.height})

    print(json.dumps({"generated": generated}, ensure_ascii=False))


if __name__ == "__main__":
    main()
