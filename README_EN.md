<p align="center">
  <img src="web/assets/icon-192.png" width="88" height="88" alt="Obsidian Cloud Reader" />
</p>

<h1 align="center">Obsidian Cloud Reader</h1>

<p align="center"><strong>Turn the Obsidian notes stored in Alibaba Cloud OSS into a private knowledge site you can read from any browser.</strong></p>

<p align="center">
  <a href="https://obsidian-cloud-reader.jacky-openbird.workers.dev">Open the reader</a>
  ·
  <a href="README.md">中文</a>
</p>

## The problem it solves

Your Obsidian vault may already be stored in OSS through Remotely Save, but reading one note away from your main computer still means installing Obsidian, configuring sync again, or browsing raw Markdown files.

Obsidian Cloud Reader gives the same OSS content a read-only web interface. Sign in once, connect your bucket, and continue reading or searching from a desktop, tablet, or phone.

## What you get

- **A familiar knowledge structure** with an expandable folder tree.
- **Fast navigation** through filename and path search plus an article outline.
- **On-demand loading** instead of downloading the entire vault.
- **Fewer OSS requests** through persistent metadata and content caches.
- **A responsive reading workspace** with light/dark themes and collapsible sidebars.
- **Account isolation** so every GitHub account has its own OSS connection and cache.

## How to use it

### 1. Sign in

Open the [live site](https://obsidian-cloud-reader.jacky-openbird.workers.dev) and sign in with GitHub. Your account is created automatically on the first successful login; no separate password is required.

### 2. Connect OSS

A new account starts with an empty library. Open settings and enter the connection details used by Remotely Save:

- Endpoint
- Bucket
- Region
- Optional directory prefix
- Access Key ID
- Access Key Secret

Choose “Verify and connect.” The site then builds the file catalog and shows scan progress.

### 3. Read and search

Choose a note from the folder tree. Its content opens in the center and its outline appears on the right. Use the top search control to find notes by filename or path. Both sidebars can be collapsed or resized.

### 4. Pick up changes

The site checks the catalog periodically. Use “Check for updates” when you need an immediate refresh. Opening one note does not trigger a full vault download.

## Requirements

- The Obsidian vault is stored in Alibaba Cloud OSS through Remotely Save.
- Markdown files and attachments are not encrypted by Remotely Save.
- Use OSS credentials limited to listing and reading the required bucket content.

## Privacy and security

- The reader does not write to or delete OSS files.
- Each GitHub account has isolated connection settings, catalog data, and content caches.
- OSS credentials are encrypted at rest and are masked in normal settings views.
- This is server-side encryption rather than end-to-end encryption: the backend must decrypt credentials to fetch notes.
- The project is MIT licensed and can be reviewed or self-hosted.

## Current limitations

- Search covers filenames and paths, not every note body.
- Remotely Save encrypted vaults are not supported.
- Public sharing, email login, and online editing are not available yet.

<details>
<summary><strong>For developers: self-hosting</strong></summary>

The app runs on Cloudflare Workers with Workers Static Assets and SQLite Durable Objects. No separate VPS is required.

Prepare Node.js 24, a Cloudflare account, and a GitHub OAuth App, then run:

```sh
npm ci
npm test
npm run build
```

Copy `wrangler.example.json` to `wrangler.json`, configure the production origin, Cloudflare account, and GitHub OAuth Client ID, then store the server secrets and deploy:

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put CONFIG_ENCRYPTION_KEY
npm run deploy
```

Set the OAuth callback to `https://YOUR-HOST/auth/callback`. Use a dedicated 32-byte Base64 encryption key, for example from `openssl rand -base64 32`.

Never commit deployment secrets, private notes, `.private`, or `.dev.vars`. Read the [migration guide](MIGRATION.md) before replacing an existing private deployment.

</details>

## License

[MIT License](LICENSE)
