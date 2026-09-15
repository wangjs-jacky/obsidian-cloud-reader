import { mountIcons } from "./icons.mjs"
import { mountGuestMotion } from "./guest-motion.mjs"
import { mountWorkspace } from "./workspace.mjs"
import { mountOutline } from "./outline.mjs"
import MarkdownIt from "markdown-it"
import DOMPurify from "dompurify"
import { NoteTree } from "./tree.mjs"
import { scanProgress } from "./progress.mjs"
const $ = (s) => document.querySelector(s),
  escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    )
let offset = 0,
  total = 0,
  catalogRun = 0,
  articleRun = 0,
  current = "",
  refreshing = false,
  websiteSession=null,
  bound=false
async function api(path, options = {}) {
  const r = await fetch(path, options)
  if (r.status === 401) {
    location.href = "/auth/login"
    throw Error("请重新登录")
  }
  const body = await r.json()
  if (!r.ok) throw Error(body.error || "请求失败")
  return body
}
mountIcons()
mountGuestMotion()
mountWorkspace()
mountOutline($("#main"), $("#outline"))
const tree = new NoteTree($("#tree"), api, (key) => note(key))
let treeVersion = null,
  lastStatus = {},
  syncActive = false
function progress(s, busy = false) {
  const p = scanProgress(s, busy)
  $("#load-progress").hidden = false
  $("#load-progress").dataset.state = p.mode
  $("#progress-label").textContent = p.label
  $("#progress-detail").textContent = p.detail
  $("#progress-value").textContent =
    p.value == null ? "" : (p.mode === "loading" ? "约 " : "") + p.value + "%"
  if (p.value == null) $("#sync-progress").removeAttribute("value")
  else $("#sync-progress").value = p.value
}
function status(s) {
  lastStatus = s
  $("#count").textContent = $("#search").value.trim()
    ? `找到 ${total} 篇笔记`
    : `${s.noteCount ?? total} 篇笔记`
  $("#sync").textContent =
    s.error ||
    (s.updatedAt
      ? `目录更新于 ${new Date(s.updatedAt).toLocaleString()}`
      : "首次建立目录，只读取文件列表。")
  $("#sync").classList.toggle("error", !!s.error)
  $("#cache").textContent =
    `目录请求 ${s.listRequests} 次 · 文件请求 ${s.getRequests} 次 · 缓存命中 ${s.cacheHits} 次 · 未变更 ${s.notModified} 次。云端缓存 ${s.cachedFiles} 个文件 / ${(s.cachedBytes / 1048576).toFixed(1)} MB。`
  if (syncActive || s.refreshing || s.error || !s.updatedAt) progress(s)
}
function switchView() {
  const searching = !!$("#search").value.trim()
  $("#tree").hidden = false
  $("#notes").hidden = !searching
  $("#search-pager").hidden = !searching
  $("#clear-search").hidden = true
  $("#view-label").textContent = "文件目录"
  return searching
}
async function catalog() {
  const run = ++catalogRun,
    searching = switchView()
  if (!treeVersion && !syncActive) {
    syncActive = true
    progress({}, true)
  }
  try {
    const s = await api(
      "/api/catalog?q=" + encodeURIComponent($("#search").value.trim()) + "&offset=" + offset,
    )
    if (run !== catalogRun) return
    if(s.bound===false){showEmpty(true);return}
    bound=true;$("#refresh").disabled=false;$("#settings").title='连接设置'
    total = s.total
    status(s)
    if (searching) {
      $("#search-status").textContent=`找到 ${s.total} 篇笔记`
      $("#notes").innerHTML =
        s.items
          .map(
            (n) =>
              `<li><a href="/?note=${encodeURIComponent(n.key)}" data-key="${escape(n.key)}" class="${n.key === current ? "active" : ""}">${escape(n.key.split("/").pop().replace(/\.md$/i, ""))}<small>${escape(n.key.split("/").slice(0, -1).join("/"))}</small></a></li>`,
          )
          .join("") || '<li class="tree-message">没有找到匹配的笔记，试试更短的关键词。</li>'
      $("#prev").disabled = offset === 0
      $("#next").disabled = offset + 50 >= total
      $("#page").textContent =
        `${Math.floor(offset / 50) + 1} / ${Math.max(1, Math.ceil(total / 50))}`
    }
    if (s.updatedAt && treeVersion !== s.updatedAt) {
      treeVersion = s.updatedAt
      await tree.reset()
      if (current && !searching) await tree.reveal(current)
    }
    if (s.refreshing && !s.error) {
      syncActive = true
      setTimeout(() => {
        if (run === catalogRun && !refreshing) catalog()
      }, 350)
    } else {
      if (syncActive) progress(s)
      syncActive = false
    }
  } catch (e) {
    $("#sync").textContent = e.message
    progress({ error: e.message })
    syncActive = false
  }
}
async function resolve(ref, from) {
  const r = await api(
    "/api/resolve?ref=" + encodeURIComponent(ref) + "&from=" + encodeURIComponent(from),
  )
  return r.key
}
const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
md.inline.ruler.before("link", "wikilink", (state, silent) => {
  const pos = state.pos,
    match = state.src.slice(pos).match(/^(!?)\[\[([^\]\n]+)\]\]/)
  if (!match) return false
  if (!silent) {
    const [ref, label] = match[2].split("|"),
      token = state.push(match[1] ? "image" : "link_open", match[1] ? "img" : "a", match[1] ? 0 : 1)
    token.attrs = [[match[1] ? "src" : "href", ref]]
    if (match[1]) {
      token.content = label || ref
      token.children = []
    } else {
      const text = state.push("text", "", 0)
      text.content = label || ref
      state.push("link_close", "a", -1)
    }
  }
  state.pos += match[0].length
  return true
})
md.renderer.rules.image = (tokens, i) =>
  `<img data-ref="${escape(tokens[i].attrGet("src") || "")}" alt="${escape(tokens[i].content || "")}" loading="lazy">`
md.renderer.rules.link_open = (tokens, i) => {
  const href = tokens[i].attrGet("href") || ""
  return /^(https?:|mailto:)/i.test(href)
    ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">`
    : `<a href="#" data-ref="${escape(href)}">`
}
async function note(key, push = true) {
  const run = ++articleRun
  current = key
  tree.select(key)
  $("#locate").disabled = false
  if (push) history.pushState({}, "", "/?note=" + encodeURIComponent(key))
  $("#main").innerHTML =
    '<div class="note-loading" role="status"><p>正在打开笔记…</p><progress aria-label="文章加载进度"></progress></div>'
  document
    .querySelectorAll("#notes a")
    .forEach((a) => a.classList.toggle("active", a.dataset.key === key))
  try {
    const r = await fetch("/api/object?key=" + encodeURIComponent(key))
    if (r.status === 401) {
      location.href = "/auth/login"
      return
    }
    if (!r.ok) throw Error((await r.json()).error)
    let text = await r.text()
    if (run !== articleRun) return
    text = text.replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    const title = key.split("/").pop().replace(/\.md$/i, "")
    document.title = title + " · 随身笔记"
    $("#main").innerHTML =
      `<div class="note-path">${escape(key)}</div><article>${/^#\s/m.test(text.trimStart().split("\n")[0]) ? "" : "<h1>" + escape(title) + "</h1>"}${DOMPurify.sanitize(md.render(text))}</article>`
    for (const image of $("#main").querySelectorAll("img[data-ref]")) {
      const ref = image.dataset.ref
      if (/^https?:/i.test(ref)) {
        image.alt += "（外部图片）"
        continue
      }
      resolve(ref, key)
        .then((k) => {
          if (run === articleRun) image.src = "/api/object?key=" + encodeURIComponent(k)
        })
        .catch(() => image.replaceWith(document.createTextNode("[未找到图片：" + ref + "]")))
    }
    if (matchMedia("(max-width:800px)").matches) $("#main").scrollIntoView({ behavior: "smooth" })
    api("/api/cache")
      .then(status)
      .catch(() => {})
  } catch (e) {
    if (run === articleRun) $("#main").innerHTML = `<p class="error">${escape(e.message)}</p>`
  }
}
$("#notes").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-key]")
  if (a) {
    e.preventDefault()
    $("#search-dialog").close()
    note(a.dataset.key)
  }
})
$("#main").addEventListener("click", async (e) => {
  const a = e.target.closest("a[data-ref]")
  if (!a) return
  e.preventDefault()
  try {
    const ref = a.dataset.ref
    if (ref.startsWith("#")) {
      const text = decodeURIComponent(ref.slice(1))
      ;[...$("#main").querySelectorAll("h1,h2,h3,h4")]
        .find((h) => h.textContent === text)
        ?.scrollIntoView()
      return
    }
    const key = await resolve(ref, current)
    if (/\.md$/i.test(key)) note(key)
    else location.href = "/api/object?key=" + encodeURIComponent(key)
  } catch (e) {
    a.title = e.message
    a.textContent += "（未找到）"
  }
})
let timer
$("#search").addEventListener("input", () => {
  clearTimeout(timer)
  $("#search-status").textContent=$("#search").value.trim()?"正在搜索…":"输入关键词查找笔记"
  $("#notes").replaceChildren()
  timer = setTimeout(() => {
    offset = 0
    catalog()
  }, 250)
})
$("#prev").onclick = () => {
  offset = Math.max(0, offset - 50)
  catalog()
}
$("#next").onclick = () => {
  offset += 50
  catalog()
}
$("#refresh").onclick = async () => {
  if (refreshing) return
  refreshing = true
  syncActive = true
  progress({}, true)
  $("#refresh").disabled = true
  try {
    let s
    do {
      s = await api("/api/refresh", { method: "POST" })
      status(s)
    } while (s.refreshing && !s.error)
    await catalog()
    if (current) await note(current, false)
    syncActive = false
  } catch (e) {
    $("#sync").textContent = e.message
    progress({ error: e.message })
    syncActive = false
  } finally {
    refreshing = false
    $("#refresh").disabled = false
  }
}
$("#theme").onclick = () => {
  document.body.classList.toggle("dark")
  localStorage.setItem("reader-theme", document.body.classList.contains("dark") ? "dark" : "light")
}
if (localStorage.getItem("reader-theme") === "dark") document.body.classList.add("dark")
document.addEventListener('reader:modal-open',()=>lockPageScroll())
document.addEventListener('reader:modal-close',()=>unlockPageScroll())
let modalScroll=null
function lockPageScroll(){
  if(modalScroll)return
  modalScroll={x:scrollX,y:scrollY}
  document.body.style.top=`-${modalScroll.y}px`
  document.body.style.left=`-${modalScroll.x}px`
  document.documentElement.classList.add('modal-open')
}
function unlockPageScroll(){
  if(!modalScroll)return
  const position=modalScroll;modalScroll=null
  document.documentElement.classList.remove('modal-open')
  document.body.style.removeProperty('top');document.body.style.removeProperty('left')
  window.scrollTo({left:position.x,top:position.y,behavior:'instant'})
}
let configuredKeys=false, keyRequest=0
const keyFields=["accessKeyId","secretAccessKey"]
function eyeState(name,visible){
  const button=document.querySelector(`[data-key="${name}"]`)
  const label=name==="accessKeyId"?"Access Key ID":"Access Key Secret"
  $("#config-form").elements[name].type=visible?"text":"password"
  button.setAttribute("aria-pressed",String(visible))
  button.setAttribute("aria-label",(visible?"隐藏 ":"显示 ")+label)
  button.title=button.getAttribute("aria-label")
}
function hideKeys(){
  keyRequest++
  for(const name of keyFields){eyeState(name,false);document.querySelector(`[data-key="${name}"]`).disabled=false}
}
$("#config").addEventListener("close",()=>{
  unlockPageScroll();hideKeys();$("#config-form").reset();$("#config-status").textContent=""
})
$("#settings").onclick = async () => {
  try {
    const c = await api("/api/settings")
    $("#config-form").reset();hideKeys();configuredKeys=!!c.configured
    for (const name of ["endpoint", "bucket", "region", "prefix"])
      $("#config-form").elements[name].value = c[name] || ""
    for(const name of keyFields){const field=$("#config-form").elements[name];field.required=!configuredKeys;field.placeholder=configuredKeys?"••••••••":""}
    $("#config-status").textContent=""
    lockPageScroll()
    $("#config").showModal()
  } catch (e) { unlockPageScroll();$("#sync").textContent = e.message }
}
for(const name of keyFields)document.querySelector(`[data-key="${name}"]`).onclick=async()=>{
  const button=document.querySelector(`[data-key="${name}"]`),field=$("#config-form").elements[name]
  if(field.type==="text"){eyeState(name,false);return}
  const run=keyRequest
  button.disabled=true
  try{
    if(configuredKeys&&!field.value){
      const keys=await api("/api/settings/reveal",{method:"POST"})
      if(run!==keyRequest||!$("#config").open)return
      if(!field.value)field.value=keys[name]
    }
    eyeState(name,true)
  }catch(e){if(run===keyRequest)$("#config-status").textContent=e.message}
  finally{if(run===keyRequest)button.disabled=false}
}
$("#cancel").onclick = () => $("#config").close()
$("#config-form").onsubmit = async (e) => {
  e.preventDefault()
  const b = e.submitter
  b.disabled = true
  $("#config-status").textContent = "正在验证连接…"
  try {
    await api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    })
    $("#config").close()
    e.target.reset()
    current = ""
    articleRun++
    history.replaceState({}, "", "/")
    $("#main").innerHTML = "<p>连接已更新，请选择笔记。</p>"
    offset = 0
    bound=true;$("#search").disabled=false;$("#refresh").disabled=false
    treeVersion = null
    await tree.reset(true)
    await catalog()
  } catch (e) {
    $("#config-status").textContent = e.message
  } finally {
    b.disabled = false
  }
}
window.onpopstate = () => {
  const key = new URL(location.href).searchParams.get("note")
  if (key) note(key, false)
  else {
    articleRun++
    current = ""
    tree.select("")
    $("#locate").disabled = true
    document.title = "我的知识库"
    $("#main").innerHTML =
      '<div class="welcome"><h2>让知识随手可读。</h2><p>选择一篇笔记开始阅读。</p></div>'
    document.querySelectorAll("#notes a").forEach((a) => a.classList.remove("active"))
  }
}
$("#clear-search").onclick = () => {
  clearTimeout(timer)
  $("#search").value = ""
  offset = 0
  catalog()
}
$("#locate").onclick = async () => {
  if (!current) return
  clearTimeout(timer)
  $("#search").value = ""
  offset = 0
  await catalog()
  await tree.reveal(current)
}
function showEmpty(authenticated){
  bound=false;syncActive=false;total=0;treeVersion=null
  $("#count").textContent='0 篇笔记';$("#sync").textContent=authenticated?'绑定 OSS 后才会加载你的目录。':'登录后绑定你的知识库。';$("#load-progress").hidden=true;$("#tree").innerHTML='';$("#notes").innerHTML='';$("#search-pager").hidden=true;$("#refresh").disabled=true;$("#search").disabled=true;$("#locate").disabled=true
  $("#main").innerHTML=authenticated?'<div class="welcome"><small>你的知识库还是空的</small><h2>先连接你的 Obsidian。</h2><p>绑定你自己的 OSS 后，笔记才会出现在这里。</p><button id="bind-oss">绑定我的 OSS</button><p class="muted">使用 Remotely Save 的连接信息，只读取你的笔记。</p></div>':'<div class="welcome"><small>你的私人阅读空间</small><h2>带着你的笔记，随处阅读。</h2><p>注册或登录网站账号，再绑定自己的 OSS。</p><a class="account-link" href="/auth/login">登录 / 注册</a></div>'
  if(authenticated)$("#bind-oss").onclick=()=>$("#settings").click()
}
try{
  const s=await api('/auth/session');websiteSession=s.authenticated?s.user:null
  document.body.classList.remove('session-pending')
  document.body.classList.toggle('guest',!websiteSession)
  $("#guest-home").hidden=!!websiteSession
  $("#session-status").hidden=true
  $("#search-toggle").hidden=!websiteSession
  $("#login").hidden=!!websiteSession;$("#logout").hidden=!websiteSession;$("#settings").hidden=!websiteSession;$("#account-name").hidden=!websiteSession
  if(!websiteSession)showEmpty(false)
  else{
    $("#account-name").textContent=websiteSession.name||websiteSession.email||'我的账号'
    const config=await api('/api/settings')
    if(!config.configured)showEmpty(true)
    else {bound=true;$("#settings").title='连接设置';$("#refresh").disabled=false;await catalog();const initial=new URL(location.href).searchParams.get('note');if(initial){await note(initial,false);await tree.reveal(initial)}}
  }
}catch(e){$("#session-status").hidden=false;$("#session-status").textContent='暂时无法连接，请刷新重试。';$("#main").innerHTML='<p class="error">'+escape(e.message)+'</p>';$("#count").textContent='账号服务暂不可用'}
