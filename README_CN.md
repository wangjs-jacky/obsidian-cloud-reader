# Obsidian Cloud Reader

[English](README.md)

一个 MIT 开源的 Obsidian 网页阅读器，直接读取阿里云 OSS 中的 Markdown 和附件。

## 用户流程

打开网站 → GitHub 登录（首次自动创建账号）→ 空知识库 → 绑定自己的 OSS → 浏览笔记。

每个账号拥有独立连接配置和缓存，不会自动显示部署者的笔记。暂不提供邮箱注册、正文全文搜索或公开分享。

## 功能

- 可展开的目录树、标题和路径搜索、目录扫描进度、明暗主题。
- 正文按需读取；持久缓存、ETag 校验、请求合并，避免每次加载全部正文。
- GitHub OAuth、PKCE、一次性回调，以及可在服务端撤销的登录会话。
- 服务端按 GitHub 用户 ID 隔离数据，OSS 密钥使用 AES-256-GCM 加密保存。

## 部署

需要 Node.js 24、GitHub OAuth App 和支持 Workers / SQLite Durable Objects 的 Cloudflare 账号，无需自己维护 VPS。托管平台的配额与费用仍适用。

1. 执行 `npm ci`、`npm test`、`npm run build`。
2. 把 `wrangler.example.json` 复制为被 Git 忽略的 `wrangler.json`，填写 Worker 名称、账号 ID（如需）和准确的 HTTPS `PUBLIC_ORIGIN`，末尾不带斜杠。
3. 创建 GitHub OAuth App，主页填写网站地址，回调填写 `https://你的域名/auth/callback`。将 Client ID 写入 `GITHUB_CLIENT_ID`。
4. 执行 `npx wrangler secret put GITHUB_CLIENT_SECRET` 保存 Client Secret。
5. 使用 `openssl rand -base64 32` 生成独立加密密钥，通过 `npx wrangler secret put CONFIG_ENCRYPTION_KEY` 保存。请安全备份；直接更换会导致旧连接配置无法解密。
6. 执行 `npm run deploy`，访问网站登录，绑定自己的 OSS。

38 项自动化测试通过。浏览器已验证真实 GitHub 登录、首次空知识库、绑定 OSS、搜索阅读真实文章、退出访问保护，以及再次登录恢复连接和缓存目录。账号隔离使用两个模拟身份测试，尚未使用第二个真实 GitHub 账号手动验收。

## 数据与缓存

OSS 配置包括 endpoint、bucket、region、Access Key ID、Secret 和可选目录前缀。建议提供仅有列目录及读取权限的密钥。连接器不会写回 OSS；当前仅支持明文文件，不支持 Remotely Save 加密仓库。

目录缓存 30 分钟，正文校验间隔 10 分钟，图片 24 小时；手动更新至少间隔一分钟。每个知识库的正文/附件缓存上限为 64 MiB。搜索仅使用目录中的文件名与路径，不会为搜索拉取全部正文。

这是服务端加密保存凭据，并非端到端加密：托管网站的后端可以解密 OSS 凭据并读取笔记，笔记缓存也对后端可读。源码仓库不包含用户密钥、个人笔记或默认 OSS 连接。

替换旧站前请阅读 [迁移说明](MIGRATION.md)。
