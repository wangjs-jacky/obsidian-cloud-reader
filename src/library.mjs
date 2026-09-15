import { OssSource, safeKey, validateConfig } from "./oss-source.mjs"
const CATALOG_TTL = 30 * 60 * 1000,
  NOTE_TTL = 10 * 60 * 1000,
  IMAGE_TTL = 24 * 60 * 60 * 1000,
  BUDGET = 64 * 1024 * 1024
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
const encoder = new TextEncoder()
export class Library {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sql = state.storage.sql
    this.jobs = new Map()
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    for (const table of ["files"])
      this.sql.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, etag TEXT, size INTEGER, modified TEXT)`,
      )
    this.sql.exec("CREATE TABLE IF NOT EXISTS scan_pages (page INTEGER PRIMARY KEY, body TEXT)")
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS notes_modified ON files(modified DESC,key) WHERE lower(key) LIKE '%.md'",
    )
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS chunks (key TEXT, part INTEGER, body BLOB, PRIMARY KEY(key,part))",
    )
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, etag TEXT, checked INTEGER, size INTEGER, body BLOB)",
    )
    // Older snapshots already contain a known file count; no OSS scan is needed to migrate it.
    if (this.meta("catalogAt") && this.meta("objectCount") === null)
      this.set("objectCount", this.rows("SELECT COUNT(*) AS n FROM files")[0].n)
  }
  rows(q, ...a) {
    return [...this.sql.exec(q, ...a)]
  }
  meta(k, fallback = null) {
    const r = this.rows("SELECT value FROM meta WHERE key=?", k)[0]
    return r ? JSON.parse(r.value) : fallback
  }
  set(k, v) {
    this.sql.exec("INSERT OR REPLACE INTO meta VALUES (?,?)", k, JSON.stringify(v))
  }
  count(k) {
    this.set(k, this.meta(k, 0) + 1)
  }
  async crypt(value, decrypt = false) {
    const raw = Uint8Array.from(atob(this.env.CONFIG_ENCRYPTION_KEY), (c) => c.charCodeAt(0)),
      key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
    if (decrypt) {
      const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
      return JSON.parse(
        new TextDecoder().decode(
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData:encoder.encode(this.state.id.toString()) },
            key,
            bytes.slice(12),
          ),
        ),
      )
    }
    const iv = crypto.getRandomValues(new Uint8Array(12)),
      out = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData:encoder.encode(this.state.id.toString()) },
          key,
          encoder.encode(JSON.stringify(value)),
        ),
      )
    return btoa(String.fromCharCode(...iv, ...out))
  }
  async source() {
    if (this.testSource) return this.testSource
    if (!this.activeSource) {
      const saved = this.meta("config")
      if(!saved)return null
      this.activeSource = new OssSource(await this.crypt(saved,true))
    }
    return this.activeSource
  }
  single(key, fn) {
    if (this.jobs.has(key)) return this.jobs.get(key)
    const p = Promise.resolve()
      .then(fn)
      .finally(() => this.jobs.delete(key))
    this.jobs.set(key, p)
    return p
  }
  async refresh(force = false) {
    return this.single("directory", async () => {
      const now = Date.now(),
        last = this.meta("catalogAt", 0)
      if (this.meta("retryAt", 0) > now) return
      let progress = this.meta("progress")
      if (!progress) {
        if (
          last &&
          ((!force && now - last < CATALOG_TTL) || now - this.meta("startedAt", 0) < 60000)
        )
          return
        this.sql.exec("DELETE FROM scan_pages")
        progress = { token: "", pages: 0, scanned: 0 }
        this.set("startedAt", now)
      }
      try {
        this.count("listRequests")
        const page = await (await this.source()).list(progress.token)
        if (page.truncated && (!page.next || page.next === progress.token))
          throw Error("OSS 分页游标无效")
        if (progress.pages >= 100) throw Error("目录超过 100 页，需缩小目录前缀")
        this.state.storage.transactionSync(() => {
          this.sql.exec(
            "INSERT OR REPLACE INTO scan_pages VALUES (?,?)",
            progress.pages,
            JSON.stringify(page.items),
          )
          const scanned = (progress.scanned || 0) + page.items.length
          if (page.next)
            this.set("progress", { token: page.next, pages: progress.pages + 1, scanned })
          else {
            const previous = new Map(this.rows("SELECT * FROM files").map((o) => [o.key, o]))
            let notes = 0
            for (const row of this.rows("SELECT body FROM scan_pages ORDER BY page"))
              for (const o of JSON.parse(row.body)) {
                const old = previous.get(o.key)
                if (
                  !old ||
                  old.etag !== o.etag ||
                  old.size !== o.size ||
                  old.modified !== o.modified
                )
                  this.sql.exec(
                    "INSERT OR REPLACE INTO files VALUES (?,?,?,?)",
                    o.key,
                    o.etag,
                    o.size,
                    o.modified,
                  )
                previous.delete(o.key)
                if (/\.md$/i.test(o.key)) notes++
              }
            for (const key of previous.keys()) {
              this.sql.exec("DELETE FROM files WHERE key=?", key)
              this.sql.exec("DELETE FROM cache WHERE key=?", key)
              this.sql.exec("DELETE FROM chunks WHERE key=?", key)
            }
            this.sql.exec("DELETE FROM scan_pages")
            this.set("noteCount", notes)
            this.set("objectCount", scanned)
            this.set("lastScanPages", progress.pages + 1)
            this.set("progress", null)
            this.set("catalogAt", now)
          }
          this.set("lastError", null)
          this.set("diagnostic", null)
          this.set("retryAt", 0)
        })
      } catch (error) {
        this.set(
          "diagnostic",
          error.name +
            ": " +
            String(error.message)
              .slice(0, 200)
              .replace(/[A-Za-z0-9/+_=.-]{24,}/g, "[redacted]"),
        )
        this.set(
          "lastError",
          error.message.startsWith("OSS ") ? error.message : "连接失败，请检查 OSS 配置",
        )
        this.set("retryAt", now + 60000)
      }
    })
  }
  status() {
    return {
      diagnostic: this.meta("diagnostic"),
      updatedAt: this.meta("catalogAt"),
      refreshing: !!this.meta("progress"),
      pages: this.meta("progress")?.pages || this.meta("lastScanPages", 0),
      scanned:
        this.meta("progress")?.scanned || (this.meta("progress") ? 0 : this.meta("objectCount", 0)),
      previousTotal: this.meta("objectCount", 0),
      noteCount: this.meta("noteCount", 0),
      error: this.meta("lastError"),
      retryAt: this.meta("retryAt", 0),
      listRequests: this.meta("listRequests", 0),
      getRequests: this.meta("getRequests", 0),
      notModified: this.meta("notModified", 0),
      cacheHits: this.meta("cacheHits", 0),
      cachedBytes: this.rows("SELECT COALESCE(SUM(size),0) AS n FROM cache")[0].n,
      cachedFiles: this.rows("SELECT COUNT(*) AS n FROM cache")[0].n,
      catalogTtlSeconds: CATALOG_TTL / 1000,
    }
  }
  async catalog(url) {
    await this.refresh()
    const q = (url.searchParams.get("q") || "").slice(0, 200),
      offset = Math.min(100000, Math.max(0, Number(url.searchParams.get("offset")) || 0))
    const where = "lower(key) LIKE '%.md' AND instr(lower(key),lower(?))>0"
    return json(
      {
        items: this.rows(
          `SELECT * FROM files WHERE ${where} ORDER BY modified DESC,key LIMIT 50 OFFSET ?`,
          q,
          offset,
        ),
        total: q
          ? this.rows(`SELECT COUNT(*) AS n FROM files WHERE ${where}`, q)[0].n
          : this.meta("noteCount", 0),
        ...this.status(),
      },
      this.meta("catalogAt") ? 200 : 202,
    )
  }
  tree(url) {
    // Navigation reads the existing snapshot only: expanding a folder never scans OSS.
    const folder = url.searchParams.get("folder") || ""
    if (folder && !safeKey(folder)) return json({ error: "目录路径无效" }, 400)
    const prefix = folder ? folder + "/" : ""
    const offset = Math.min(
      100000,
      Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0)),
    )
    const keys = this.rows(
      "SELECT key FROM files WHERE lower(key) LIKE '%.md' AND substr(key,1,length(?))=? ORDER BY key",
      prefix,
      prefix,
    )
    const directories = new Map(),
      files = []
    for (const { key } of keys) {
      const rest = key.slice(prefix.length),
        slash = rest.indexOf("/")
      if (slash < 0) files.push({ key, name: rest.replace(/\.md$/i, "") })
      else {
        const name = rest.slice(0, slash)
        directories.set(name, (directories.get(name) || 0) + 1)
      }
    }
    const folders = [...directories]
      .map(([name, count]) => ({ name, key: prefix + name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
    files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
    return json({
      folder,
      folders,
      files: files.slice(offset, offset + 50),
      fileTotal: files.length,
      nextOffset: offset + 50 < files.length ? offset + 50 : null,
      noteCount: this.meta("noteCount", 0),
      updatedAt: this.meta("catalogAt"),
    })
  }
  resolve(ref, from = "") {
    if (!ref || ref.length > 2048) return null
    let decoded
    try {
      decoded = decodeURIComponent(ref.split("#")[0])
    } catch {
      return null
    }
    const parent = from.split("/").slice(0, -1),
      parts = [...parent, ...decoded.split("/")],
      normalized = []
    for (const p of parts) {
      if (p === "..") normalized.pop()
      else if (p && p !== ".") normalized.push(p)
    }
    const candidates = [normalized.join("/"), decoded.replace(/^\//, "")]
    for (const k of candidates)
      for (const key of [k, k + ".md"]) {
        if (safeKey(key) && this.rows("SELECT key FROM files WHERE key=?", key).length) return key
      }
    const name = decoded.split("/").pop(),
      matches = this.rows(
        "SELECT key FROM files WHERE key=? OR key=? OR substr(key,-length(?)-1)='/'||? OR substr(key,-length(?)-1)='/'||? LIMIT 2",
        name,
        name + ".md",
        name,
        name,
        name + ".md",
        name + ".md",
      )
    return matches.length === 1 ? matches[0].key : null
  }
  cachedBody(key, size) {
    const out = new Uint8Array(size)
    let offset = 0
    for (const r of this.rows("SELECT body FROM chunks WHERE key=? ORDER BY part", key)) {
      const b = new Uint8Array(r.body)
      out.set(b, offset)
      offset += b.length
    }
    if (offset !== size) throw Error("Cache incomplete")
    return out.buffer
  }
  serialized(fn) {
    const pending = (this.readTail || Promise.resolve()).then(fn)
    this.readTail = pending.then(
      () => {},
      () => {},
    )
    return pending
  }
  async object(key) {
    if (!safeKey(key)) return json({ error: "文件路径无效" }, 400)
    const result = await this.single("file:" + key, () =>
      this.serialized(async () => {
        const file = this.rows("SELECT * FROM files WHERE key=?", key)[0]
        if (!file) return { error: "文件不存在，或目录尚未更新", status: 404 }
        const note = /\.md$/i.test(key),
          limit = note ? 2 * 1024 * 1024 : 20 * 1024 * 1024
        if (file.size > limit) return { error: "文件超过阅读大小限制", status: 413 }
        const old = this.rows("SELECT * FROM cache WHERE key=?", key)[0],
          now = Date.now(),
          ttl = note ? NOTE_TTL : IMAGE_TTL
        if (old && old.etag === file.etag && now - old.checked < ttl) {
          this.count("cacheHits")
          return { ...old, body: this.cachedBody(key, old.size), cache: "HIT" }
        }
        this.count("getRequests")
        let r
        try {
          r = await (await this.source()).get(key, old?.etag)
        } catch {
          return { error: "OSS 暂时不可用，请稍后重试", status: 502 }
        }
        if (r.status === 304 && old) {
          this.count("notModified")
          this.sql.exec("UPDATE cache SET checked=? WHERE key=?", now, key)
          return { ...old, body: this.cachedBody(key, old.size), cache: "REVALIDATED" }
        }
        if (!r.ok) {
          await r.body?.cancel()
          if (r.status === 404) {
            this.sql.exec("DELETE FROM cache WHERE key=?", key)
            this.sql.exec("DELETE FROM chunks WHERE key=?", key)
          }
          return { error: "OSS 文件读取失败", status: r.status === 404 ? 404 : 502 }
        }
        const chunks = []
        let size = 0
        const reader = r.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > limit) {
            await reader.cancel()
            return { error: "文件超过阅读大小限制", status: 413 }
          }
          chunks.push(value)
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.length
        }
        const etag = r.headers.get("etag") || file.etag
        this.state.storage.transactionSync(() => {
          this.sql.exec(
            "INSERT OR REPLACE INTO cache VALUES (?,?,?,?,?)",
            key,
            etag,
            now,
            size,
            null,
          )
          this.sql.exec("DELETE FROM chunks WHERE key=?", key)
          for (let start = 0, part = 0; start < size; start += 524288, part++)
            this.sql.exec(
              "INSERT INTO chunks VALUES (?,?,?)",
              key,
              part,
              bytes.slice(start, start + 524288).buffer,
            )
          // A GET can see a newer version before the directory refresh does.
          this.sql.exec(
            "UPDATE files SET etag=?,size=? WHERE key=? AND etag=?",
            etag,
            size,
            key,
            file.etag,
          )
          let used = this.rows("SELECT COALESCE(SUM(size),0) AS n FROM cache")[0].n
          for (const o of this.rows("SELECT key,size FROM cache ORDER BY checked ASC")) {
            if (used <= BUDGET) break
            this.sql.exec("DELETE FROM cache WHERE key=?", o.key)
            this.sql.exec("DELETE FROM chunks WHERE key=?", o.key)
            used -= o.size
          }
        })
        return { body: bytes.buffer, etag, cache: "MISS" }
      }),
    )
    if (result.error) return json({ error: result.error }, result.status)
    const ext = key.split(".").pop().toLowerCase(),
      type =
        {
          md: "text/plain; charset=utf-8",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          avif: "image/avif",
          svg: "image/svg+xml",
          pdf: "application/pdf",
        }[ext] || "application/octet-stream"
    return new Response(result.body, {
      headers: {
        "Content-Type": type,
        ETag: result.etag,
        "X-Reader-Cache": result.cache,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        ...(!["md", "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "pdf"].includes(ext)
          ? { "Content-Disposition": "attachment" }
          : {}),
      },
    })
  }
  async fetch(request) {
    const url = new URL(request.url)
    if (this.changing) return json({ error: "正在保存配置，请稍后重试" }, 503)
    try {
      if (url.pathname === "/api/settings/reveal") {
        if(request.method!=="POST")return json({error:"Method not allowed"},405)
        const c=(await this.source())?.config
        if(!c)return json({error:"请先绑定 OSS"},409)
        return json({accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey})
      }
      if (url.pathname === "/api/settings") {
        if (request.method === "GET") {
          const source=await this.source()
          const c=source?.config
          if(!c)return json({configured:false})
          return json({
            configured:true,
            endpoint: c.endpoint,
            bucket: c.bucket,
            region: c.region,
            prefix: c.prefix,
          })
        }
        if (request.method === "POST") {
          const text = await request.text()
          if (text.length > 4096) return json({ error: "配置过大" }, 413)
          const input = JSON.parse(text)
          const saved = (await this.source())?.config
          for(const field of ["accessKeyId","secretAccessKey"])
            if(!input[field]&&saved)input[field]=saved[field]
          const config = validateConfig(input)
          this.changing = true
          try {
            await Promise.allSettled([...this.jobs.values()])
            const source = new OssSource(config)
            const firstPage = await source.list()
            const encrypted = await this.crypt(config)
            if (JSON.stringify((await this.source())?.config) === JSON.stringify(source.config)) {
              this.set("config", encrypted)
              this.count("listRequests")
              return json({ saved: true, reusedCache: true })
            }
            this.state.storage.transactionSync(() => {
              this.sql.exec("DELETE FROM files")
              this.sql.exec("DELETE FROM scan_pages")
              this.sql.exec("DELETE FROM cache")
              this.sql.exec("DELETE FROM chunks")
              this.sql.exec("DELETE FROM meta")
              this.set("config", encrypted)
              this.set("listRequests", 1)
              this.set("startedAt", Date.now())
              if (firstPage.next) {
                this.sql.exec(
                  "INSERT INTO scan_pages VALUES (?,?)",
                  0,
                  JSON.stringify(firstPage.items),
                )
                this.set("progress", {
                  token: firstPage.next,
                  pages: 1,
                  scanned: firstPage.items.length,
                })
              } else {
                for (const o of firstPage.items)
                  this.sql.exec(
                    "INSERT INTO files VALUES (?,?,?,?)",
                    o.key,
                    o.etag,
                    o.size,
                    o.modified,
                  )
                this.set("objectCount", firstPage.items.length)
                this.set("lastScanPages", 1)
                this.set("catalogAt", Date.now())
                this.set("noteCount", firstPage.items.filter((o) => /\.md$/i.test(o.key)).length)
              }
            })
            this.activeSource = source
            return json({ saved: true })
          } finally {
            this.changing = false
          }
        }
      }
      if(!await this.source()) {
        if(url.pathname==='/api/catalog')return json({bound:false,items:[],total:0,...this.status()})
        if(url.pathname==='/api/tree')return json({bound:false,folders:[],files:[],fileTotal:0,nextOffset:null,noteCount:0})
        if(url.pathname==='/api/cache')return json({bound:false,...this.status()})
        return json({error:'请先绑定自己的 OSS',code:'OSS_NOT_BOUND'},409)
      }
      if (url.pathname === "/api/tree") return this.tree(url)
      if (url.pathname === "/api/catalog") return await this.catalog(url)
      if (url.pathname === "/api/refresh" && request.method === "POST") {
        await this.refresh(true)
        return json(this.status())
      }
      if (url.pathname === "/api/cache") return json(this.status())
      if (url.pathname === "/api/object") return await this.object(url.searchParams.get("key"))
      if (url.pathname === "/api/resolve") {
        const key = this.resolve(url.searchParams.get("ref"), url.searchParams.get("from") || "")
        return key ? json({ key }) : json({ error: "未找到唯一匹配的文件" }, 404)
      }
      return json({ error: "Not found" }, 404)
    } catch {
      return json({ error: "读取失败，请检查连接配置后重试" }, 502)
    }
  }
}
