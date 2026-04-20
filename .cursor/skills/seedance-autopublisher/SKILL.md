---
name: seedance-autopublisher
description: 全自动AI热点文章发布技能。专门用于追踪Seedance 2.0及相关AI产品的最新动态，撰写高质量英文文章，生成配图，并自动保存到网站草稿箱。每周发布2篇精品文章。当用户要求自动发布文章、追踪AI热点、创建Seedance相关内容、或需要自动写作配图发布时使用此技能。
---

# Seedance Auto-Publisher

全自动 AI 热点文章发布技能 — 专门为 Seedance 2.0 及相关 AI 产品内容创作而设计。

## 核心工作流

```
[热点发现] → [选题判断] → [文章撰写] → [配图生成] → [草稿保存]
```

---

## 配置信息

### API 配置
- **nanobanana API**: `https://api.apimart.ai/v1/images/generations`
- **nanobanana Model**: `gemini-3-pro-image-preview`
- **nanobanana API Key**: `sk-2pb9fhQj3lIScGqcGhlJ5cMuJ5ClDkdMaxgOn7d1E2yGRsXm`
- **网站 API**: `https://www.seedance-2.info/api/articles`
- **CMS Bearer Token**: `prairiedogs1`
- **配图上传（R2）**: 使用站点 `POST /api/upload-image`，将文件写入 Cloudflare **R2** bucket（仓库 `wrangler.toml` / `.env.example` 中名为 **`seedance-2-upload`**）。需要 **`CMS_WRITE_SECRET`**（与后台 / `admin.html` 的 API key 一致）。**推荐**在仓库根目录 **`.env.local`** 中写一行 `CMS_WRITE_SECRET=...`（已 gitignore）；`image_generator.py` 启动时会自动加载，**Cursor 后台跑的 Python 也能读到**，不必依赖你在终端里临时 `export`。可选 **`SEEDANCE_UPLOAD_IMAGE_URL`**（默认 `https://www.seedance-2.info/api/upload-image`）。**不要把密钥发在聊天里**——助手无法替你写入本机文件或环境变量。

### 发布规则
- **发布频率**: 每周 2 篇文章
- **发布状态**: 始终保存为草稿，不直接发布
- **文章语言**: 全英文
- **文章长度**: 500-1500 词
- **配图数量**: 根据字数调整 (500词=3图, 1000词=4图, 1500词=5图)
- **封面图**: 第1张图，16:9 比例，简洁风格
- **配图比例**: 4:3 或 16:9

---

## 模块 1: 热点发现

### MCP 与工具（Cursor 中常见命名）

热点发现**不依赖本地爬虫脚本**，由 Agent 直接调用已配置的 MCP：

| MCP Server（名称以你本机 `mcp.json` 为准） | 典型工具 | 用途 |
|------------------------------------------|----------|------|
| `user-tavily-mcp` | `tavily_search` 等 | 新闻/网页检索，支持 `include_domains` 限定站点 |
| `user-exa-mcp` | `web_search_exa` 等 | 语义/关键词搜索，支持 `includeDomains` 限定域名 |

若 Server 名称不同，以 Cursor MCP 列表中的实际名称为准，工具名同理。

### 数据源与域名策略

对 **X、Reddit、微博、Google 资讯、YouTube、主流新闻站** 等，用 **「平台定向搜索」**：同一主关键词，多轮调用，每轮用 `include_domains` / `includeDomains` 限制在对应域名（两工具各跑一轮或交叉验证，避免单源盲区）。

**建议域名分组（可按需增减）：**

- **X / Twitter**：`x.com`，`twitter.com`
- **Reddit**：`reddit.com`
- **微博（中文）**：`weibo.com`
- **YouTube**：`youtube.com`
- **综合检索 / 新闻聚合（Google 侧结果）**：不强制域名时用英文 query + `site:` 或交给 Tavily `topic: "news"`；或限定主流媒体，例如：`reuters.com`，`apnews.com`，`bbc.com`，`theguardian.com`，`bloomberg.com`，`techcrunch.com`，`theverge.com`，`arstechnica.com`，`wired.com`

说明：部分平台对第三方抓取有限制；若某域名结果为空，放宽为「同轮不加域名限制 + query 中含平台名」，或换用另一 MCP 再搜。

### 搜索关键词

主关键词: `Seedance 2.0`  
相关产品: `AI video generation`，`text-to-video`，`AI content creation`，`video AI`，`AI tool`  
中文补充（微博等）: `Seedance`，`AI视频`，`文生视频`

### 热度筛选规则

1. **时间范围**: 2 周内（14 天）的资讯；Exa 可用 `freshness`（若工具支持），Tavily 可用 `days` / 深度参数（以实际 schema 为准）。
2. **热度阈值**: 多源融合评分 > 60 分。
3. **去重规则**: 相似话题合并，保留最新或讨论最集中的一条。

### 执行步骤

**Step 1: 并行多轮搜索（Tavily + Exa 都用）**

对每一类站点，**至少各调用一次** `tavily_search` 与 `web_search_exa`（参数名以小节为准：`include_domains` vs `includeDomains`），查询模板如下（将 `{KW}` 换为主关键词或组合词）：

| 轮次 | 目标 | 示例 `query` | `include_domains` / `includeDomains` |
|------|------|----------------|--------------------------------------|
| A | X 实时讨论 | `{KW} OR AI video` | `x.com`, `twitter.com` |
| B | Reddit 深度帖 | `{KW} discussion OR review` | `reddit.com` |
| C | 微博中文热点 | `{KW} AI 视频`（中英混合） | `weibo.com` |
| D | YouTube 评测/演示 | `{KW} tutorial OR review 2026` | `youtube.com` |
| E | 国际新闻稿 | `{KW} announcement OR launch` | `reuters.com`, `apnews.com`, `bbc.com`, `bloomberg.com` 等 |
| F | 科技媒体 | `{KW} hands-on OR benchmark` | `techcrunch.com`, `theverge.com`, `arstechnica.com`, `wired.com` |

额外 **不设域名** 的广搜 1～2 次（用于捕获长尾与小型站点）：  
`{KW} latest news 2026`，`AI video generation Seedance comparison`。

**Step 2: 整合并评分**

汇总两工具返回的标题、摘要、链接，按来源加权（可微调）：

- X：28%（时效）
- Reddit：22%（讨论深度）
- YouTube：15%（演示与舆论）
- 主流新闻 + 科技媒体：25%（可信度）
- 微博等中文源：10%（区域热点）

若某类无结果，权重按比例分摊到其余类，并在选题报告中注明。

**Step 3: 输出 TOP 选题**

```json
{
  "topics": [
    {
      "title": "Seedance 2.0 Announces Revolutionary Video Generation",
      "sources": ["x.com: …", "reddit.com: …", "reuters.com: …"],
      "heat_score": 85,
      "date_range": "2026-03-25 to 2026-03-31",
      "related_products": ["Midjourney", "Sora", "Kling"],
      "suggested_angle": "技术分析"
    }
  ]
}
```

---

## 模块 2: 选题判断

### 选题标准

**必须满足:**
- 时效性: 发布时间的2周内
- 相关性: 与 Seedance 2.0 直接相关
- 价值性: 对 AI 爱好者/从业者/技术人员有参考价值

**自动判断:**
- 如果同一话题已有3篇以上相关文章，跳过
- 如果话题热度骤降（下降>50%），跳过

### 人工确认环节

在进入写作前，输出选题报告：
```
候选选题 #1: [标题]
- 热度评分: XX/100
- 来源统计: X(XX), Reddit(XX), YouTube(XX), 新闻站(XX), 微博(XX), 其他(XX)
- 推荐理由: [一句话说明]
- 是否采用? (Y/N)
```

等待用户确认后再继续。

---

## 模块 3: 文章撰写

### 写作风格 (3选1)

根据选题类型自动选择或用户指定：

#### 风格 A: 新闻专业风 (News)
- **适用**: 重大发布、产品更新、官方公告
- **特征**: BBC/CNN式，客观中立，倒金字塔结构，权威引用
- **语气**: 正式，严谨，专业

#### 风格 B: 网络娱乐风 (Casual)
- **适用**: 教程、趣味性内容、新手入门
- **特征**: 轻松幽默，网络热梗，第一人称，短句为主
- **语气**: 友好，随意，亲近感

#### 风格 C: 深度分析风 (Analysis)
- **适用**: 行业洞察、对比评测、技术解析
- **特征**: 多角度论证，数据支撑，建议总结
- **语气**: 深入，专业，全方位

### 写作规则

**必须遵守:**
1. **全英文写作** - 语法正确，表达地道
2. **500-1500词** - 根据内容深度调整
3. **SEO自然植入** - 关键词: `Seedance 2.0`, `AI video generation`, `AI video tool`, `text-to-video`, `AI content creation`
4. **多样化句式** - 避免重复句型结构
5. **短段落** - 每段 2-4 句，避免大段落堆积
6. **避免机械感** - 参考 `references/avoid_words.md` 的禁用词表

**禁用词汇 (必须完全避免):**

**递进/逻辑词:**
however, furthermore, therefore, thus, in conclusion, for example, obviously, it is worth noting, undeniably, to some extent, in other words, despite this, inevitably, in fact, on one hand...on the other hand, significantly, especially, based on the above analysis, undoubtedly, compared to, it can be seen, as mentioned above, on the contrary, thus, the above-mentioned, this indicates

**结构词:**
firstly, secondly, finally, first, second, third, additionally, moreover, next, then, eventually, because, so, generally speaking, to summarize, in brief, as a result, as said before, in summary, of course

**文章结构模板:**

```
## [Catchy but Informative Headline]

[Opening paragraph - 2-3 sentences, hook the reader with the key news]

## The Big News: [Subheading]

[3-4 paragraphs explaining what happened, why it matters]

## Key Features That Stand Out

[2-3 paragraphs on specific features/capabilities]

## What This Means for [Target Audience]

[1-2 paragraphs on impact]

## The Competitive Landscape

[Optional - if comparing with other tools, 2-3 paragraphs]

## How to Get Started

[If applicable - tutorial section, 2-3 paragraphs]

## The Bottom Line

[Closing thoughts - 2-3 sentences]
```

### 执行步骤

**Step 1: 收集资料**
使用 `user-tavily-mcp` / `user-exa-mcp`（`tavily_search`、`web_search_exa` 等）搜索选题相关的详细信息：
- 官方发布内容
- 技术细节/规格
- 用户反馈/评测
- 竞品对比信息

**Step 2: 生成大纲**
根据选择的风格，生成文章大纲，输出给用户确认

**Step 3: 撰写初稿**
按大纲逐节撰写，注意：
- 每段聚焦一个主题
- 使用主动语态
- 句子长度有变化
- 自然过渡（不用禁用词）

**Step 4: SEO 优化**
- 标题包含主关键词 `Seedance 2.0`
- 首段前100词内植入关键词
- 关键词密度: 1-2%（自然分布）
- 使用 1-2 个相关关键词子主题

**Step 5: 自检**
完成后检查：
- [ ] 无禁用词汇
- [ ] 语法正确
- [ ] 句子多样化
- [ ] 关键词自然分布
- [ ] 字数在 500-1500 范围内

---

## 模块 4: 配图生成

### nanobanana API 调用

**端点**: `POST https://api.apimart.ai/v1/images/generations`
**认证**: `Authorization: Bearer sk-2pb9fhQj3lIScGqcGhlJ5cMuJ5ClDkdMaxgOn7d1E2yGRsXm`

### 图片数量规则

| 文章字数 | 配图数量 | 说明 |
|----------|----------|------|
| 500-750 词 | 3 张 | 封面 + 2张正文 |
| 751-1000 词 | 4 张 | 封面 + 3张正文 |
| 1001-1500 词 | 5 张 | 封面 + 4张正文 |

### 风格轮换规则

按以下顺序循环，避免连续相同风格：
1. 科技风格 (Tech)
2. 自然风格 (Natural)
3. 漫画风格 (Cartoon)
4. 图标风格 (Iconic)
5. 真人人像 (Portrait)
6. 抽象元素 (Abstract)

**规则:**
- 封面图使用风格 1 或 2 (科技/自然)
- 正文配图按顺序轮换，不重复
- 避免元素堆积，一张图聚焦一个主题

### 配图内容规划

| 图片位置 | 内容 | 比例 | 风格 |
|----------|------|------|------|
| 封面图 | 文章主题核心展示 + 简洁设计 | 16:9 | Tech/Natural |
| 图2 | 文章第2段/第2章节相关 | 4:3 或 16:9 | 轮换 |
| 图3 | 文章第3段/第3章节相关 | 4:3 或 16:9 | 轮换 |
| ... | ... | ... | ... |

### API 调用示例

```python
import requests
import time

API_KEY = "sk-2pb9fhQj3lIScGqcGhlJ5cMuJ5ClDkdMaxgOn7d1E2yGRsXm"
API_URL = "https://api.apimart.ai/v1/images/generations"

def generate_image(prompt, size="16:9", resolution="1K"):
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
    response = requests.post(API_URL, json=payload, headers=headers)
    return response.json()

def check_task_status(task_id):
    status_url = f"https://api.apimart.ai/v1/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    response = requests.get(status_url, headers=headers)
    return response.json()
```

### 配图提示词生成

为每张图生成专门的 prompt：
- **封面 prompt**: `Clean tech-themed illustration showing [core topic], minimal design, no text, 16:9 aspect ratio, professional`
- **正文 prompt**: `Illustration representing [specific section content], [style] style, focused composition, avoid clutter`

### 本地保存与 Cloudflare R2 上传（必选流程）

配图生成后 **必须** 走脚本化流程（`scripts/image/image_generator.py`），不要只保留 nanobanana 临时 URL。

1. **本地目录（仓库内）**  
   - 根目录：`generated-images/article-images/`（已加入 `.gitignore`，不提交二进制图）  
   - 每篇文章一个子文件夹：以标题 **slug** 命名（小写、连字符、截断长度，与脚本 `slugify_title` 一致）。

2. **文件命名规则**  
   - 格式：`YYYYMMDD_<article-slug>_cover.<ext>`、`YYYYMMDD_<article-slug>_body01.<ext>`、`body02`…  
   - `ext` 根据源 URL 判定（`.png` / `.jpg` 等）。

3. **上传到 R2**  
   - 对每个本地文件 **POST** `multipart/form-data`，字段名 **`image`**，到 **`/api/upload-image`**（生产环境或你配置的 `SEEDANCE_UPLOAD_IMAGE_URL`）。  
   - 请求头：`Authorization: Bearer <CMS_WRITE_SECRET>`。  
   - 服务端将对象写入 R2 bucket **`seedance-2-upload`**，对象键形如 `articles/<timestamp>_<随机>_<文件名>`（与 `api/upload-image.js` / `functions/api/upload-image.js` 一致）。  
   - 响应 JSON 中的 **`url`** 即为公网可嵌入地址（前缀为 `CMS_UPLOAD_PUBLIC_BASE`，如 `*.r2.dev` 或自定义域）。

4. **脚本参数**  
   - `generate_article_images(..., upload_to_r2=True)`：为 `False` 时仅下载并本地命名，不上传（便于离线调试）。

5. **写入正文（保存草稿前）**  
   - 提交到网站后台草稿时，**只允许**在 `bodyHtml` 里使用 **Cloudflare R2 公网 URL**（`https://...`，通常为 `*.r2.dev/.../articles/...`），与 `image_generator` 上传成功后的 **`r2_url` / `url`** 一致。  
   - **禁止**把 `local_path`、`C:\...`、`generated-images/...`、`file://` 写进 `bodyHtml`；读者浏览器无法访问你本机路径。  
   - **禁止**依赖「向 `/api/articles` 再附带本机图片文件」——文章 API 只接收 JSON；图片必须先经 **`/api/upload-image`** 进 bucket，再用返回的 URL 嵌入正文。

---

## 模块 5: 发布保存

### 网站 API 调用

**端点**: `POST https://www.seedance-2.info/api/articles`
**认证**: `Authorization: Bearer prairiedogs1`
**Content-Type**: `application/json`
**状态**: `"draft"` (始终保存为草稿)

### 请求 Body 格式

```json
{
  "title": "Seedance 2.0: The Future of AI Video Generation",
  "description": "A comprehensive look at Seedance 2.0 and its impact on AI content creation",
  "category": "News",
  "author": "Seedance AI Team",
  "cardTitleFontFamily": "Inter",
  "cardTitleFontSize": "16px",
  "cardTitleColor": "#1d1d1f",
  "cardTitleFontWeight": "normal",
  "cardTitleFontStyle": "normal",
  "status": "draft",
  "bodyHtml": "<p>...</p>"
}
```

### 图片嵌入方式（草稿箱）

将配图以 HTML `<img>` 嵌入 `bodyHtml`。**必须使用** 已上传至 R2 的 **https 公网 URL**（`scripts/publisher/draft_saver.py` 中 `image_src_for_cms()` 只接受 `r2_url` / `url` 中的 `http(s)`，忽略 `local_path`）。与 `api/media`、站点允许的 `*.r2.dev` 规则一致。

示例（域名以你环境为准）：
```html
<img src="https://pub-xxxx.r2.dev/articles/1730000000000_abc123_20260416_my-article_cover.png" alt="description" />
```
（实际域名以 `CMS_UPLOAD_PUBLIC_BASE` / 控制台 R2 公共访问为准。）

### 执行步骤

**Step 1: 确认配图已上云**  
`generate_article_images(..., upload_to_r2=True)` 且每张图有 **`r2_url`**（或等价的 https `url`）。若某张未上传成功，不要把它写入 `bodyHtml`，或先修复上传。

**Step 2: 组装 HTML**  
使用 `draft_saver.assemble_html()` 或等价逻辑，**仅**把上述 R2 URL 写入 `<img src>`。

**Step 3: 调用 API**  
`POST` 网站 `/api/articles`，`status` 为 `"draft"`，**不要**在请求里夹带本地图片文件。

**Step 4: 记录任务**  
保存返回的文章 ID 和状态到工作区。

---

## 数据追踪

每周检查以下指标：
- **SEO排名**: 检查目标关键词在 Google 的排名变化
- **阅读量**: 通过网站后台查看文章统计

---

## 完整执行流程

```
1. [热点发现] → 使用 `user-tavily-mcp` + `user-exa-mcp` 按域名分组多轮搜索（X / Reddit / 微博 / YouTube / 新闻与科技媒体）
2. [选题判断] → 汇总评分，输出 TOP3 候选，用户确认
3. [资料收集] → 使用 Tavily + Exa MCP 深挖选题详情（可继续用域名限定与广搜结合）
4. [风格选择] → 根据选题类型选择新闻/娱乐/分析风格
5. [大纲生成] → 生成文章大纲，用户确认
6. [文章撰写] → 按大纲写稿，自检禁用词
7. [配图生成] → 调用 nanobanana 生成配图 → 保存到 `generated-images/article-images/<slug>/` → 上传 R2（`/api/upload-image`）
8. [组装发布] → 用 R2 的 https URL 组装 `bodyHtml`（不用本地路径），POST 到网站草稿箱
9. [人工审核] → 用户在后台审核后手动发布
```

---

## 参考文件

- `references/writing_styles.md` - 3种写作风格详细指南
- `references/avoid_words.md` - 禁用词汇清单 (英文版)
- `references/seo_guidelines.md` - SEO 关键词和最佳实践
- `references/source_citation.md` - 引用和来源标注规范
- `scripts/image/image_generator.py` - nanobanana API 调用脚本
- `scripts/publisher/draft_saver.py` - 网站草稿保存脚本
- `scripts/run_draft_e2e_test.py` - 第二步自测：`text` 仅 POST 草稿，`full` 配图+R2+草稿
- `scripts/run_two_seedance_drafts.py` - 一次生成两篇英文稿并配图、上传 R2、保存草稿