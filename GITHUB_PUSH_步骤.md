# 把项目推送到你的 GitHub

## 1. 在 GitHub 上新建仓库

1. 打开：https://github.com/new  
2. **Repository name** 填：`seedance-2`（或任意名称）  
3. 选 **Public**  
4. **不要**勾选 “Add a README file”、“Add .gitignore”  
5. 点 **Create repository**

## 2. 修改本地的远程地址

在终端执行（把 `Akiwang-gif` 换成你的 GitHub 用户名，`seedance-2` 换成你刚建的仓库名）：

```bash
cd d:\seedance-2
git remote set-url origin https://github.com/Akiwang-gif/seedance-2.git
git push -u origin main
```

## 3. 若推送时要登录

- 用 **GitHub 用户名**（不是邮箱）  
- 密码处填 **Personal Access Token**（不是账号密码）  
  - 创建 Token：GitHub 网页 → 头像 → Settings → Developer settings → Personal access tokens → Generate new token  
  - 勾选 `repo` 权限后生成，复制保存，在终端粘贴到“密码”处  

完成后再打开 https://github.com/Akiwang-gif/seedance-2 就能看到项目。
