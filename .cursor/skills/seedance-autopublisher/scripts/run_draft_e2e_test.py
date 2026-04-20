"""
第二步测试：保存网站草稿

  仅测 API（无配图、最快）:
    python run_draft_e2e_test.py text

  完整流程（nanobanana 出图 → 本地 → R2 → 草稿，耗时长、占额度）:
    先在同一终端设置 CMS_WRITE_SECRET，再:
    python run_draft_e2e_test.py full

在仓库根目录 seedance-2 下执行；依赖 requests。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS / "image"))
sys.path.insert(0, str(SCRIPTS / "publisher"))


SAMPLE_ARTICLE = """
Seedance 2.0 represents a major breakthrough in AI video generation technology.

The new model offers 4K video generation in under 30 seconds. Users can create professional-quality videos from simple text prompts.

The interface has been redesigned for better user experience. Multiple style options are now available for different use cases.
""".strip() * 12


def main() -> None:
    p = argparse.ArgumentParser(description="测试 POST /api/articles 草稿")
    p.add_argument(
        "mode",
        choices=("text", "full"),
        default="text",
        nargs="?",
        help="text=只发纯文本草稿；full=先配图上传 R2 再发草稿",
    )
    args = p.parse_args()

    from draft_saver import save_draft

    title = "[E2E Test] Seedance Draft — please delete"
    if args.mode == "text":
        print("=== 模式: 仅草稿（无配图），测 Bearer + /api/articles ===\n")
        out = save_draft(
            title=title + " (text-only)",
            article_content=SAMPLE_ARTICLE,
            description="Automated draft API test",
            category="News",
        )
        print(out)
        return

    print("=== 模式: 配图 + R2 + 草稿（请确认已设置 CMS_WRITE_SECRET）===\n")
    from image_generator import generate_article_images

    images = generate_article_images(
        article_title="Seedance 2.0: A New Era of AI Video Generation",
        article_content=SAMPLE_ARTICLE,
        topic="AI video generation technology",
        upload_to_r2=True,
    )
    if not images:
        print("未生成任何配图，中止保存草稿。")
        sys.exit(1)

    out = save_draft(
        title=title,
        article_content=SAMPLE_ARTICLE,
        description="E2E test with R2 images",
        category="News",
        images=images,
    )
    print(out)


if __name__ == "__main__":
    main()
