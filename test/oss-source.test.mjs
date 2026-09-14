import test from "node:test"
import assert from "node:assert/strict"
import { OssSource } from "../src/oss-source.mjs"
const config = {
  endpoint: "oss-cn-shanghai.aliyuncs.com",
  bucket: "test-bucket",
  region: "cn-shanghai",
  accessKeyId: "fixture",
  secretAccessKey: "fixture",
}
test("Alibaba url-encoded list decodes spaces and literal plus distinctly", async () => {
  const s = new OssSource(config)
  s.request = async () =>
    new Response(
      "<ListBucketResult><Contents><Key>wiki/AI+%E9%83%A8%E7%BD%B2/a%2Bb.md</Key><ETag>&quot;v1&quot;</ETag><Size>2</Size><LastModified>2026</LastModified></Contents><IsTruncated>false</IsTruncated></ListBucketResult>",
    )
  const p = await s.list()
  assert.equal(p.items[0].key, "wiki/AI 部署/a+b.md")
  assert.equal(p.items[0].etag, '"v1"')
})
test("OSS only uses signed GET and manual redirects accepted by Workers", async () => {
  const s = new OssSource(config)
  s.aws.fetch = async (url, options) => {
    assert.equal(options.method, "GET")
    assert.equal(options.redirect, "manual")
    assert.equal(new URL(url).pathname, "/a%20b/%2B.md")
    assert.equal(options.headers["If-None-Match"], '"v1"')
    return new Response("ok")
  }
  await s.get("a b/+.md", '"v1"')
})
