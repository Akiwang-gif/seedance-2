---
name: seo-landing-page
description: 基于 SERP 综合与搜索意图分析，生成或优化 SEO 落地页文案与 on-page SEO 元素；用于 landing page/SEO content/on-page SEO/SERP/搜索意图/落地页文案优化/复用布局改写等场景。
---

# SEO 落地页

## 概述
通过 SERP 研究、搜索意图对齐与信息增量，产出覆盖全面、可读性强的落地页文案，并同时输出完整的 on-page SEO 要素。

## 工具依赖

### Playwright MCP
本技能使用 Playwright MCP 进行 Google SERP 研究与信息增量检索。

**注意事项：**
- Google 会对自动化访问触发 reCAPTCHA 验证
- 首次使用时需在浏览器中手动完成验证
- 如遇验证阻断，提示用户手动完成后继续

**常用工具：**
- `mcp__playwright__browser_navigate` - 导航到 URL
- `mcp__playwright__browser_snapshot` - 获取页面快照（含元素 ref）
- `mcp__playwright__browser_click` - 点击元素
- `mcp__playwright__browser_type` - 输入文本
- `mcp__playwright__browser_press_key` - 按键操作
- `mcp__playwright__browser_take_screenshot` - 截图
- `mcp__playwright__browser_navigate_back` - 返回上一页
- `mcp__playwright__browser_tabs` - 标签页管理

## 工作流

### 1) 输入收集
- 目标关键词、业务背景、受众画像、转化目标、语言与地区。
- 品牌信息：品牌名称（用于 meta description 结尾，如 "Promptelle"、"AI Stock Report" 等）。
- 素材与限制：品牌口吻、产品卖点、法务限制、已有素材。
- 复用布局时提供基准页面：URL/文件路径/截图。

### 2) 选择布局模式
- `layout_mode = new`：生成新的页面结构与区块顺序。
- `layout_mode = reuse`：严格复用既有结构，只替换文案与 SEO 元素。

### 3) 选择输出模式
- `output_mode = plan`：先输出方案与待确认项，确认后再出完整稿。
- `output_mode = full`：直接输出完整页面文案与 SEO 要素。
- 未指定时默认 `output_mode = plan`。

### 4) SERP 研究（强制执行）

使用 Playwright MCP 进行 Google 搜索与深度分析。

**⚠️ 此步骤为强制执行，不可跳过或简化。**

**Step 1: 初始化搜索**
1. 调用 `TodoWrite`：创建 10 个待办项 "分析搜索结果 #1" 到 "分析搜索结果 #10"
2. 调用 `mcp__playwright__browser_navigate` 打开 `https://www.google.com/search?q=目标关键词`
3. 调用 `mcp__playwright__browser_snapshot` 获取搜索结果快照
4. 如遇 reCAPTCHA 验证，提示用户手动完成后继续

**Step 2: 逐一分析前 10 名结果（循环执行）**

对于 i = 1 到 10，依次执行以下操作：

```
1. 调用 TodoWrite：标记 "分析搜索结果 #{i}" 为 in_progress
2. 调用 mcp__playwright__browser_click：点击第 {i} 个搜索结果（使用 ref 引用）
3. 调用 mcp__playwright__browser_snapshot：获取目标页面完整快照
4. 立即输出以下格式的分析（不可省略任何字段）：

   ---
   ### 搜索结果 #{i}: [页面标题]
   - **URL**: [完整 URL]
   - **内容类型**: 博客/落地页/产品页/工具页/视频/论坛/...
   - **内容格式**: 清单/教程/对比/模板/评测/问答/...
   - **内容角度**: 最佳/最便宜/新手友好/快速/分步骤/专业/...
   - **H1**: [页面 H1 标题]
   - **H2 结构**: [列出主要 H2 标题]
   - **核心卖点**: [1-2 句总结]
   - **可借鉴点**: [值得学习的地方]
   - **信息缺口**: [该页面缺少什么]
   ---

5. 调用 mcp__playwright__browser_navigate_back：返回搜索结果页
6. 调用 TodoWrite：标记 "分析搜索结果 #{i}" 为 completed
```

**Step 3: 输出验证（强制检查点）**

在进入下一阶段（信息增量补充）前，必须满足以下条件：
- ✅ 已输出 10 个 "### 搜索结果 #X" 格式的分析块
- ✅ TodoWrite 中 10 个分析任务全部标记为 completed
- ❌ 如果少于 10 个，必须返回继续完成剩余分析

**禁止行为：**
- ❌ 仅查看搜索结果页摘要就进行分析
- ❌ 批量总结多个页面而不逐个输出分析块
- ❌ 跳过任何前 10 名结果（除非页面无法访问，需注明原因）
- ❌ 在未完成 10 个分析块前输出 "SERP 综合" 或进入下一阶段
- ❌ 使用 "根据搜索结果显示..." 等基于摘要的表述

**异常处理：**
- 如果某个页面无法访问（超时/403/404），输出 "### 搜索结果 #{i}: [无法访问] - 原因: ..."，然后继续下一个
- 如果搜索结果少于 10 个，分析全部可用结果并注明

**分析要点：**
- 提取意图特征、共性结构与关键子主题
- 发现信息缺口与可增量的独特角度
- 参考 `references/serp-research.md`

### 5) 信息增量补充
基于 SERP 分析发现的信息缺口，使用 Playwright MCP 检索补充资料：

**搜索流程：**
1. `mcp__playwright__browser_navigate` 打开 Google 搜索补充关键词
2. `mcp__playwright__browser_snapshot` 获取结果
3. 访问权威来源页面提取内容

**处理流程：**
- 整理可用补充点与来源链接。
- 先输出"信息增量候选清单"，询问是否需要加入正文。
- 如遇访问限制，说明限制并仅基于 SERP 与已有素材推进。

### 6) 结构与文案构建
- 基于 SERP 共性与意图确定 H1-H6 层级结构（不跳级）。
- 加入信息增量：经验、数据、案例、方法、原创框架。
- 避免拼贴式改写与关键词堆砌。
- 在正文末尾、页脚上方增加“更多内容/延伸阅读”区块。

### 7) On-page 优化输出
- 生成 Title、Meta description、URL slug。
- 输出 H1-H6 标题结构清单。
- 给出内链与外链建议。
- 需要时给出 FAQ 与 Schema JSON-LD。
- 参考 `references/on-page-checklist.md` 与 `references/linking-guidelines.md`。

### 8) 图片处理
- 有素材时：输出真实 URL + alt + width/height。
- 无素材时：输出占位信息（位置、用途、alt、尺寸或比例、状态=待替换）。

## 输出格式

### 页面定位
- 目标关键词
- 搜索意图总结
- 目标人群与转化目标

### SERP 综合
- 共性结构与子主题清单
- 信息缺口
- 预期信息增量与角度

### 输出模式
- `output_mode = plan`：输出结构方案、SEO 要素清单、信息增量候选清单（含来源）、图片占位清单。
- `output_mode = full`：输出完整页面文案与全部 SEO 要素。

### 页面文案
- `layout_mode = new`：按区块输出（Hero/价值主张/核心卖点/对比/案例/FAQ/CTA/更多内容）。
- `layout_mode = reuse`：输出替换表（区块名、原文案、新文案）。

### SEO 要素
- Title（≤60 字符）
- Meta description（≤160 字符，**必须以 " | {品牌名称}" 结尾**）
- URL slug
- H1-H6 标题列表

### 关键词密度核对
- 目标关键词出现次数
- 页面正文总词数
- 关键词密度（目标约 3%）

### 内外链
- 内链清单：锚文本、目标页类型、放置位置
- 外链清单：引用目的、来源、放置位置

### 图片清单
- 位置、用途、alt、尺寸或比例、状态

### Schema
- JSON-LD（FAQ/Product/HowTo 按需输出）

### 更新建议
- 何时更新与更新重点

## 质量标准
- 贴合搜索意图并覆盖关键子主题。
- 有明确的信息增量与差异化角度。
- 文案结构清晰、可扫读。
- 页面正文字数：英文不少于 800 词；其他语言按等价篇幅执行。
- 目标关键词密度约 3%，保持自然表达。
- 避免关键词堆砌与拼贴改写。

## 参考资料
- `references/serp-research.md`
- `references/on-page-checklist.md`
- `references/linking-guidelines.md`
