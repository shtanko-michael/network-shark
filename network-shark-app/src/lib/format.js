export function formatSize(bytes) {
  if (bytes === 0 || bytes === null || bytes === undefined) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatTime(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function statusColor(status) {
  if (!status || status === 0) return '#ef4444'
  if (status >= 200 && status < 300) return '#10b981'
  if (status >= 300 && status < 400) return '#f59e0b'
  return '#ef4444'
}

export function statusClass(status) {
  if (!status || status === 0) return 'text-red-400'
  if (status >= 200 && status < 300) return 'text-emerald-400'
  if (status >= 300 && status < 400) return 'text-amber-400'
  return 'text-red-400'
}

export function statusLabel(status, errorText) {
  if (errorText) return errorText
  if (!status || status === 0) return '(failed)'
  return String(status)
}

export function shortName(url) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname
    return { short: last + (u.search || ''), path: u.pathname + u.search }
  } catch {
    return { short: url, path: url }
  }
}

export function domainOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}
