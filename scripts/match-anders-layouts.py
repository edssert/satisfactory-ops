"""
사용자 제공 Anders/PokeMaki 도면과 원 Reddit 아카이브 이미지를 축소 정규화해 시각적으로 대조한다.
정확한 동일성은 SHA-256으로 판정하고, 리사이즈·재인코딩 후보는 RGB 평균 절대 오차로 좁힌다.

사용:
    python scripts/match-anders-layouts.py
    python scripts/match-anders-layouts.py --top 5

입력:
    .tmp-research/anders/layout-corpus
    .tmp-research/anders/original-posts/index.json

종료 코드:
    0 비교 완료
    1 입력 누락 또는 이미지 판독 실패
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
CORPUS_DIR = ROOT / ".tmp-research" / "anders" / "layout-corpus"
ARCHIVE_DIR = ROOT / ".tmp-research" / "anders" / "original-posts"
INDEX_PATH = ARCHIVE_DIR / "index.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGB")
        return image.resize((96, 96), Image.Resampling.LANCZOS)


def distance(left: Image.Image, right: Image.Image) -> float:
    difference = ImageChops.difference(left, right)
    return sum(ImageStat.Stat(difference).mean) / (3 * 255)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=3)
    args = parser.parse_args()

    payload = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    archived = []
    for post in payload["posts"]:
        for media in post["media"]:
            if media.get("availability") != "archived":
                continue
            path = ARCHIVE_DIR / media["filename"]
            archived.append(
                {
                    "postId": post["id"],
                    "title": post["title"],
                    "path": path,
                    "sha256": media["sha256"],
                    "normalized": normalized(path),
                }
            )

    corpus_paths = sorted(
        path for path in CORPUS_DIR.iterdir() if path.suffix.lower() in {".png", ".jpg", ".jpeg"}
    )
    for path in corpus_paths:
        sha256 = digest(path)
        image = normalized(path)
        scores = sorted(
            (
                {
                    "distance": distance(image, original["normalized"]),
                    "exact": sha256 == original["sha256"],
                    "postId": original["postId"],
                    "title": original["title"],
                    "filename": original["path"].name,
                }
                for original in archived
            ),
            key=lambda row: (not row["exact"], row["distance"]),
        )
        print(f"\n{path.name}  sha256={sha256}")
        for score in scores[: args.top]:
            marker = "EXACT" if score["exact"] else f"Δ={score['distance']:.5f}"
            print(f"  {marker:>9}  {score['postId']}  {score['filename']}  {score['title']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
