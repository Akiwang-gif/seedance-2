"""
一次生成两篇 Seedance 相关英文文章：配图（本地 + R2）+ 保存网站草稿。

用法（在仓库根目录 seedance-2）:
  $env:CMS_WRITE_SECRET = "你的密钥"
  python .cursor\\skills\\seedance-autopublisher\\scripts\\run_two_seedance_drafts.py

依赖: requests；与 image_generator / draft_saver 相同环境。
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS / "image"))
sys.path.insert(0, str(SCRIPTS / "publisher"))

from draft_saver import save_draft  # noqa: E402
from image_generator import generate_article_images  # noqa: E402

# 两篇独立选题；正文为纯英文段落，用双换行分段（assemble_html 使用）
ARTICLES = [
    {
        "title": "Seedance 2.0 Pushes AI Video Toward Directorial Control",
        "description": "How newer text-to-video stacks give creators shot-level choices beyond a single prompt.",
        "topic": "AI video generation and creative control",
        "body": """
Seedance 2.0 sits in a crowded field of text-to-video tools, yet the product story is less about raw novelty and more about control. Creators are asking for repeatable looks, stable subjects across cuts, and language that reads like a brief rather than a lottery ticket.

The shift matters for small studios and solo makers who cannot reshoot scenes on demand. When a model exposes camera intent, timing, and layout as first-class inputs, the workflow starts to resemble planning a short film instead of gambling on a one-line prompt. Seedance 2.0 is positioned as part of that move: treat generation as a pipeline where each decision narrows the next.

Directorial control shows up when teams can specify how a scene moves. Pan, tilt, and zoom are not decorative labels; they communicate intent to the model the same way a shot list communicates intent to a crew. The more those knobs align with how your team already talks, the less time you spend translating between “creative language” and “model language.”

The shift also shows up in continuity. Marketing serials and episodic shorts fall apart when characters drift between clips. Any workflow that lets you pin identity, wardrobe, or environment across generations buys you consistency that raw text prompts rarely deliver alone. That is where Seedance 2.0 can earn a place in a stack: not as a magic wand, but as a repeatable renderer tied to decisions you already made.

Practical teams still face friction. File size, review cycles, and brand safety checks do not vanish the moment the model improves. What changes is the range of acceptable outputs before human touch-up. Teams that document their house style, palette, and pacing rules tend to get more mileage from any AI video tool, Seedance 2.0 included.

Audio remains the other half of the story. Silent renders can sell a mood board; finished social assets still need sound design, music licensing, and loudness that matches each platform. Plan audio early; otherwise picture edits may fight the beat you later commit to.

Hardware and API limits remain real. Long clips and high resolutions still stress budgets. The sensible path is to prototype in shorter segments, lock the look, then scale length once the pipeline is stable. Nothing in the current generation landscape removes the need for editorial judgment.

Handoffs deserve attention. Storyboards, reference frames, and clear review gates turn experiments into releases. Seedance 2.0 is one option in that stack. The question for each team is whether its controls map to the stories you need to tell this quarter.

Creators who treat the model as a collaborator—with limits, checklists, and iteration—will see the strongest results. Those who expect a single prompt to carry an entire campaign will keep hitting the same ceiling, no matter which logo sits on the API key.
""".strip(),
    },
    {
        "title": "What Creators Should Know About Seedance 2.0 in 2026",
        "description": "A practical look at capability claims, workflow fit, and where AI video still needs human oversight.",
        "topic": "Seedance 2.0 and AI video workflows",
        "body": """
Interest in Seedance 2.0 reflects a wider push to make AI video feel production-ready. The pitch is familiar: type a brief, receive footage, ship faster. Reality still depends on rights, platform rules, and the quality bar your audience expects.

For marketing and education teams, the value is often speed to rough cut. Internal reviews move when stakeholders can react to motion instead of static boards. Seedance 2.0 can slot into that loop if the team agrees on what “good enough” means for each channel. Social clips tolerate different artifacts than a paid spot.

Distribution plans shape technical choices. A vertical nine-by-sixteen clip for short-form feeds is not the same deliverable as a horizontal trailer. Export presets, safe margins, and caption placement should match the destination before you lock picture. Re-generating because the aspect ratio was wrong burns hours that no model upgrade fixes.

Technical buyers should read the fine print on usage, storage, and export formats. Models evolve quickly; API behavior and rate limits change with little fanfare. Locking dependencies in a test project before you wire everything into production saves painful rewrites.

Security and access control belong in the same conversation. Shared API keys, shared drives of raw renders, and unmanaged approvals multiply risk. Treat generated assets like any other production asset: versioned, permissioned, and traceable.

Ethics and disclosure remain non-negotiable. Audiences care about synthetic media labels in many regions. Teams that publish transparently about AI-assisted work reduce backlash and keep trust. Tools do not remove that responsibility.

Seedance 2.0 does not replace cinematographers or editors. It compresses early exploration. The strongest deployments pair generated clips with sound design, color, and legal review—the same finishing steps that separate drafts from releases.

Training and templates pay off. A short internal guide—“how we prompt for product shots,” “how we review skin tones,” “how we flag risky content”—raises the floor for everyone on the team. The model does not read your brand guide unless you encode it in prompts, references, and review steps.

If you are evaluating the stack, run a two-week pilot with one campaign. Measure time saved, revision counts, and brand risk. Numbers beat buzzwords when budgets are on the line.
""".strip(),
    },
]


def main() -> None:
    for i, art in enumerate(ARTICLES, start=1):
        print("\n" + "=" * 60)
        print(f"Article {i}/2: {art['title']}")
        print("=" * 60)

        images = generate_article_images(
            article_title=art["title"],
            article_content=art["body"],
            topic=art["topic"],
            upload_to_r2=True,
        )
        if not images:
            print(f"[Article {i}] No images produced; skipping draft save.")
            continue

        out = save_draft(
            title=art["title"],
            article_content=art["body"],
            description=art["description"],
            category="News",
            author="Seedance AI Team",
            images=images,
        )
        print(f"[Article {i}] Draft result: {out}")


if __name__ == "__main__":
    main()
