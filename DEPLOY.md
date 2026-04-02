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

## 本地运行

```bash
cd seedance-2
npm install
npm start
```

浏览器打开：http://localhost:5000 （首页）、http://localhost:5000/admin.html （后台）。
