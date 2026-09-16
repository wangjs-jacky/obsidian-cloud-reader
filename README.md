<p align="center">
  <img src="web/assets/icon-192.png" width="88" height="88" alt="Obsidian Cloud Reader" />
</p>

<h1 align="center">Obsidian Cloud Reader</h1>

<p align="center"><strong>把存放在阿里云 OSS 的 Obsidian 笔记，变成一个登录后随时可读的私人知识库网站。</strong></p>

<p align="center">
  <a href="https://obsidian-cloud-reader.jacky-openbird.workers.dev">立即使用</a>
  ·
  <a href="README_EN.md">English</a>
</p>

## 它解决什么问题

你的 Obsidian 笔记已经通过 Remotely Save 保存在 OSS 中，但离开常用电脑后，查看一篇笔记仍然要安装 Obsidian、重新配置同步，或者直接翻找 Markdown 文件。

Obsidian Cloud Reader 为同一份 OSS 内容提供一个只读网页入口：登录一次、绑定自己的 OSS，就能在电脑、平板或手机浏览器中继续阅读和搜索笔记。

## 你会得到什么

- **熟悉的知识库结构**：按文件夹展开目录，保留 Obsidian 的组织方式。
- **快速找到笔记**：搜索文件名和路径，并通过文章大纲跳转到对应章节。
- **不用下载整个仓库**：先读取目录，正文和附件在打开时按需加载。
- **更少的 OSS 请求**：已读内容会复用云端缓存，更新时只检查发生变化的内容。
- **适合不同设备**：支持响应式布局、明暗主题和可收起的左右侧栏。
- **每个账号相互独立**：GitHub 登录后绑定自己的 OSS，连接配置和缓存不会与其他账号混用。

## 如何使用

### 1. 登录

打开 [线上网站](https://obsidian-cloud-reader.jacky-openbird.workers.dev)，使用 GitHub 登录。首次登录会自动创建账号，不需要另外设置密码。

### 2. 连接 OSS

登录后知识库默认为空。点击右上角的设置按钮，填写 Remotely Save 使用的连接信息：

- Endpoint
- Bucket
- Region
- 目录前缀（可选）
- Access Key ID
- Access Key Secret

点击“验证并连接”。验证成功后，网站开始建立文件目录，并显示扫描进度。

### 3. 阅读和搜索

从左侧目录选择笔记，正文会在中间区域打开，右侧显示文章大纲。顶部搜索可以按文件名或路径查找笔记；左右侧栏均可收起或拖动调整宽度。

### 4. 获取更新

网站会定期检查目录变化。需要立即同步时，点击“检查更新”；不会为了打开一篇笔记而重新拉取全部正文。

## 使用前提

- Obsidian 笔记已通过 Remotely Save 保存到阿里云 OSS。
- OSS 中保存的是未加密的 Markdown 与附件。
- 建议为网站创建只有列目录和读取文件权限的 OSS 凭据。

## 隐私与安全

- 网站只读取 OSS，不会修改或删除你的文件。
- 每个 GitHub 账号拥有独立的连接配置、目录和正文缓存。
- OSS 密钥会加密保存，普通设置页面不会回显完整密钥。
- 这是服务端加密，不是端到端加密：网站后端需要解密凭据才能读取笔记。
- 项目采用 MIT 许可证，可自行部署和审查源码。

## 当前限制

- 搜索范围是文件名和路径，暂不搜索全部正文。
- 暂不支持 Remotely Save 加密仓库。
- 暂不提供公开分享、邮箱登录或在线编辑。

<details>
<summary><strong>开发者：自行部署</strong></summary>

项目运行在 Cloudflare Workers，使用 Workers Static Assets 和 SQLite Durable Objects，不需要单独维护 VPS。

准备 Node.js 24、Cloudflare 账号和 GitHub OAuth App，然后执行：

```sh
npm ci
npm test
npm run build
```

复制 `wrangler.example.json` 为 `wrangler.json`，设置正式域名、Cloudflare 账号和 GitHub OAuth Client ID。随后保存两个服务端密钥：

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put CONFIG_ENCRYPTION_KEY
npm run deploy
```

GitHub OAuth App 的回调地址应为 `https://你的域名/auth/callback`。`CONFIG_ENCRYPTION_KEY` 应使用独立的 32 字节 Base64 密钥，例如通过 `openssl rand -base64 32` 生成。

部署密钥、个人笔记、`.private` 和 `.dev.vars` 不应提交到仓库。替换旧实例前请阅读 [迁移说明](MIGRATION.md)。

</details>

## 开源许可

[MIT License](LICENSE)
