import { AwsClient } from "aws4fetch"
import { XMLParser } from "fast-xml-parser"
export function validateConfig(c) {
  const url = new URL(c.endpoint.startsWith("https://") ? c.endpoint : "https://" + c.endpoint)
  if (
    url.protocol !== "https:" ||
    !/^oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.port ||
    url.username ||
    url.password
  )
    throw Error("仅支持阿里云 OSS 公网 HTTPS Endpoint")
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(c.bucket) ||
    !/^cn-[a-z0-9-]+$|^[a-z]+-[a-z0-9-]+$/.test(c.region || "")
  )
    throw Error("Bucket 或 Region 格式不正确")
  if (
    !c.accessKeyId ||
    !c.secretAccessKey ||
    c.accessKeyId.length > 256 ||
    c.secretAccessKey.length > 256
  )
    throw Error("请填写 Access Key 和 Secret")
  const prefix = (c.prefix || "").replace(/^\/+|\/+$/g, "")
  if (prefix && !safeKey(prefix)) throw Error("目录前缀不正确")
  return {
    endpoint: url.origin,
    bucket: c.bucket,
    region: c.region,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    prefix,
  }
}
export function safeKey(key) {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= 2048 &&
    !/[\\\x00-\x1f]/.test(key) &&
    key.split("/").every((p) => p && !p.startsWith("."))
  )
}
export class OssSource {
  constructor(config) {
    this.config = validateConfig(config)
    this.aws = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: "s3",
      retries: 0,
    })
  }
  async request(key = "", params = {}, headers = {}) {
    const c = this.config,
      u = new URL(c.endpoint)
    u.hostname = c.bucket + "." + u.hostname
    u.pathname = "/" + key.split("/").map(encodeURIComponent).join("/")
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return this.aws.fetch(u.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    })
  }
  async list(token = "") {
    const c = this.config,
      r = await this.request("", {
        "list-type": "2",
        "max-keys": "1000",
        "encoding-type": "url",
        prefix: c.prefix ? c.prefix + "/" : "",
        ...(token ? { "continuation-token": token } : {}),
      })
    if (!r.ok) {
      await r.body?.cancel()
      throw Error("OSS 目录读取失败（" + r.status + "）")
    }
    const doc = new XMLParser({
      parseTagValue: false,
      ignoreAttributes: true,
      isArray: (name) => name === "Contents",
    }).parse(await r.text()).ListBucketResult
    if (!doc) throw Error("OSS 目录响应无效")
    return {
      items: (doc.Contents || [])
        .map((o) => ({
          key: decodeURIComponent(o.Key.replace(/\+/g, " ")),
          etag: o.ETag,
          size: Number(o.Size),
          modified: o.LastModified,
        }))
        .filter((o) => safeKey(o.key)),
      next: doc.IsTruncated === "true" ? doc.NextContinuationToken : "",
      truncated: doc.IsTruncated === "true",
    }
  }
  get(key, etag) {
    return this.request(key, {}, etag ? { "If-None-Match": etag } : {})
  }
}
