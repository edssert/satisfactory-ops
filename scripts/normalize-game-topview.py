#!/usr/bin/env python3
"""게임 메시 정사영 PNG를 편집기용 투명 WebP 탑뷰로 정규화한다.

사용:
  python scripts/normalize-game-topview.py <입력.png> <출력.webp>

게임의 페인트 셰이더가 CUE4Parse GLB에 포함되지 않으므로, 원본 메시의 명암과
발광 표식은 보존하면서 FICSIT 기본 금속 팔레트로만 색을 복원한다.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def mix(start: tuple[int, int, int], end: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(a + (b - a) * amount) for a, b in zip(start, end))


def restore_palette(pixel: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return pixel

    # 게임 알베도의 노란 방향·안전 표식은 FICSIT 주황으로 보존한다.
    if red > 150 and green > 125 and blue < 105:
        light = min(1.0, (red + green) / 510)
        orange = mix((180, 73, 13), (255, 177, 64), light)
        return (*orange, alpha)

    luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
    if luminance < 0.42:
        color = mix((13, 18, 23), (38, 49, 59), luminance / 0.42)
    else:
        color = mix((38, 49, 59), (126, 145, 162), (luminance - 0.42) / 0.58)
    return (*color, alpha)


def normalize(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    alpha_bounds = image.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError(f"불투명 픽셀이 없습니다: {source}")

    image = image.crop(alpha_bounds)
    image.putdata([restore_palette(pixel) for pixel in image.get_flattened_data()])

    canvas_size = 512
    padding = 18
    max_side = canvas_size - padding * 2
    scale = min(max_side / image.width, max_side / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((canvas_size - resized.width) // 2, (canvas_size - resized.height) // 2),
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "WEBP", lossless=True, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    normalize(args.source, args.destination)
    print(f"게임 메시 탑뷰 정규화: {args.destination}")


if __name__ == "__main__":
    main()
