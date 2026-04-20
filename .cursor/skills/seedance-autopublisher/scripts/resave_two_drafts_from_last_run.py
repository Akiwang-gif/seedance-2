"""
仅保存两篇草稿（不重新出图）。使用最近一次 run_two_seedance_drafts 跑出的 apimart URL。
在 draft_saver 修复 Windows 控制台 Unicode 问题后用于补保存。
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / "publisher"))

from run_two_seedance_drafts import ARTICLES  # noqa: E402
from draft_saver import save_draft  # noqa: E402

# 来自 last_two_articles_run.log（2026-04-17 跑一次）
IMG_A = [
    {
        "type": "cover",
        "url": "https://upload.apimart.ai/f/image/9998223603322050-215ee7dd-09bc-4d8a-b074-ae944063f0c5-image_task_01KPCQWCSXMWMY1YY0J1N6JVC1_0.jpg",
        "style": "Tech/Natural",
    },
    {
        "type": "section",
        "url": "https://upload.apimart.ai/f/image/9998223603290426-75339c1c-b0a6-4444-b03d-62963efec78e-image_task_01KPCQXBP5H3M00MQ7BKNS3SGD_0.jpg",
        "style": "Flat",
    },
    {
        "type": "section",
        "url": "https://upload.apimart.ai/f/image/9998223603259371-92200810-c717-4f75-9738-c957830d8f58-image_task_01KPCQYA0MYDAKZVHJ1K7D12G3_0.jpg",
        "style": "Infographic",
    },
]
IMG_B = [
    {
        "type": "cover",
        "url": "https://upload.apimart.ai/f/image/9998223603225587-4fa07bd3-f2d6-4b7b-8bda-f0be5e518409-image_task_01KPCQZB0C9VKR82BZQ7MGZ48W_0.jpg",
        "style": "Tech/Natural",
    },
    {
        "type": "section",
        "url": "https://upload.apimart.ai/f/image/9998223603158382-203ff3c5-58b3-44f1-b4f5-f3a8c553c626-image_task_01KPCR1CMHX36ACWRJMBEJ4M25_0.jpg",
        "style": "Flat",
    },
    {
        "type": "section",
        "url": "https://upload.apimart.ai/f/image/9998223603124581-f459c248-1946-45b1-a903-b7f23ef60dab-image_task_01KPCR2DMT5865PSPWYFQ1KZJY_0.jpg",
        "style": "Infographic",
    },
]


def main() -> None:
    pairs = [(ARTICLES[0], IMG_A), (ARTICLES[1], IMG_B)]
    for i, (art, imgs) in enumerate(pairs, start=1):
        out = save_draft(
            title=art["title"],
            article_content=art["body"],
            description=art["description"],
            category="News",
            author="Seedance AI Team",
            images=imgs,
        )
        print(f"[Article {i}] {out}")


if __name__ == "__main__":
    main()
