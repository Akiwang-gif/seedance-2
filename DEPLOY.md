# 部署说明 / Deploy Guide

## 方式一：Vercel（推荐，已绑定 GitHub）

网站已配置为在 Vercel 上运行：静态页面 + Serverless API（文章存 Vercel KV，图片存 Vercel Blob）。

### 步骤

1. 打开 **https://vercel.com**，用 GitHub 登录。
2. 点击 **Add New** → **Project**，选择仓库 **Akiwang-gif/seedance-2**。
3. **Framework Preset** 保持为 **Other**（或选 None），无需改 Build 命令。
4. 在项目 **Settings** → **Environment Variables** 无需手动填 KV/Blob（见下）。
5. 在 Vercel 项目内：
   - **Storage** → 创建 **KV (Redis)**，绑定到本项目（会自动注入 `KV_*` 环境变量）。
   - **Storage** → 创建 **Blob**，绑定到本项目（会自动注入 `BLOB_READ_WRITE_TOKEN`）。
6. 点击 **Deploy**。部署完成后会得到地址，例如：  
   `https://seedance-2-xxx.vercel.app`  
   首页、文章、后台均可使用；后台上传的图片会存到 Blob 并显示完整 URL。

### 每次改完代码如何自动部署？

**推荐做法（无需额外配置）**：在 Vercel 项目 **Settings** → **Git** 中确认已连接 GitHub 仓库 **Akiwang-gif/seedance-2**，且 **Production Branch** 为 `main`。之后每次在本地执行 `git push origin main`（或合并 PR 到 `main`），Vercel 会自动拉取最新提交并部署，无需手动点 Redeploy。

**可选**：若因故未使用 Vercel 的 Git 集成，可在 Vercel → **Settings** → **Git** → **Deploy Hooks** 创建指向 `main` 的 Production Hook，把 Hook 的 URL 加到 GitHub 仓库 **Settings** → **Secrets and variables** → **Actions**，名称设为 `VERCEL_DEPLOY_HOOK`。推送 `main` 时，仓库里的 workflow `.github/workflows/deploy-vercel.yml` 会请求该 Hook 触发部署。**注意**：若同时开启 Vercel Git 集成与本 Hook，一次推送可能触发两次构建，一般只保留其中一种即可。

### 首页没有显示后台上传的文章？

**原因**：文章数据存在 **Vercel KV** 里，若未创建并绑定 KV，接口会返回空列表，首页就一直是占位内容。

**操作步骤**（在 Vercel 项目里）：

1. 打开项目 → 顶部 **Storage**（或 **Create** → **Storage**）。
2. 点击 **Create Database** → 选 **KV (Redis)** → 起名（如 `seedance-kv`）→ 创建。
3. 进入该 KV → **Connect to Project** → 选择当前 **seedance-2** 项目 → 确认。
4. 再 **Create** → 选 **Blob**（存图片）→ 创建后同样 **Connect to Project** 选本项目。
5. 回到 **Deployments**，点最新部署右侧 **⋯** → **Redeploy**，等部署完成。

完成后：在 **https://你的域名/admin.html** 发布一篇测试文章，再刷新首页即可看到。

**发布了文章还是不显示？** 请依次检查：
1. **Redeploy**：连好 KV 后必须在 Deployments 里对最新部署点 **Redeploy**，否则接口拿不到 KV 环境变量。
2. **环境变量**：项目 **Settings** → **Environment Variables**，确认存在 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN`（若连接时用了自定义前缀，会显示为带前缀的名称，代码已做兼容）。
3. **后台是否报错**：发布时若提示失败，多半是 KV 未连接或未 Redeploy；若提示成功但首页仍空，再 Redeploy 一次并等 1～2 分钟后再刷新首页。
4. **调试接口**：在浏览器打开 `https://你的域名/api/articles`，在开发者工具 **Network** 里看该请求的 **Response Headers**：`X-Store` 为 `none` 表示未配置存储（需添加 Upstash/KV 并 Redeploy）；为 `upstash`/`kv`/`redis` 表示已连接，若 `X-Articles-Count` 为 0 则当前库内无文章，去后台发一篇再刷新。

**只有 REDIS_URL、文章仍不显示？**  
Vercel Serverless 下用 TCP 连 Redis（REDIS_URL）有时会超时或连不上。可改用 **Upstash Redis（HTTP REST）**，在 serverless 下更稳定：
1. 在 Vercel 左侧 **Storage** 或 [Vercel Marketplace](https://vercel.com/marketplace) 搜索 **Upstash Redis**，创建并连接到本项目；或到 [upstash.com](https://upstash.com) 创建 Redis，复制 **REST URL** 和 **REST Token**。
2. 在项目 **Settings → Environment Variables** 添加 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`（Upstash 连接时会自动注入）。
3. **Deployments** 里对最新部署 **Redeploy**。文章接口会优先使用 Upstash，首页即可正常拉取列表。

若你希望继续用现有 KV 且使用 `KV_REST_API_*`，可做一次「断开再连接，前缀留空」：

1. 打开项目 **Settings** → **Environment Variables**。
2. 找到 **REDIS_URL** 那一行，点右侧 **⋯** → **Remove**，确认删除。
3. 在左侧或 Storage 里打开你的 **KV 数据库**（如 seedance-kv）→ 点 **Connect Project**（或 **Connect project options** → **Connect to this project**）。
4. 若出现 **「Environment Variable Prefix」** 或 **「变量名前缀」** 输入框：**不要填任何内容，留空** → 保存。
5. 回到 **Settings** → **Environment Variables**，确认已出现 **KV_REST_API_URL** 和 **KV_REST_API_TOKEN**。
6. **Deployments** → 最新部署 **⋯** → **Redeploy**，等完成后在后台再发一篇测试文章并刷新首页。

---

## 方式二：Render（免费）

网站含 Node 后端（CMS 接口），用 [Render](https://render.com) 可一键部署前后端。

### 步骤

1. 打开 **https://render.com**，用 GitHub 登录。
2. 点击 **New** → **Blueprint**（或 **Web Service**）。
3. **Connect repository**：选择 `Akiwang-gif/seedance-2`。
4. 若用 Blueprint：
   - Render 会识别仓库根目录的 `render.yaml`，自动创建 Web 服务。
   - 直接点 **Apply** 即可。
5. 若手动建 Web Service：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`（已配置为 `node server-cms.js`）
   - **Instance Type**: 选 Free。
6. 部署完成后会得到一个地址，例如：  
   `https://seedance-2-xxxx.onrender.com`  
   首页、文章页、后台均可在此域名下使用。

### 注意

- **免费实例** 一段时间无访问会休眠，首次打开可能需等待几十秒。
- 文章与上传图片存在 Render 实例磁盘，**重新部署或实例重建会清空**。若需持久化，可后续接入数据库与对象存储。

---

## 方式三：仅静态站（GitHub Pages）

若只部署静态页面（无后台、无文章接口）：

1. 仓库 **Settings** → **Pages** → Source 选 **GitHub Actions**。
2. 在仓库根目录创建 `.github/workflows/deploy-pages.yml`，用 workflow 把 `index.html`、`article.html` 等静态文件发布到 GitHub Pages。

注意：这样部署后首页文章列表为空（无 `/api/articles`），仅适合做展示或配合其它后端使用。

---

## 方式四：Cloudflare Pages（阶段 1 — 安全预览，不切 DNS）

用于在 **Cloudflare 的 `*.pages.dev`（或自定义预览域）** 上验证 CDN 与页面，**不替换** 当前 Vercel 生产部署。

- **静态**：`npm run build:cf` 生成 `dist-cf/`（HTML、`js/`、图标、`robots.txt` 等）。
- **API**：根目录 `functions/api/[[catchall]].js` 将 `/api/*` **反向代理**到线上 Vercel（默认 `https://www.seedance-2.info`）。因此预览站上的后台写入仍落在 **现有 Vercel 后端**，与直接访问主站等价；仅用于验证 Cloudflare 侧展示与路由。
- **可选环境变量**（Cloudflare 项目 → Settings → Variables）：`API_PROXY_ORIGIN` — 覆盖代理目标源站。
- **重要（避免 Worker 1101 / 无限回环）**：当你已经把 **DNS 指到 Cloudflare** 且 `www.seedance-2.info` 由 Pages/Workers 托管时，**不要把 `API_PROXY_ORIGIN` 设成 `https://www.seedance-2.info`**（会与当前站点同域，触发代理回环）。此时应把 `API_PROXY_ORIGIN` 设为 **Vercel 生产域名**（例如 `https://seedance-2-xxxx.vercel.app`）或其它真实上游源站。

**本地发布**（需要 [API Token](https://dash.cloudflare.com/profile/api-tokens)，非交互环境不会弹出浏览器登录）：

1. 复制 `.cf.env.example` 为 **`.cf.env`**，填入 `CLOUDFLARE_API_TOKEN`（可选 `CLOUDFLARE_ACCOUNT_ID`）。**不要提交 `.cf.env`。**
2. 在项目根执行：

```powershell
.\scripts\deploy-cf.ps1
```

或已在本机设置环境变量时：`npm run deploy:cf`。

**GitHub Actions**：工作流 **Cloudflare Pages (preview, manual)** 为 **仅手动触发**；仓库需配置 Secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。Vercel 的推送部署逻辑不变。

**后续阶段**：将代理改为 Workers 自托管 API、R2/KV 替换 Vercel 存储后，再切换 DNS，避免并行修改生产数据。

### 阶段 2 预埋（已加，默认关闭）

- 已新增 Cloudflare 原生骨架（默认回源 Vercel，行为不变）：
  - `functions/api/articles.js`（列表）
  - `functions/api/articles/[id].js`（单篇读取）
  - `functions/api/article-like.js`（点赞）
  - `functions/api/upload-image.js`（图片上传）
- 启用条件：
  - 原生文章读取：`CF_USE_NATIVE_ARTICLES=1` + KV 绑定 `CMS_KV`
  - 原生点赞：`CF_USE_NATIVE_ARTICLE_LIKE=1` + KV 绑定 `CMS_KV`
  - 原生上传：`CF_USE_NATIVE_UPLOAD=1` + R2 绑定 `CMS_UPLOAD_R2` + `CMS_UPLOAD_PUBLIC_BASE`
- **原生文章写入（可选，用于在 Cloudflare 上跑完整后台，不再回源 Vercel 写 KV）**：`CF_USE_NATIVE_ARTICLES_WRITE=1`（需同时 `CF_USE_NATIVE_ARTICLES=1`、已绑定 `CMS_KV`、并配置 `CMS_WRITE_SECRET`）。启用后 `POST/PATCH /api/articles` 与 `PUT/DELETE /api/articles/:id` 直接读写 `CMS_KV` 中的 `cms_articles`。
- 同站图片代理：`/api/media`（Blob 与 `*.r2.dev` 公网 URL）与 `/api/cms-verify` 已在 `functions/api/` 提供，与 Vercel 行为对齐。
- `CMS_KV` 中使用同一键：`cms_articles`。
- 未启用写入开关前，`GET` 可走原生 KV，`POST/PUT/DELETE` 仍回源 Vercel（若未开 `CF_USE_NATIVE_ARTICLES_WRITE`）。

### 阶段 2 启用步骤（按顺序，建议先在预览域验证）

1. **绑定 KV（CMS_KV）**
   - Cloudflare Dashboard → **Workers & Pages** → 选择 `seedance-2-cf-preview` → **Settings** → **Bindings**
   - 添加 **KV Namespace**：
     - Variable name: `CMS_KV`
     - Namespace: 选你用于文章数据的 KV（新建也可）

2. **绑定 R2（CMS_UPLOAD_R2）**
   - 同一页添加 **R2 Bucket**：
     - Variable name: `CMS_UPLOAD_R2`
     - Bucket: 选用于图片上传的 R2 bucket

3. **设置变量（Environment Variables / Secrets）**
   - `CMS_UPLOAD_PUBLIC_BASE`：R2 公网访问基础地址（例如你的自定义域或 r2.dev 域名，不带结尾 `/`）
   - `CMS_WRITE_SECRET`：与现有后台一致的写入密钥（用于原生上传鉴权）

4. **导入文章数据到 CMS_KV（一次性）**
   - 已提供脚本：`scripts/sync-cms-articles-to-cf-kv.js`
   - 在 `.cf.env` 补充：
     - `CMS_KV_NAMESPACE_ID=<你的 Cloudflare KV namespace id>`
     - （可选）`CMS_BEARER_TOKEN=<CMS 写入密钥>`，用于拉取草稿 + 已发布
   - 执行：

```bash
# 先 dry-run（只看数量和体积，不写入）
npm run sync:cf-kv

# 确认后写入 Cloudflare KV
npm run sync:cf-kv -- --write --verify
```

   - `--verify` 会回读 `cms_articles`，校验写入后的文章数量。

5. **逐个开关验证（每次只开一个）**
   - 先开：`CF_USE_NATIVE_ARTICLES=1`
     - 验证：首页列表、文章详情、`/api/articles` 的 `X-Store`/返回内容是否正常
   - 再开：`CF_USE_NATIVE_ARTICLE_LIKE=1`
     - 验证：点赞数递增，刷新后持久化
   - 最后开：`CF_USE_NATIVE_UPLOAD=1`
     - 验证：后台上传图片成功，返回 URL 指向 `CMS_UPLOAD_PUBLIC_BASE`

6. **回滚方式（秒级）**
   - 任一异常，先把对应 `CF_USE_NATIVE_*` 改回 `0` 或删除该变量，重新部署。
   - 因默认路径是回源 Vercel，回滚后流量立即回到现有稳定后端。

### 全 Cloudflare 模式（当前代码默认）

- `functions/api/articles.js`、`functions/api/articles/[id].js`、`functions/api/article-like.js`、`functions/api/upload-image.js`、`functions/api/sitemap.js` 与 `functions/sitemap.xml.js` 已改为 **Cloudflare 原生优先**，不再依赖 Vercel 回源。
- `functions/api/[[catchall]].js` 现在对未知 API 路由返回 `404`（不再做 Vercel 兜底代理）。
- `CF_USE_NATIVE_ARTICLES_WRITE`：
  - 未设置或设为 `1`：允许原生写入；
  - 设为 `0`：禁用写入（返回 503），用于只读保护。
- 要求绑定：
  - `CMS_KV`（文章读写 / 点赞 / sitemap 动态文章 URL）
  - `CMS_UPLOAD_R2` + `CMS_UPLOAD_PUBLIC_BASE`（图片上传）
  - `CMS_WRITE_SECRET`（后台写操作鉴权）

### 推荐变量矩阵（Preview / Production）

- `API_PROXY_ORIGIN`：Preview=当前稳定站；Production=当前稳定站（在未完全切换前）
- `CF_USE_NATIVE_ARTICLES`：Preview 先开，Production 后开
- `CF_USE_NATIVE_ARTICLE_LIKE`：Preview 先开，Production 后开
- `CF_USE_NATIVE_UPLOAD`：Preview 最后开，Production 最后开
- `CMS_KV` / `CMS_UPLOAD_R2` / `CMS_UPLOAD_PUBLIC_BASE` / `CMS_WRITE_SECRET`：Preview 与 Production 都应配置，但仅在开关开启后生效

---

## 本地运行

```bash
cd seedance-2
npm install
npm start
```

浏览器打开：http://localhost:5000 （首页）、http://localhost:5000/admin.html （后台）。
