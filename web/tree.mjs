const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
export class NoteTree {
  constructor(container, api, onOpen) {
    this.el = container
    this.api = api
    this.onOpen = onOpen
    this.data = new Map()
    this.pending = new Map()
    this.errors = new Map()
    this.expanded = new Set(["wiki"])
    this.current = ""
    this.generation = 0
    container.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-key]")
      if (a) {
        e.preventDefault()
        onOpen(a.dataset.key)
        return
      }
      const button = e.target.closest("button")
      if (!button) return
      if (button.hasAttribute("data-folder")) this.toggle(button.dataset.folder)
      else if (button.hasAttribute("data-more")) this.load(button.dataset.more, true)
      else if (button.hasAttribute("data-retry")) this.load(button.dataset.retry)
    })
    container.addEventListener("keydown", (e) => {
      const b = e.target.closest("button[data-folder]")
      if (!b) return
      const key = b.dataset.folder
      if (
        (e.key === "ArrowRight" && !this.expanded.has(key)) ||
        (e.key === "ArrowLeft" && this.expanded.has(key))
      ) {
        e.preventDefault()
        this.toggle(key)
      }
    })
  }
  async reset(clearExpanded = false) {
    this.generation++
    this.data.clear()
    this.pending.clear()
    this.errors.clear()
    if (clearExpanded) this.expanded = new Set(["wiki"])
    await this.load("")
  }
  async load(folder, more = false) {
    if (this.pending.has(folder)) return this.pending.get(folder)
    const generation = this.generation,
      old = this.data.get(folder)
    let job
    job = (async () => {
      try {
        const offset = more ? old?.nextOffset : 0
        if (more && offset == null) return
        const result = await this.api(
          "/api/tree?folder=" + encodeURIComponent(folder) + "&offset=" + (offset || 0),
        )
        if (generation !== this.generation) return
        this.data.set(folder, {
          ...result,
          files: more ? [...old.files, ...result.files] : result.files,
        })
        this.errors.delete(folder)
      } catch (e) {
        if (generation === this.generation) this.errors.set(folder, e.message)
      } finally {
        if (generation === this.generation) {
          this.pending.delete(folder)
          this.paint()
        }
      }
      if (generation === this.generation)
        for (const child of this.data.get(folder)?.folders || [])
          if (this.expanded.has(child.key) && !this.data.has(child.key)) await this.load(child.key)
    })()
    this.pending.set(folder, job)
    this.paint()
    return job
  }
  async toggle(folder) {
    if (this.expanded.has(folder)) {
      this.expanded.delete(folder)
      this.paint()
    } else {
      this.expanded.add(folder)
      this.paint()
      if (!this.data.has(folder)) await this.load(folder)
    }
  }
  select(key) {
    this.current = key
    this.paint()
  }
  async reveal(key) {
    this.current = key
    if (!this.data.has("")) await this.load("")
    const parts = key.split("/")
    let folder = ""
    for (const part of parts.slice(0, -1)) {
      folder = folder ? folder + "/" + part : part
      this.expanded.add(folder)
      if (!this.data.has(folder)) await this.load(folder)
    }
    // A folder may contain thousands of files. Locate a deep-linked note without downloading all pages.
    const data = this.data.get(folder)
    if (data && !data.files.some((f) => f.key === key)) {
      data.files.push({ key, name: parts.at(-1).replace(/\.md$/i, ""), located: true })
    }
    this.paint()
    const a = [...this.el.querySelectorAll("a[data-key]")].find((a) => a.dataset.key === key)
    a?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }
  branch(folder) {
    const data = this.data.get(folder),
      error = this.errors.get(folder),
      busy = this.pending.has(folder)
    if (!data)
      return error
        ? `<li class="tree-message error">${esc(error)} <button data-retry="${esc(folder)}">重试</button></li>`
        : '<li class="tree-message" role="status">正在加载目录…</li>'
    const folders = data.folders
      .map((f) => {
        const open = this.expanded.has(f.key)
        return `<li class="folder"><button class="folder-row" data-folder="${esc(f.key)}" aria-expanded="${open}"><span class="chevron" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg></span><span class="folder-name">${esc(f.name)}</span><span class="folder-count" title="包含 ${f.count} 篇笔记">${f.count}</span></button>${open ? `<ul class="branch">${this.branch(f.key)}</ul>` : ""}</li>`
      })
      .join("")
    const files = [...new Map(data.files.map((f) => [f.key, f])).values()]
      .map(
        (f) =>
          `<li class="tree-file"><a href="/?note=${encodeURIComponent(f.key)}" data-key="${esc(f.key)}" title="${esc(f.key)}" ${f.key === this.current ? 'aria-current="page" class="active"' : ""}><span class="file-icon" aria-hidden="true">▤</span><span>${esc(f.name)}</span></a></li>`,
      )
      .join("")
    return (
      folders +
      files +
      (error ? `<li class="tree-message error">${esc(error)}</li>` : "") +
      (data.nextOffset != null
        ? `<li class="tree-message"><button data-more="${esc(folder)}" ${busy ? "disabled" : ""}>${busy ? "正在加载…" : `再显示 50 篇（已列出 ${data.files.filter((f) => !f.located).length}/${data.fileTotal}）`}</button></li>`
        : "") +
      (!folders && !files ? '<li class="tree-message">此目录没有 Markdown 笔记</li>' : "")
    )
  }
  paint() {
    const active = document.activeElement,
      focusKey = this.el.contains(active) ? active?.dataset.folder : null
    this.el.innerHTML = '<ul class="tree-root">' + this.branch("") + "</ul>"
    if (focusKey != null)
      [...this.el.querySelectorAll("button[data-folder]")]
        .find((b) => b.dataset.folder === focusKey)
        ?.focus({ preventScroll: true })
  }
}
