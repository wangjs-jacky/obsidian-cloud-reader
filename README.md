# Obsidian Cloud Reader

[中文说明](README_CN.md)

An MIT-licensed, read-only web reader for Obsidian notes stored in Alibaba Cloud OSS. Each GitHub account starts with an empty library and connects its own bucket. No default account, bucket, credentials, or personal notes are included.

## Features

- GitHub OAuth login: the first successful login creates an account automatically; no separate password or email registration.
- Per-account OSS settings and caches, selected exclusively by the server-verified GitHub numeric user ID.
- Expandable directory tree, filename/path search, directory scan progress, Markdown rendering, and light/dark themes.
- Notes downloaded on demand. Persistent metadata and content caches, conditional ETag requests, bounded storage, and concurrent-request deduplication.
- Encrypted OSS connection settings using AES-256-GCM, bound to each library's Durable Object ID.
- Opaque, revocable server-side sessions; OAuth state, PKCE, one-time callbacks, and same-origin mutation checks.

## Deploy

Use Node.js 24 and a Cloudflare account with Workers and SQLite Durable Objects available. No separately managed VPS is required; provider quotas and any usage charges still apply.

1. Run `npm ci`, `npm test`, and `npm run build`.
2. Copy `wrangler.example.json` to `wrangler.json` (gitignored). Set the Worker name, account ID if needed, and `PUBLIC_ORIGIN` to the exact HTTPS origin, without a trailing slash.
3. Create a GitHub OAuth App. Set its homepage to that origin and its callback to `https://YOUR-HOST/auth/callback`. Copy its client ID into `GITHUB_CLIENT_ID` in `wrangler.json`.
4. Run `npx wrangler secret put GITHUB_CLIENT_SECRET` and enter the OAuth client secret.
5. Generate a fresh 32-byte base64 secret, for example with `openssl rand -base64 32`. Store it using `npx wrangler secret put CONFIG_ENCRYPTION_KEY`. Keep a secure backup; changing this key without migrating stored settings makes existing connections unreadable.
6. Run `npm run deploy`. Visit the site, log in through GitHub, and bind your own OSS connection.

For local development, use an appropriate local OAuth callback and put secrets in a gitignored `.dev.vars` file. Production cookies require HTTPS.

Live browser acceptance verified GitHub login, a new empty account, binding OSS, reading a real note, logout protection, and reconnecting to the existing cached catalog on subsequent login. All 38 automated tests pass. Account isolation uses two synthetic identities in automated tests; a second real GitHub account has not been manually tested.

## OSS connection

Provide your Alibaba Cloud OSS endpoint, bucket, region, access key ID, secret, and optional directory prefix through the authenticated settings form. Use credentials with only the required list/read permissions. The connector reads Markdown and attachments; it never writes back to OSS. Remotely Save encrypted vaults are not supported in this MVP.

Search currently covers filenames and paths, not all note bodies. Metadata refreshes after 30 minutes; note cache validation uses 10 minutes and image validation uses 24 hours. Manual refresh is throttled to once per minute. Cached content is limited to 64 MiB per library. Large directory scans are paginated and keep the previous catalog if a refresh fails.

## Security and privacy boundary

Anonymous visitors see a generic empty shell. Every library API requires a valid website session. A new account has no OSS connection; there is no global fallback bucket. Settings and cached content are isolated in one SQLite Durable Object per account.

Saved credentials are masked in settings. An authenticated, same-origin reveal action displays the complete keys; closing the dialog clears them from the fields. Blank key fields on save retain the existing credentials.

OSS credentials are encrypted at rest, but this is not end-to-end encryption: the hosting operator's backend decrypts credentials to fetch notes, and cached note content is accessible to that backend. GitHub access tokens are used only to resolve identity and are not persisted; no repository scope is requested. Never commit `.private`, `.dev.vars`, deployment secrets, personal notes, or generated private content.

Public note sharing and email login are not implemented. See [migration guidance](MIGRATION.md) before replacing an existing private instance.

## Development

```sh
npm ci
npm test
npm run build
```

`src/auth.mjs` handles GitHub OAuth and sessions, `src/app.mjs` enforces account routing, `src/library.mjs` owns per-account settings and caches, and `web/` contains the reader UI. Markdown rendering uses markdown-it and DOMPurify. This project is independent of Quartz.
