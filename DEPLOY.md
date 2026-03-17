# 部署与更新说明（Vercel）

## 一、更新线上部署

代码已推送到 GitHub 后，按你当前使用的方式操作其一即可。

### 方式 A：已用 Vercel 连接 GitHub

1. 打开 [Vercel Dashboard](https://vercel.com/dashboard)，进入本项目 **seedance-2**。
2. 每次向 **main** 分支 `git push` 后，Vercel 会自动触发一次部署。
3. 在项目 **Deployments** 里可看最新部署状态；完成后线上即为最新代码。

### 方式 B：手动部署

在项目根目录执行：

```bash
npx vercel --prod
```

按提示登录/选项目即可发布到生产环境。

---

## 二、线上环境变量（必须配置才能登录）

在 Vercel 项目里：**Settings → Environment Variables**，为 **Production** 添加以下变量（值从本地 `.env.local` 复制，其中 `NEXTAUTH_URL` 改为线上域名）：

```
NEXTAUTH_URL
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DATABASE_URL
SILICONFLOW_API_KEY
```

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NEXTAUTH_URL` | 线上站点地址（必须与访问域名一致） | `https://seedance-2.info` 或 `https://www.seedance-2.info` |
| `NEXTAUTH_SECRET` | 与本地一致的随机密钥 | 同 `.env.local` 里的值 |
| `GOOGLE_CLIENT_ID` | Google OAuth 客户端 ID | 同 `.env.local` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 客户端密钥 | 同 `.env.local` |
| `DATABASE_URL` | Neon 数据库连接串 | 同 `.env.local` |
| `SILICONFLOW_API_KEY` | 视频 API 密钥（若用） | 同 `.env.local` |

**注意：**

- `NEXTAUTH_URL` 填你实际访问的域名（例如 `https://seedance-2.info`），不要带结尾斜杠。
- 修改环境变量后需在 **Deployments** 里对最新部署点 **Redeploy** 才会生效。

---

## 三、Google 控制台（线上登录）

你已在「已授权的重定向 URI」里加了：

- `https://seedance-2.info/api/auth/callback/google`

若实际访问的是 **www** 域名（`https://www.seedance-2.info`），请同时：

1. 在 Google 控制台添加：`https://www.seedance-2.info/api/auth/callback/google`
2. 在 Vercel 里把 `NEXTAUTH_URL` 设为 `https://www.seedance-2.info`

这样线上即可使用 Google 登录。
