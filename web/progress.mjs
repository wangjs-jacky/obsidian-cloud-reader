// OSS supplies a continuation token, not a total. The prior snapshot is only an estimate.
export function scanProgress(state, busy = false) {
  if (state.error)
    return {
      mode: "error",
      value: null,
      label: "检查未完成",
      detail: state.error + "；原有目录仍可阅读。",
    }
  if (state.refreshing || busy) {
    const scanned = state.scanned || 0,
      total = state.previousTotal || 0
    const value =
      total > 0 && scanned > 0 ? Math.min(95, Math.floor((scanned / total) * 100)) : null
    return {
      mode: "loading",
      value,
      label: "正在检查云端目录",
      detail: scanned
        ? `已检查 ${scanned.toLocaleString()} 个文件 · 已完成 ${state.pages || 0} 页`
        : "正在连接 OSS，读取文件列表…",
    }
  }
  if (state.updatedAt)
    return {
      mode: "done",
      value: 100,
      label: "目录已就绪",
      detail: `${(state.noteCount || 0).toLocaleString()} 篇笔记 · 正文按需读取`,
    }
  return {
    mode: "loading",
    value: null,
    label: "首次加载目录",
    detail: "正在读取文件列表，不会下载全库正文。",
  }
}
