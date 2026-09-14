import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { Library } from "../src/library.mjs"
import { safeKey, validateConfig } from "../src/oss-source.mjs"
function fixture() {
  const db = new DatabaseSync(":memory:")
  const sql = {
    exec(q, ...a) {
      a = a.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v))
      const st = db.prepare(q)
      return st.columns().length ? st.all(...a) : (st.run(...a), [])
    },
  }
  const state = {
    id:{toString:()=>"fixture-library"},
    storage: {
      sql,
      transactionSync(fn) {
        db.exec("BEGIN")
        try {
          const r = fn()
          db.exec("COMMIT")
          return r
        } catch (e) {
          db.exec("ROLLBACK")
          throw e
        }
      },
    },
  }
  let lists = 0,
    gets = 0,
    version = '"v1"'
  const items = [
    { key: "notes/a.md", etag: version, size: 5, modified: "2026-01-01" },
    { key: "附件/p.png", etag: version, size: 5, modified: "2026-01-01" },
  ]
  const source = {
    async list() {
      lists++
      return { items, next: "" }
    },
    async get(key, etag) {
      gets++
      return etag === version
        ? new Response(null, { status: 304 })
        : new Response("hello", { headers: { etag: version } })
    },
  }
  const l = new Library(state, { CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64") })
  l.testSource = source
  return {
    l,
    state,
    source,
    get lists() {
      return lists
    },
    get gets() {
      return gets
    },
    set version(v) {
      version = v
    },
  }
}
test("directory warm reads, search and pagination never list OSS again", async () => {
  const f = fixture()
  await f.l.catalog(new URL("https://x/api/catalog"))
  await f.l.catalog(new URL("https://x/api/catalog?q=notes&offset=50"))
  assert.equal(f.lists, 1)
  assert.equal(f.gets, 0)
})
test("concurrent note requests GET once; persistent cache survives restart", async () => {
  const f = fixture()
  await f.l.refresh()
  const rs = await Promise.all(Array.from({ length: 8 }, () => f.l.object("notes/a.md")))
  assert.deepEqual(await Promise.all(rs.map((r) => r.text())), Array(8).fill("hello"))
  assert.equal(f.gets, 1)
  const restarted = new Library(f.state, {})
  restarted.testSource = f.source
  assert.equal((await restarted.object("notes/a.md")).headers.get("X-Reader-Cache"), "HIT")
  assert.equal(f.gets, 1)
})
test("expired body uses conditional 304 and preserves bytes", async () => {
  const f = fixture()
  await f.l.refresh()
  await f.l.object("notes/a.md")
  f.l.sql.exec("UPDATE cache SET checked=0")
  const r = await f.l.object("notes/a.md")
  assert.equal(r.headers.get("X-Reader-Cache"), "REVALIDATED")
  assert.equal(await r.text(), "hello")
  assert.equal(f.gets, 2)
  assert.equal(f.l.status().notModified, 1)
})
test("directory version invalidates fresh body; deletion refuses cached body", async () => {
  const f = fixture()
  await f.l.refresh()
  await f.l.object("notes/a.md")
  f.version = '"v2"'
  f.l.sql.exec("UPDATE files SET etag=?", '"v2"')
  assert.equal((await f.l.object("notes/a.md")).headers.get("X-Reader-Cache"), "MISS")
  assert.equal(f.gets, 2)
  f.l.sql.exec("DELETE FROM files")
  assert.equal((await f.l.object("notes/a.md")).status, 404)
})
test("image has independent longer TTL", async () => {
  const f = fixture()
  await f.l.refresh()
  await f.l.object("notes/a.md")
  await f.l.object("附件/p.png")
  f.l.sql.exec("UPDATE cache SET checked=?", Date.now() - 11 * 60000)
  assert.equal((await f.l.object("附件/p.png")).headers.get("X-Reader-Cache"), "HIT")
  assert.equal((await f.l.object("notes/a.md")).headers.get("X-Reader-Cache"), "REVALIDATED")
})
test("refresh stages pages atomically; failure keeps catalog, backs off, resumes", async () => {
  const f = fixture()
  await f.l.refresh()
  f.l.set("startedAt", 0)
  let calls = 0
  f.source.list = async (token) => {
    calls++
    if (!token)
      return {
        items: [{ key: "new.md", etag: "n", size: 1, modified: "2026" }],
        next: "page2",
        truncated: true,
      }
    throw Error("OSS 目录读取失败（503）")
  }
  await f.l.refresh(true)
  assert.equal(f.l.status().refreshing, true)
  assert.equal(f.l.rows("SELECT count(*) n FROM files")[0].n, 2)
  await f.l.refresh()
  await f.l.refresh()
  assert.equal(calls, 2)
  assert.equal(f.l.rows("SELECT count(*) n FROM files")[0].n, 2)
  f.l.set("retryAt", 0)
  f.source.list = async () => ({ items: [], next: "" })
  await f.l.refresh()
  assert.deepEqual(
    f.l.rows("SELECT key FROM files").map((r) => r.key),
    ["new.md"],
  )
})
test("parallel refresh single flight and minimum refresh interval", async () => {
  const f = fixture()
  await Promise.all(Array.from({ length: 10 }, () => f.l.refresh(true)))
  assert.equal(f.lists, 1)
  await f.l.refresh(true)
  assert.equal(f.lists, 1)
})
test("hidden, traversal and unknown files never GET OSS", async () => {
  const f = fixture()
  for (const key of [".obsidian/x", "a/../b", "a//b", "/a", "a\\b", "a\u0000b"])
    assert.equal(safeKey(key), false)
  await f.l.refresh()
  assert.equal((await f.l.object("missing.md")).status, 404)
  assert.equal(f.gets, 0)
})
test("wiki relative and unique basename resolve, ambiguity refuses", async () => {
  const f = fixture()
  await f.l.refresh()
  assert.equal(f.l.resolve("a", "notes/b.md"), "notes/a.md")
  assert.equal(f.l.resolve("p.png", "notes/a.md"), "附件/p.png")
  f.l.sql.exec("INSERT INTO files VALUES (?,?,?,?)", "other/a.md", "x", 1, "x")
  assert.equal(f.l.resolve("a", ""), null)
})
test("settings ciphertext round trip, arbitrary endpoints rejected", async () => {
  const f = fixture(),
    c = { secretAccessKey: "never plaintext" }
  const encrypted = await f.l.crypt(c)
  assert.ok(!encrypted.includes("never"))
  assert.deepEqual(await f.l.crypt(encrypted, true), c)
  for (const endpoint of [
    "http://example.com",
    "https://localhost",
    "https://oss-cn-shanghai.aliyuncs.com.evil.com",
    "https://oss-cn-shanghai.aliyuncs.com/path",
  ])
    assert.throws(() =>
      validateConfig({
        endpoint,
        bucket: "abc",
        region: "cn-shanghai",
        accessKeyId: "a",
        secretAccessKey: "b",
      }),
    )
})
test("oversized body refused without retaining partial cache", async () => {
  const f = fixture()
  await f.l.refresh()
  f.source.get = async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))
  assert.equal((await f.l.object("notes/a.md")).status, 413)
  assert.equal(f.l.status().cachedFiles, 0)
})
test("multi-chunk image round trip stays byte identical", async () => {
  const f = fixture()
  await f.l.refresh()
  const bytes = new Uint8Array(1500000)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  f.source.get = async () => new Response(bytes, { headers: { etag: '"v1"' } })
  await f.l.object("附件/p.png")
  assert.equal(f.l.rows("SELECT COUNT(*) n FROM chunks")[0].n, 3)
  const r = await f.l.object("附件/p.png")
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes)
})
test("unchanged refresh never rewrites file records", async () => {
  const f = fixture()
  await f.l.refresh()
  let changes = 0
  const exec = f.l.sql.exec.bind(f.l.sql)
  f.l.sql.exec = (q, ...a) => {
    if (/INSERT OR REPLACE INTO files/.test(q)) changes++
    return exec(q, ...a)
  }
  f.l.set("startedAt", 0)
  await f.l.refresh(true)
  assert.equal(changes, 0)
})
test("different large files serialize downloads to bound Worker memory", async () => {
  const f = fixture()
  await f.l.refresh()
  let active = 0,
    max = 0
  f.source.get = async () => {
    active++
    max = Math.max(max, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
    return new Response("hello", { headers: { etag: '"v1"' } })
  }
  await Promise.all([f.l.object("notes/a.md"), f.l.object("附件/p.png")])
  assert.equal(max, 1)
})
test("OSS deletion during revalidation frees cached chunks", async () => {
  const f = fixture()
  await f.l.refresh()
  await f.l.object("notes/a.md")
  f.l.sql.exec("UPDATE cache SET checked=0")
  f.source.get = async () => new Response(null, { status: 404 })
  assert.equal((await f.l.object("notes/a.md")).status, 404)
  assert.equal(f.l.rows("SELECT COUNT(*) n FROM chunks")[0].n, 0)
})

test('tree returns direct children, recursive note counts and root notes without OSS access',async()=>{const f=fixture();await f.l.refresh();for(const key of ['wiki/ai/one.md','wiki/ai/two.md','wiki/finance/c.md','wiki/index.md','wiki2/separate.md','README.md','wiki/ai/image.png'])f.l.sql.exec('INSERT INTO files VALUES (?,?,?,?)',key,'v',1,'2026');f.l.set('catalogAt',1);const before=f.lists;const root=await f.l.tree(new URL('https://x/api/tree')).json();assert.equal(root.folders.find(x=>x.key==='wiki').count,4);assert.deepEqual(root.files.map(x=>x.key),['README.md']);const wiki=await f.l.tree(new URL('https://x/api/tree?folder=wiki')).json();assert.deepEqual(wiki.folders.map(x=>[x.name,x.count]),[['ai',2],['finance',1]]);assert.deepEqual(wiki.files.map(x=>x.key),['wiki/index.md']);assert.equal(f.lists,before)})
test('tree paginates large folders without descendants leaking into direct files',async()=>{const f=fixture();for(let i=0;i<65;i++)f.l.sql.exec('INSERT INTO files VALUES (?,?,?,?)',`raw/item${i}.md`,'v',1,'2026');f.l.sql.exec('INSERT INTO files VALUES (?,?,?,?)','raw/sub/child.md','v',1,'2026');const first=await f.l.tree(new URL('https://x/api/tree?folder=raw')).json(),second=await f.l.tree(new URL('https://x/api/tree?folder=raw&offset=50')).json();assert.equal(first.files.length,50);assert.equal(second.files.length,15);assert.equal(first.fileTotal,65);assert.equal(second.nextOffset,null);assert.equal(new Set([...first.files,...second.files].map(x=>x.key)).size,65);assert.equal(first.folders[0].count,1);assert.equal(f.l.tree(new URL('https://x/api/tree?folder=../')).status,400)})
test('progress carries actual scanned count until atomic completion',async()=>{const f=fixture();f.source.list=async token=>token?{items:[{key:'b.md',etag:'v',size:1,modified:'x'}],next:''}:{items:[{key:'a.md',etag:'v',size:1,modified:'x'}],next:'two',truncated:true};await f.l.refresh();assert.equal(f.l.status().scanned,1);assert.equal(f.l.status().previousTotal,0);assert.equal(f.l.status().refreshing,true);await f.l.refresh();assert.equal(f.l.status().scanned,2);assert.equal(f.l.status().previousTotal,2);assert.equal(f.l.status().pages,2);assert.equal(f.l.status().refreshing,false)})

test('new account starts unbound even if a legacy global OSS_CONFIG secret exists',async()=>{const f=fixture();f.l.testSource=null;f.l.env.OSS_CONFIG=JSON.stringify({endpoint:'oss-cn-shanghai.aliyuncs.com',bucket:'legacy-owner',region:'cn-shanghai',accessKeyId:'secret',secretAccessKey:'secret'});assert.equal(await f.l.source(),null);const settings=await(await f.l.fetch(new Request('https://reader.test/api/settings'))).json();assert.deepEqual(settings,{configured:false});const catalog=await(await f.l.fetch(new Request('https://reader.test/api/catalog'))).json();assert.equal(catalog.bound,false);assert.deepEqual(catalog.items,[]);assert.equal(f.lists,0)})
test('encrypted connection cannot be decrypted in a different user library',async()=>{const f=fixture(),other=fixture();other.state.id={toString:()=>"different-user-library"};const ciphertext=await f.l.crypt({secretAccessKey:'private'});await assert.rejects(()=>other.l.crypt(ciphertext,true))})
