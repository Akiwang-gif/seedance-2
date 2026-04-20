"""
Seedance Auto-Publisher - Image Generator
使用 nanobanana API 生成文章配图，保存到仓库 generated-images，并可选上传到 Cloudflare R2（经站点 /api/upload-image）。
"""

import os
import re
import requests
import time
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


def _find_repo_root() -> Path:
    start = Path(__file__).resolve().parent
    for parent in [start, *start.parents]:
        if (parent / "wrangler.toml").is_file() and (parent / "package.json").is_file():
            return parent
    return Path(__file__).resolve().parents[6]


REPO_ROOT = _find_repo_root()


def _load_env_file(path: Path) -> None:
    """将 KEY=VALUE 写入 os.environ（仅当该键尚未设置）。不依赖 python-dotenv。"""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def _ensure_env_from_repo() -> None:
    """
    从仓库根目录 .env.local、.env 加载变量。
    这样 Cursor 后台执行的 Python 也能读到 CMS_WRITE_SECRET，无需与你在本机终端里手动 $env: 同步。
    """
    for name in (".env.local", ".env"):
        _load_env_file(REPO_ROOT / name)


_ensure_env_from_repo()

# 项目内目录：<repo>/generated-images/article-images/<文章 slug>/
LOCAL_IMAGE_DIR = REPO_ROOT / "generated-images" / "article-images"

# 上传：与 api/upload-image.js 一致，写入 R2 bucket（如 seedance-2-upload），对象键 articles/...
DEFAULT_UPLOAD_URL = "https://www.seedance-2.info/api/upload-image"

# API 配置
API_KEY = "sk-2pb9fhQj3lIScGqcGhlJ5cMuJ5ClDkdMaxgOn7d1E2yGRsXm"
API_URL = "https://api.apimart.ai/v1/images/generations"
# APIMart 文档：GET https://api.apimart.ai/v1/tasks/{task_id}（不要用旧的 task-unified- 前缀，否则会 400）
TASK_STATUS_URL = "https://api.apimart.ai/v1/tasks/{task_id}"

# 图片风格列表 (按顺序轮换)
IMAGE_STYLES = [
    "Flat",           # 扁平化设计 - 简洁几何形状，专业配色
    "Infographic",    # 信息图表风格 - 数据可视化，清晰易读
    "Realistic",      # 写实风格 - 逼真的光影和材质
    "Tech",           # 科技风格 - 数字化界面，现代感
    "Editorial",      # 编辑配图 - 杂志级精致画面
    "Minimal",        # 极简风格 - 大量留白，核心元素突出
]


def normalize_image_url(value: Any) -> Optional[str]:
    """API 可能返回 str，或 [str, ...]；统一为单个 https URL 字符串。"""
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s if s.startswith("http") else None
    if isinstance(value, list):
        for item in value:
            u = normalize_image_url(item)
            if u:
                return u
        return None
    return None


def slugify_title(title: str, max_len: int = 48) -> str:
    s = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", (title or "").strip().lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return (s or "article")[:max_len]


def build_image_filename(
    date_stamp: str,
    article_slug: str,
    img_type: str,
    seq: int,
    ext: str,
) -> str:
    """命名：YYYYMMDD_<slug>_<cover|bodyNN>.<ext>"""
    safe_slug = re.sub(r"[^a-zA-Z0-9._-]", "_", article_slug)[:48]
    if img_type == "cover":
        role = "cover"
    else:
        role = f"body{seq:02d}"
    return f"{date_stamp}_{safe_slug}_{role}{ext}"


def upload_local_file_to_r2_via_api(
    local_path: Path,
    upload_url: Optional[str] = None,
    bearer: Optional[str] = None,
) -> dict:
    """
    通过站点 POST /api/upload-image 上传到 R2（bucket 由服务端环境变量决定，如 seedance-2-upload）。
    需环境变量 CMS_WRITE_SECRET，与 admin 中 API key 一致。
    """
    url = (upload_url or os.environ.get("SEEDANCE_UPLOAD_IMAGE_URL") or DEFAULT_UPLOAD_URL).strip().rstrip("/")
    token = (bearer or os.environ.get("CMS_WRITE_SECRET") or "").strip()
    if not token:
        return {
            "error": "CMS_WRITE_SECRET 未设置，无法上传到 R2。请在仓库根目录 .env.local 添加 CMS_WRITE_SECRET=你的密钥（已 gitignore），或在当前终端先设置该环境变量。",
        }

    ext = local_path.suffix.lower()
    mime = "image/png" if ext == ".png" else ("image/jpeg" if ext in (".jpg", ".jpeg") else "application/octet-stream")

    try:
        with open(local_path, "rb") as f:
            files = {"image": (local_path.name, f, mime)}
            headers = {"Authorization": f"Bearer {token}"}
            r = requests.post(url, files=files, headers=headers, timeout=120)
        if r.status_code != 200:
            return {"error": f"上传失败 HTTP {r.status_code}: {r.text[:800]}"}
        data = r.json()
        out = data.get("url")
        if not out:
            return {"error": f"响应无 url: {data}"}
        return {"url": out}
    except Exception as e:
        return {"error": str(e)}


def generate_image(prompt: str, size: str = "16:9", resolution: str = "1K") -> dict:
    """
    调用 nanobanana API 生成单张图片

    Args:
        prompt: 图片描述
        size: 比例 (16:9, 4:3, 1:1)
        resolution: 分辨率 (0.5K, 1K, 2K, 4K)

    Returns:
        {"task_id": "xxx"} 或 {"error": "message"}
    """
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gemini-3-pro-image-preview",
        "prompt": prompt,
        "size": size,
        "resolution": resolution,
        "n": 1
    }

    try:
        response = requests.post(API_URL, json=payload, headers=headers, timeout=30)
        result = response.json()

        if response.status_code == 200:
            return {"task_id": result.get("data", [{}])[0].get("task_id")}
        else:
            return {"error": f"API Error {response.status_code}: {result}"}
    except Exception as e:
        return {"error": str(e)}


def check_task_status(task_id: str) -> dict:
    """
    查询图片生成任务状态

    Args:
        task_id: 任务ID

    Returns:
        {"status": "completed", "images": [...]} 或 {"status": "processing"}
    """
    status_url = TASK_STATUS_URL.format(task_id=task_id)
    headers = {"Authorization": f"Bearer {API_KEY}"}

    try:
        response = requests.get(status_url, headers=headers, timeout=30)
        body_preview = (response.text or "")[:600]
        try:
            result = response.json()
        except ValueError:
            return {"error": f"API Error {response.status_code}: non-JSON body: {body_preview}"}

        if response.status_code == 200:
            data = result.get("data")
            if not isinstance(data, dict):
                data = result if isinstance(result, dict) else {}
            status_raw = data.get("status")
            status = (status_raw or "").strip().lower() if isinstance(status_raw, str) else str(status_raw or "").lower()

            if status == "completed":
                res_block = data.get("result") or {}
                if not isinstance(res_block, dict):
                    res_block = {}
                images = res_block.get("images") or []
                out_urls: list = []
                for img in images:
                    if isinstance(img, dict):
                        u = normalize_image_url(img.get("url"))
                    else:
                        u = normalize_image_url(img)
                    if u:
                        out_urls.append(u)
                return {
                    "status": "completed",
                    "images": out_urls,
                }

            # 终态失败
            if status in ("failed", "error", "cancelled", "canceled"):
                return {"error": f"Task failed: {status_raw}"}

            # pending / queued / processing / running / submitted / 未知 — 继续轮询（勿带 error 键，否则 wait_for_image 会立即退出）
            return {"status": "processing", "progress": data.get("progress", 0), "phase": status_raw or "waiting"}
        else:
            return {"error": f"API Error {response.status_code}: {result if isinstance(result, dict) else body_preview}"}
    except Exception as e:
        return {"error": str(e)}


def wait_for_image(task_id: str, max_wait: int = 300, poll_interval: int = 5) -> dict:
    """
    等待图片生成完成 (轮询状态)

    Args:
        task_id: 任务ID
        max_wait: 最大等待秒数
        poll_interval: 轮询间隔秒数

    Returns:
        {"status": "completed", "images": [...]} 或 {"error": "timeout/error"}
    """
    elapsed = 0
    print(f"  Waiting for image generation... (task_id: {task_id})")

    while elapsed < max_wait:
        status_result = check_task_status(task_id)

        if status_result.get("error"):
            return status_result

        if status_result.get("status") == "completed":
            imgs = status_result.get("images") or []
            print(f"  Image ready: {imgs[:1] if imgs else imgs}")
            return status_result

        progress = status_result.get("progress", 0)
        phase = status_result.get("phase", "")
        extra = f" ({phase})" if phase else ""
        print(f"  Processing... {progress}%{extra} (waited {elapsed}s)")
        time.sleep(poll_interval)
        elapsed += poll_interval

    return {"error": "Timeout waiting for image generation"}


def generate_cover_prompt(article_title: str, topic: str) -> str:
    """
    为封面图生成 prompt

    Args:
        article_title: 文章标题
        topic: 核心主题

    Returns:
        封面图 prompt
    """
    return (
        f"Professional cover image, {topic}, "
        f"flat design with subtle realistic elements, clean composition, "
        f"no text, 16:9 aspect ratio, high quality, editorial style"
    )


def generate_section_prompt(section_content: str, style: str, topic: str) -> str:
    """
    为章节配图生成 prompt

    Args:
        section_content: 章节内容摘要
        style: 图片风格
        topic: 核心主题

    Returns:
        配图 prompt
    """
    style_descriptions = {
        "Flat": f"clean flat design illustration, simple geometric shapes, solid colors, minimalist composition, professional look, no gradients, {topic}",
        "Infographic": f"modern infographic style, data visualization, clean charts and icons, professional layout, clear hierarchy, {topic}",
        "Realistic": f"photorealistic rendering, natural lighting, detailed textures, lifelike quality, professional photography composition, {topic}",
        "Tech": f"modern technology concept, digital interface elements, sleek design, blue and purple tones, futuristic yet clean, {topic}",
        "Editorial": f"high-end editorial illustration, magazine quality, sophisticated color palette, cinematic composition, detailed yet stylized, {topic}",
        "Minimal": f"ultra-minimalist design, abundant white space, single focal point, elegant simplicity, restrained color palette, {topic}"
    }

    style_desc = style_descriptions.get(style, style_descriptions["Tech"])

    # 截取相关内容作为描述
    content_snippet = section_content[:100] if len(section_content) > 100 else section_content

    return (
        f"Professional article illustration showing: {content_snippet}. "
        f"{style_desc}, focused composition, clean and modern, "
        f"4:3 or 16:9 aspect ratio, high quality visual"
    )


def get_image_count(word_count: int) -> int:
    """
    根据文章字数确定配图数量

    Args:
        word_count: 文章字数

    Returns:
        配图数量
    """
    if word_count <= 750:
        return 3
    elif word_count <= 1000:
        return 4
    else:
        return 5


def generate_article_images(
    article_title: str,
    article_content: str,
    topic: str,
    output_dir: str = None,
    upload_to_r2: bool = True,
) -> list:
    """
    为文章生成全套配图

    Args:
        article_title: 文章标题
        article_content: 文章内容 (英文，纯文本)
        topic: 核心主题
        output_dir: 输出目录 (可选)

    Returns:
        每项含 type、prompt、url（上传成功则为 R2 公网 URL）、local_path、r2_url（成功时与 url 一致）。
    """
    # 计算字数
    word_count = len(article_content.split())
    image_count = get_image_count(word_count)

    print(f"\n=== Generating {image_count} images for article ({word_count} words) ===")

    # 分割文章为几个部分
    sections = _split_content_into_sections(article_content, image_count - 1)

    results = []
    style_index = 0

    for i in range(image_count):
        if i == 0:
            # 封面图
            prompt = generate_cover_prompt(article_title, topic)
            size = "16:9"
            img_type = "cover"
            print(f"\n[Cover Image {i+1}/{image_count}]")
            print(f"  Prompt: {prompt[:80]}...")
        else:
            # 章节配图
            style = IMAGE_STYLES[style_index % len(IMAGE_STYLES)]
            section = sections[i - 1] if i - 1 < len(sections) else ""
            prompt = generate_section_prompt(section, style, topic)
            size = "4:3" if i % 2 == 0 else "16:9"
            img_type = "section"
            style_index += 1
            print(f"\n[Section Image {i}/{image_count - 1}]")
            print(f"  Style: {style}")
            print(f"  Prompt: {prompt[:80]}...")

        # 生成图片
        result = generate_image(prompt, size=size)

        if "error" in result:
            print(f"  Error: {result['error']}")
            continue

        # 等待图片生成
        task_id = result["task_id"]
        wait_result = wait_for_image(task_id)

        if "error" in wait_result:
            print(f"  Wait Error: {wait_result['error']}")
            continue

        raw_imgs = wait_result.get("images") or []
        image_url = normalize_image_url(raw_imgs[0] if raw_imgs else None)
        if not image_url:
            print(f"  Wait Error: no image URL in task result: {raw_imgs!r}")
            continue

        section_style = "Tech/Natural"
        if img_type == "section":
            section_style = IMAGE_STYLES[(style_index - 1) % len(IMAGE_STYLES)]

        results.append({
            "type": img_type,
            "url": image_url,
            "prompt": prompt,
            "style": section_style,
        })

        # API 限制，避免请求过快
        time.sleep(1)

    print(f"\n=== Generated {len(results)} images ===")

    # 本地命名保存 + 可选上传 R2
    print(f"\n=== Saving images under repo: {LOCAL_IMAGE_DIR} ===")
    save_result = save_images_to_local_gallery(results, article_title, upload_to_r2=upload_to_r2)
    if "error" in save_result:
        print(f"  Warning: Failed to save locally - {save_result['error']}")
    else:
        print(f"  Local gallery: {save_result['gallery_dir']}")
        if save_result.get("upload_urls"):
            print(f"  R2 public URLs: {len(save_result['upload_urls'])} file(s)")

    return save_result.get("images", results)


def _split_content_into_sections(content: str, num_sections: int) -> list:
    """
    将文章内容分割为多个章节段落

    Args:
        content: 文章内容
        num_sections: 章节数量

    Returns:
        各章节内容列表
    """
    # 按段落分割
    paragraphs = [p.strip() for p in content.split("\n") if p.strip()]

    if len(paragraphs) <= num_sections:
        return paragraphs

    # 尽量均匀分布
    section_size = len(paragraphs) // num_sections
    sections = []

    for i in range(num_sections):
        start = i * section_size
        if i == num_sections - 1:
            # 最后一个章节包含所有剩余段落
            end = len(paragraphs)
        else:
            end = start + section_size
        sections.append(" ".join(paragraphs[start:end]))

    return sections


def save_image_urls(images: list, output_file: str = "generated_images.json"):
    """
    保存生成的图片 URL 到文件

    Args:
        images: 图片信息列表
        output_file: 输出文件路径
    """
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "images": images
        }, f, indent=2, ensure_ascii=False)

    print(f"Image URLs saved to: {output_file}")


def download_image_to_local(url: str, local_path: Path) -> bool:
    """
    下载图片到本地文件夹

    Args:
        url: 图片 URL
        local_path: 本地保存路径

    Returns:
        True 成功，False 失败
    """
    try:
        response = requests.get(url, timeout=30, stream=True)
        if response.status_code == 200:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with open(local_path, "wb") as f:
                shutil.copyfileobj(response.raw, f)
            return True
        return False
    except Exception as e:
        print(f"  Download failed: {e}")
        return False


def save_images_to_local_gallery(
    images: list,
    article_title: str,
    date_stamp: Optional[str] = None,
    upload_to_r2: bool = True,
) -> dict:
    """
    将生成的图片下载到仓库 generated-images/article-images/<slug>/，
    使用统一命名；可选通过 POST /api/upload-image 写入 Cloudflare R2。

    Returns:
        {"success": True, "images": [...], "gallery_dir": ..., "upload_urls": [...]} 或 {"error": ...}
        每张图片 dict 增加：local_path, r2_url（上传成功时，供正文 HTML 使用）
    """
    date_stamp = date_stamp or datetime.now().strftime("%Y%m%d")
    article_slug = slugify_title(article_title)
    article_dir = LOCAL_IMAGE_DIR / article_slug

    try:
        article_dir.mkdir(parents=True, exist_ok=True)

        body_seq = 0
        enriched: list = []
        upload_urls: list = []

        for img in images:
            img_url = normalize_image_url(img.get("url"))
            if not img_url:
                enriched.append({**img})
                continue

            ext = ".jpg"
            if ".png" in img_url.lower():
                ext = ".png"
            elif ".gif" in img_url.lower():
                ext = ".gif"

            img_type = img.get("type", "section")
            if img_type == "cover":
                seq = 0
            else:
                body_seq += 1
                seq = body_seq

            filename = build_image_filename(date_stamp, article_slug, img_type, seq, ext)
            local_path = article_dir / filename

            if not download_image_to_local(img_url, local_path):
                enriched.append({**img, "local_path": None, "r2_url": None})
                print(f"  Skip (download failed): {filename}")
                continue

            print(f"  Saved: {local_path.relative_to(REPO_ROOT)}")

            row = {**img, "local_path": str(local_path)}
            r2_url = None
            if upload_to_r2:
                up = upload_local_file_to_r2_via_api(local_path)
                if "error" in up:
                    print(f"  Upload skipped: {up['error']}")
                else:
                    r2_url = up["url"]
                    upload_urls.append(r2_url)
                    print(f"  R2: {r2_url}")
            row["r2_url"] = r2_url
            row["url"] = r2_url or img.get("url")
            enriched.append(row)

        print(f"\n=== Saved {sum(1 for x in enriched if x.get('local_path'))} images under {article_dir} ===")
        return {
            "success": True,
            "saved_count": sum(1 for x in enriched if x.get("local_path")),
            "images": enriched,
            "gallery_dir": str(article_dir),
            "upload_urls": upload_urls,
        }

    except Exception as e:
        return {"error": f"Failed to save images locally: {str(e)}"}

# 使用示例
if __name__ == "__main__":
    # 测试用
    test_title = "Seedance 2.0: A New Era of AI Video Generation"
    test_content = """
    Seedance 2.0 represents a major breakthrough in AI video generation technology.
    The new model offers 4K video generation in under 30 seconds.
    Users can now create professional-quality videos from simple text prompts.
    The interface has been redesigned for better user experience.
    Multiple style options are now available for different use cases.
    """.strip() * 20  # 模拟更长内容

    test_topic = "AI video generation technology"

    print("Testing image generation...")
    images = generate_article_images(test_title, test_content, test_topic)
    print(f"\nFinal results: {images}")