"""
一次生成两篇 Seedance 相关英文文章：配图（本地 + R2）+ 保存网站草稿。

用法（在仓库根目录 seedance-2）:
  $env:CMS_WRITE_SECRET = "你的密钥"
  python .cursor\\skills\\seedance-autopublisher\\scripts\\run_two_seedance_drafts.py

依赖: requests；与 image_generator / draft_saver 相同环境。

正文长度标准（与 SKILL.md 一致）：约 700 英文词，允许 ±50 词漂移。
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS / "image"))
sys.path.insert(0, str(SCRIPTS / "publisher"))

from draft_saver import save_draft  # noqa: E402
from image_generator import generate_article_images  # noqa: E402

# 与技能默认一致：生成与校验时以此为字数锚点
TARGET_WORD_COUNT = 700

# 两篇独立选题；正文为纯英文段落，用双换行分段（assemble_html 使用）
ARTICLES = [
    {
        "title": "Seedance 2.0 Pushes AI Video Toward Directorial Control",
        "description": "How newer text-to-video stacks give creators shot-level choices beyond a single prompt.",
        "topic": "AI video generation and creative control",
        "body": """
Seedance 2.0 lands in a crowded lane of AI video generation tools, yet the practical question for teams is not whether motion looks impressive in a demo reel. The practical question is whether a pipeline can repeat decisions under deadline pressure without drifting identity, lighting, or intent between takes.

Small studios notice the gap quickly. A reshoot costs money, while a flawed render still burns review hours if the model loses continuity between clips. Seedance 2.0 is positioned around a simple promise: treat generation closer to shot planning, where camera movement, pacing, and framing are expressed in language your crew already uses when blocking a scene.

That alignment matters where marketing, product, and editorial teams overlap. Each group describes motion with slightly different vocabulary. When a model accepts direction in familiar terms, translation overhead drops and iteration speeds up. Less time is spent reconciling what stakeholders meant with what the renderer produced.

Continuity remains the hardest stress test. Campaigns that rely on a returning character, a stable product hero frame, or a fixed interior set fall apart when wardrobe, facial structure, or background logic wobbles between outputs. Any serious evaluation of Seedance 2.0 should score sequence-level stability, not single-frame beauty.

Compute budgets are real. Longer clips, higher resolutions, and heavier motion raise cost and upload time. Teams that prototype in shorter slices, lock identity and lighting early, then extend duration once the pipeline is stable tend to avoid expensive late-stage re-renders after approvals have already started.

Audio still splits the story. Silent previews can sell mood internally, while public assets still need licensed music, dialogue polish, and loudness that matches each destination. If audio is treated as an afterthought, picture edits fight pacing near ship day. Seedance 2.0 may accelerate visuals, yet finishing remains skilled human work.

Review rigor does not disappear with a stronger model. Brand palettes, legal guardrails, and sensitivity checks remain gates on the way out the door. The shift is that more drafts clear an acceptable bar before hand touch-up, which compresses calendar time rather than removing quality control entirely.

Operational security belongs in the same plan as creativity. Shared API keys, wide-open render folders, and unmanaged approvals multiply risk. Treat generated assets like production assets: permissioned storage, rotated credentials, and traceable ownership for each deliverable ID.

Documentation turns experiments into releases. Prompt packs, reference stills, and non-negotiables should live beside each version label. When leadership asks what changed between version six and version seven, the answer should be a short diff, not a memory exercise.

Measurement should stay grounded in throughput. Track revision rounds, median approval time, and the share of renders that ship untouched. Those numbers reveal whether Seedance 2.0 is improving real workflows, beyond one-off clips shared in chat threads.

Editorial coaching still moves quality. Junior reviewers benefit from a simple rubric: identity drift, hand physics, text legibility, and brand color integrity. A shared rubric keeps feedback consistent across shifts and reduces thrash when multiple editors touch the same clip.

Vendor lock-in is worth naming explicitly. Export formats, metadata fields, and archive paths should not assume a single tool will stay static across twelve months. Keep masters in formats your finishing chain already tolerates, and store prompts alongside renders so you can rebuild if pricing or policy shifts.

Handoffs to post houses run smoother with predictable naming, timecode notes, and a single source of truth for aspect targets. If downstream colorists receive inconsistent gamma or frame cadence, the AI speed upstream stops mattering.

Benchmarks should stay tied to briefs you already shoot. Run the same creative brief across tools with identical references, then grade motion fidelity, instruction adherence, and time-to-approval under the same reviewers. A disciplined harness prevents cherry-picked hero clips from driving procurement.

Keep weekly scorecards lightweight so busy leads record numbers in five minutes instead of skipping the habit.

Pilot design still matters. Pick one narrow use case, run it for two weeks, and grade outcomes with a small scorecard: time saved, artifact rate, brand incidents, and stakeholder satisfaction. Numbers beat slogans when budgets are tight.

Seedance 2.0 works best as a renderer tied to decisions you already trust: a shot plan, a clear client ask, and editorial taste about what finished means for each channel.
""".strip(),
    },
    {
        "title": "What Creators Should Know About Seedance 2.0 in 2026",
        "description": "A practical look at capability claims, workflow fit, and where AI video still needs human oversight.",
        "topic": "Seedance 2.0 and AI video workflows",
        "body": """
Interest in Seedance 2.0 reflects a wider push to make AI video feel production-ready for everyday marketing and education teams. The familiar pitch is speed: type a brief, receive footage, move reviews earlier. The practical outcome still depends on rights, platform rules, and the quality bar your audience expects on each channel.

Marketing groups often win early value from rough motion. Stakeholders react faster to pacing and transitions than to static boards, which can unblock approvals earlier in the week. Seedance 2.0 can support that loop when the team defines what good enough means per surface: a vertical social clip tolerates different artifacts than a landing page hero.

Distribution choices shape technical settings. A nine-by-sixteen short is not the same deliverable as a horizontal trailer. Safe margins, caption placement, and export presets should match the destination before picture locks. Rebuilding exports after aspect mistakes burns hours that no model refresh fixes.

Technical buyers should read usage limits, storage policies, and export formats with care. APIs change behavior quietly across releases. Wiring dependencies into a throwaway integration project before production rollout prevents painful rewrites when a field name shifts or a queue policy tightens.

Access control deserves the same attention as creative direction. Shared keys, shared drives of raw renders, and unmanaged approvals multiply risk. Treat generated media like any other sensitive asset: versioned, permissioned, and traceable from prompt to published file.

Rights and disclosure expectations vary by region. Audiences increasingly expect clarity about synthetic media in many markets. Teams that publish with transparent labeling reduce backlash and preserve trust. Tools do not remove accountability for how a clip is presented.

Accessibility is part of quality, not an add-on. Captions, contrast, and readable on-screen text still need human review, especially when AI video introduces rapid cuts or dense overlays. Seedance 2.0 can speed visual drafting, yet human editors still validate legibility across devices.

International rollouts add another layer. Latency, billing currency, data residency questions, and support hours should be validated against real traffic patterns, not only a single-region test. Run a small production batch during busy windows and measure queue variability alongside median completion time.

Cost modeling should include storage and egress, not only per-second generation pricing. Video blobs accumulate quickly. Decide retention windows, whether intermediates should be deleted after approval, and how CDN caching supports repeat views.

Training pays off. A short internal guide on prompting for product shots, reviewing skin tones, and flagging risky content raises the floor for everyone on the team. The model does not read your brand guide unless you encode it in prompts, references, and review steps.

Reliability drills belong in the schedule. Simulate failures: a stuck job, a partial download, a rejected asset policy, and a sudden quota throttle. Your runbook should say who reruns, who notifies the client, and how to preserve the creative intent without duplicating spend.

Localization adds nuance. Copy, on-screen typography, and cultural references still need native review even when visuals look polished. Seedance 2.0 can shorten the path to motion, but language accuracy remains a human gate.

Stakeholder education reduces churn. Show examples of acceptable micro-artifacts versus show-stoppers. Shared vocabulary prevents endless subjective loops where every reviewer chases a different definition of cinematic.

Analytics hygiene still matters. Tag landing pages consistently, keep campaign naming stable, and avoid mixing unrelated experiments inside one ad group where wins cannot be attributed. Clean measurement protects budgets when leadership asks what actually moved the needle.

Paid and organic journeys should line up with the same landing truth. If an ad promises a specific feature, the page should show that story above the fold. Mismatched promises inflate bounce rates and waste AI video cycles on traffic that never intended to stay.

Link each render ID to a campaign brief ID so finance can trace spend back to a customer story instead of a mystery folder.

Pilot discipline still wins. Run a two-week trial on one campaign, track time saved, revision counts, and brand-risk incidents, then decide whether to expand budgets or add new channels.

Seedance 2.0 compresses exploration; it does not replace editorial judgment, legal review, or sound finishing. The strongest deployments pair fast renders with the same finishing steps that separate drafts from releases.
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
