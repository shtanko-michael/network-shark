import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Toolbar from './Toolbar'
import FilterBar from './FilterBar'
import RequestTable from './RequestTable'
import RequestDetails from './RequestDetails'
import StatsFooter from './StatsFooter'
import { generateRequest, seedInitial } from '../lib/mockData'

const TOAST_DURATION = 2500

export default function NetworkPanel() {
  const [requests, setRequests] = useState([])
  const [recording, setRecording] = useState(true)
  const [preserveLog, setPreserveLog] = useState(false)
  const [disableCache, setDisableCache] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [invert, setInvert] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [filterPanelOpen, setFilterPanelOpen] = useState(true)
  const [toast, setToast] = useState(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const fileInputRef = useRef(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION)
  }, [])

  // Seed initial requests on mount
  useEffect(() => {
    setRequests(seedInitial(28))
  }, [])

  // Live stream mock requests while recording
  useEffect(() => {
    if (!recording) return
    const tick = () => {
      const burst = 1 + Math.floor(Math.random() * 2)
      setRequests(prev => {
        const now = performance.now()
        const additions = Array.from({ length: burst }, (_, i) =>
          generateRequest({ startedAt: now + i * (Math.random() * 20) })
        )
        return [...prev, ...additions]
      })
    }
    const id = setInterval(tick, 1000 + Math.random() * 700)
    return () => clearInterval(id)
  }, [recording])

  const handleClear = useCallback(() => {
    setRequests([])
    setSelectedId(null)
    showToast('Network log cleared')
  }, [showToast])

  const filtered = useMemo(() => {
    let list = requests
    if (filter !== 'all') {
      list = list.filter(r =>
        filter === 'fetch+xhr' ? (r.type === 'fetch' || r.type === 'xhr') : r.type === filter
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const match = r =>
        r.name.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        String(r.status).includes(q) ||
        r.type.toLowerCase().includes(q)
      list = invert ? list.filter(r => !match(r)) : list.filter(match)
    }
    return list
  }, [requests, filter, search, invert])

  const selected = useMemo(
    () => requests.find(r => r.id === selectedId) || null,
    [requests, selectedId]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault(); handleClear()
      }
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClear])

  const handleExport = () => {
    const har = buildHAR(requests)
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `network-${new Date().toISOString().slice(0, 19)}.har`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${requests.length} requests as HAR`, 'success')
  }

  const handleImport = () => fileInputRef.current?.click()
  const handleFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result)
        const imported = parseHAR(data)
        setRequests(prev => preserveLog ? [...prev, ...imported] : imported)
        showToast(`Imported ${imported.length} requests`, 'success')
      } catch {
        showToast('Invalid HAR file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const toastColors = { info: '#3b82f6', success: '#10b981', error: '#ef4444' }

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: '#09090b', color: '#f4f4f5',
    }}>
      {/* Brand bar */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', borderBottom: '1px solid #27272a', background: '#09090b',
        flexShrink: 0, userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(239,68,68,0.8)', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(245,158,11,0.8)', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(16,185,129,0.8)', display: 'inline-block' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d8', letterSpacing: '-0.01em', marginLeft: 8 }}>
            Network Inspector
          </span>
          <span style={{ fontSize: 10, color: '#52525b', fontFamily: 'ui-monospace, Consolas, monospace' }}>v1.0</span>
        </div>
        <span style={{ fontSize: 11, color: '#52525b', fontFamily: 'ui-monospace, Consolas, monospace' }}>
          ⌘L clear · Esc close · Click row for details
        </span>
      </div>

      <Toolbar
        recording={recording}
        onToggleRecord={() => setRecording(v => !v)}
        onClear={handleClear}
        preserveLog={preserveLog}
        onTogglePreserve={() => setPreserveLog(v => !v)}
        disableCache={disableCache}
        onToggleCache={() => setDisableCache(v => !v)}
        search={search}
        onSearch={setSearch}
        onExport={handleExport}
        onImport={handleImport}
        onShowSettings={() => showToast('Settings — coming soon')}
        filterPanelOpen={filterPanelOpen}
        onToggleFilterPanel={() => setFilterPanelOpen(v => !v)}
      />

      {filterPanelOpen && (
        <FilterBar
          active={filter}
          onChange={setFilter}
          invert={invert}
          onToggleInvert={() => setInvert(v => !v)}
        />
      )}

      {/* Main content split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRight: selected ? '1px solid #27272a' : 'none',
          width: selected ? '55%' : '100%',
          transition: 'width 0.15s',
        }}>
          <RequestTable
            requests={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            autoScroll={autoScroll && recording}
          />
        </div>

        {selected && (
          <div style={{ width: '45%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <RequestDetails request={selected} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      <StatsFooter requests={requests} filteredCount={filtered.length} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".har,.json,application/json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 40, right: 20, padding: '8px 14px',
          background: '#18181b', border: `1px solid ${toastColors[toast.type]}`,
          borderRadius: 6, fontSize: 12, color: '#e4e4e7',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: 8, zIndex: 9999,
          fontFamily: 'ui-monospace, Consolas, monospace',
          animation: 'fadeIn 0.15s ease',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: toastColors[toast.type], flexShrink: 0 }} />
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}

/* ---- HAR helpers ---- */
function buildHAR(requests) {
  return {
    log: {
      version: '1.2',
      creator: { name: 'Network Inspector', version: '1.0' },
      entries: requests.map(r => ({
        startedDateTime: new Date(Date.now() - (performance.now() - r.startedAt)).toISOString(),
        time: r.duration,
        request: {
          method: r.method, url: r.url, httpVersion: 'HTTP/2',
          headers: Object.entries(r.requestHeaders).map(([name, value]) => ({ name, value: String(value) })),
          queryString: [], cookies: [], headersSize: -1,
          bodySize: r.payload ? r.payload.length : 0,
          postData: r.payload ? { mimeType: 'application/json', text: r.payload } : undefined,
        },
        response: {
          status: r.status, statusText: r.statusText || '', httpVersion: 'HTTP/2',
          headers: Object.entries(r.responseHeaders).map(([name, value]) => ({ name, value: String(value) })),
          cookies: (r.cookies || []).map(c => ({ name: c.name, value: c.value })),
          content: { size: r.size, mimeType: r.mime, text: r.response },
          redirectURL: '', headersSize: -1, bodySize: r.transferred,
        },
        cache: {},
        timings: {
          blocked: r.timing.queue, dns: r.timing.dns, connect: r.timing.connect,
          ssl: r.timing.ssl, send: 0, wait: r.timing.ttfb, receive: r.timing.download,
        },
        _resourceType: r.type,
      })),
    },
  }
}

function parseHAR(data) {
  const entries = data?.log?.entries || []
  return entries.map((e, i) => {
    const url = e.request?.url || ''
    let host = ''
    try { host = new URL(url).hostname } catch { host = '' }
    const t = e.timings || {}
    const timing = {
      queue: Math.max(0, t.blocked || 0), dns: Math.max(0, t.dns || 0),
      connect: Math.max(0, t.connect || 0), ssl: Math.max(0, t.ssl || 0),
      ttfb: Math.max(0, t.wait || 0), download: Math.max(0, t.receive || 0),
    }
    const duration = Object.values(timing).reduce((a, b) => a + b, 0)
    const startedAt = performance.now() - (entries.length - i) * 500
    return {
      id: `har_${i}_${Date.now()}`,
      name: url.split('/').filter(Boolean).pop() || host,
      url, host,
      path: (() => { try { const u = new URL(url); return u.pathname + u.search } catch { return '/' } })(),
      method: e.request?.method || 'GET',
      type: e._resourceType || 'fetch',
      status: e.response?.status || 0,
      statusText: null,
      initiator: 'imported',
      size: e.response?.content?.size || 0,
      transferred: e.response?.bodySize || 0,
      duration, timing,
      startedAt, finishedAt: startedAt + duration,
      mime: e.response?.content?.mimeType || 'application/octet-stream',
      requestHeaders: Object.fromEntries((e.request?.headers || []).map(h => [h.name, h.value])),
      responseHeaders: Object.fromEntries((e.response?.headers || []).map(h => [h.name, h.value])),
      payload: e.request?.postData?.text || null,
      response: e.response?.content?.text || '',
      cookies: (e.response?.cookies || []).map(c => ({ name: c.name, value: c.value, domain: host, path: '/', httpOnly: false, secure: true })),
    }
  })
}
