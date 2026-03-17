# 部署说明 / Deploy Guide

## 方式一：Render（推荐，免费）

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

## 方式二：仅静态站（GitHub Pages）

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
