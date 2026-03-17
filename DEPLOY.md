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

### 注意

- 首次部署前请先在 Vercel 中创建并绑定 **KV** 和 **Blob**，否则文章列表与图片上传会报错。
- 若之前用 Render，文章数据在 Render 上，迁到 Vercel 后需在后台重新发布或迁移数据。

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
