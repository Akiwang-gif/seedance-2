"""
Seedance Auto-Publisher - Draft Saver
将文章保存到网站草稿箱
"""

import requests
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

# API 配置
WEBSITE_API = "https://www.seedance-2.info/api/articles"
BEARER_TOKEN = "prairiedogs1"

# 文章样式配置
CARD_STYLE = {
    "cardTitleFontFamily": "Inter",
    "cardTitleFontSize": "16px",
    "cardTitleColor": "#1d1d1f",
    "cardTitleFontWeight": "normal",
    "cardTitleFontStyle": "normal"
}


def image_src_for_cms(img: dict) -> Optional[str]:
    """
    草稿正文 <img src> 只使用可公开访问的 URL（Cloudflare R2 返回的 https 地址）。
    优先 r2_url，其次 url；绝不使用 local_path、file://、磁盘路径。
    """
    for key in ("r2_url", "url"):
        u = img.get(key)
        if not u or not isinstance(u, str):
            continue
        u = u.strip()
        if u.startswith("https://") or u.startswith("http://"):
            if u.startswith("file:") or u.startswith("http://localhost"):
                continue
            return u
    return None


def assemble_html(article_content: str, images: list, title: str) -> str:
    """
    组装 HTML 内容，将配图嵌入文章

    Args:
        article_content: 纯文本文章内容
        images: 配图信息列表
        title: 文章标题

    Returns:
        HTML 格式的文章内容
    """
    # 将纯文本转换为 HTML 段落
    paragraphs = article_content.split("\n\n")
    html_paragraphs = []

    for para in paragraphs:
        if para.strip():
            # 处理段落内的换行
            para = para.replace("\n", "<br>")
            html_paragraphs.append(f"<p>{para}</p>")

    # 按类型分类图片
    cover_image = None
    section_images = []

    for img in images:
        src = image_src_for_cms(img)
        if not src:
            continue
        if img.get("type") == "cover":
            cover_image = img
        elif img.get("type") == "section":
            section_images.append(img)

    # 构建最终 HTML
    html_parts = []

    # 封面图（仅 R2 / https 公网 URL）
    if cover_image:
        cover_src = image_src_for_cms(cover_image)
        if cover_src:
            html_parts.append(
                f'<img src="{cover_src}" '
                f'alt="{title}" style="width:100%; max-width:800px; margin-bottom:20px;" />'
            )

    # 文章内容
    for i, para in enumerate(html_paragraphs):
        html_parts.append(para)

        # 在第2段后插入配图 (如果需要)
        if i == 1 and len(section_images) > 0:
            img = section_images[0]
            s = image_src_for_cms(img)
            if s:
                html_parts.append(
                    f'<figure style="margin:20px 0;">'
                    f'<img src="{s}" alt="{title}" style="width:100%;" />'
                    f'</figure>'
                )

        # 在第4段后再插入一张
        if i == 3 and len(section_images) > 1:
            img = section_images[1]
            s = image_src_for_cms(img)
            if s:
                html_parts.append(
                    f'<figure style="margin:20px 0;">'
                    f'<img src="{s}" alt="{title}" style="width:100%;" />'
                    f'</figure>'
                )

        # 在最后一段前插入剩余配图
        if i == len(html_paragraphs) - 2 and len(section_images) > 2:
            for img in section_images[2:]:
                s = image_src_for_cms(img)
                if s:
                    html_parts.append(
                        f'<figure style="margin:20px 0;">'
                        f'<img src="{s}" alt="{title}" style="width:100%;" />'
                        f'</figure>'
                    )

    return "\n".join(html_parts)


def save_draft(
    title: str,
    article_content: str,
    description: str = "",
    category: str = "News",
    author: str = "Seedance AI Team",
    images: list = None,
    article_id: str = None
) -> dict:
    """
    保存文章到网站草稿箱

    Args:
        title: 文章标题
        article_content: 文章内容 (纯文本或HTML)
        description: 文章描述/摘要
        category: 分类
        author: 作者
        images: 配图列表 (可选)；每项须含 **R2 公网地址**：优先 `r2_url`，或已上传后的 `url`（https）。
            不要使用 `local_path` 作为正文图片地址。须先跑 `image_generator` 且 `upload_to_r2=True` 成功。
        article_id: 文章ID (更新时使用，新建时为None)

    Returns:
        {"success": True, "article_id": "xxx"} 或 {"error": "message"}
    """
    headers = {
        "Authorization": f"Bearer {BEARER_TOKEN}",
        "Content-Type": "application/json"
    }

    # 判断是新建还是更新
    if article_id:
        url = f"{WEBSITE_API}/{article_id}"
        method = "PUT"
    else:
        url = WEBSITE_API
        method = "POST"

    # 组装 HTML
    if images:
        body_html = assemble_html(article_content, images, title)
    else:
        # 没有图片时直接转换文本为 HTML
        paragraphs = article_content.split("\n\n")
        html_paragraphs = [f"<p>{p.strip()}</p>" for p in paragraphs if p.strip()]
        body_html = "\n".join(html_paragraphs)

    # 构建请求 Body
    payload = {
        "title": title,
        "description": description or title,
        "category": category,
        "author": author,
        **CARD_STYLE,
        "status": "draft",
        "bodyHtml": body_html
    }

    try:
        print(f"\n=== Saving draft to {url} ===")
        print(f"Title: {title}")
        print(f"Category: {category}")
        print(f"Author: {author}")
        print(f"Status: draft")

        if method == "POST":
            response = requests.post(url, json=payload, headers=headers, timeout=30)
        else:
            response = requests.put(url, json=payload, headers=headers, timeout=30)

        result = response.json()

        if response.status_code in [200, 201]:
            # 成功
            article_id = result.get("id") or result.get("data", {}).get("id")
            print("\n[OK] Draft saved successfully.")
            print(f"  Article ID: {article_id}")

            return {
                "success": True,
                "article_id": article_id,
                "url": f"{WEBSITE_API}/{article_id}"
            }
        else:
            error_msg = result.get("error") or result.get("message") or str(result)
            print(f"\n[FAIL] Save failed: {error_msg}")
            return {"error": error_msg}

    except requests.exceptions.Timeout:
        return {"error": "Request timeout - please try again"}
    except requests.exceptions.RequestException as e:
        return {"error": f"Request error: {str(e)}"}
    except Exception as e:
        return {"error": f"Unexpected error: {str(e)}"}


def save_draft_metadata(
    title: str,
    topic: str,
    style: str,
    word_count: int,
    image_count: int,
    article_id: str = None,
    output_file: str = "draft_metadata.json"
):
    """
    保存文章元数据到本地文件

    Args:
        title: 文章标题
        topic: 选题主题
        style: 写作风格
        word_count: 字数
        image_count: 配图数量
        article_id: 文章ID
        output_file: 输出文件路径
    """
    metadata = {
        "created_at": datetime.now().isoformat(),
        "title": title,
        "topic": topic,
        "style": style,
        "word_count": word_count,
        "image_count": image_count,
        "article_id": article_id,
        "status": "draft",
        "website_url": f"{WEBSITE_API}/{article_id}" if article_id else None,
        "publish_status": "pending_manual_publish"
    }

    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\nMetadata saved to: {output_file}")
    return metadata


def get_drafts() -> list:
    """
    获取所有草稿文章

    Returns:
        草稿列表
    """
    headers = {
        "Authorization": f"Bearer {BEARER_TOKEN}"
    }

    try:
        response = requests.get(WEBSITE_API, headers=headers, timeout=30)
        result = response.json()

        if response.status_code == 200:
            drafts = result.get("data", []) if isinstance(result, dict) else result
            return [d for d in drafts if d.get("status") == "draft"]
        else:
            print(f"Error fetching drafts: {result}")
            return []
    except Exception as e:
        print(f"Error: {e}")
        return []


# 使用示例
if __name__ == "__main__":
    # 测试保存草稿
    test_article = """
    Seedance 2.0 represents a major breakthrough in AI video generation technology.

    The new model offers unprecedented capabilities in text-to-video synthesis. Users can now create professional-quality videos from simple text descriptions in under 30 seconds.

    Key features include 4K resolution support, multiple style options, and an intuitive interface designed for both beginners and professionals. The technology builds on previous advances while introducing entirely new capabilities.

    Industry experts have praised the development, noting that it represents a significant step forward in accessible AI tools.
    """.strip()

    print("=== Testing draft save ===")

    # 注意: 实际运行时 images 应该来自 image_generator.py
    result = save_draft(
        title="Seedance 2.0: Breaking Down the New Features",
        article_content=test_article,
        description="A comprehensive look at Seedance 2.0 features",
        category="News",
        author="Seedance AI Team"
    )

    print(f"\nResult: {result}")