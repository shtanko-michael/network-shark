import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Toolbar from './Toolbar'
import FilterBar from './FilterBar'
import RequestTable from './RequestTable'
import RequestDetails from './RequestDetails'
import StatsFooter from './StatsFooter'

// Wails runtime is injected by the desktop shell.
// In browser/dev mode we fall back to no-ops so the UI still renders.
const EventsOn  = (...a) => window?.runtime?.EventsOn?.(...a)  ?? (() => {})
const EventsOff = (...a) => window?.runtime?.EventsOff?.(...a) ?? undefined

async function goStartCapture() {
  try { return await window.go?.main?.App?.StartCapture() } catch { return null }
}
async function goStopCapture() {
  try { return await window.go?.main?.App?.StopCapture() } catch { return null }
}
async function goGetStatus() {
  try { return await window.go?.main?.App?.GetStatus() } catch { return null }
}
async function goGetCapturedRequests() {
  try { return await window.go?.main?.App?.GetCapturedRequests() } catch { return null }
}
async function goClearCapturedRequests() {
  try { return await window.go?.main?.App?.ClearCapturedRequests() } catch { return null }
}
async function goIsCATrusted() {
  try { return await window.go?.main?.App?.IsCATrusted() } catch { return false }
}
async function goInstallCA() {
  try { return await window.go?.main?.App?.InstallCA() } catch (e) { return String(e) }
}
async function goLaunchChrome() {
  try { return await window.go?.main?.App?.LaunchChrome() } catch (e) { return String(e) }
}
async function goForceRestartChrome() {
  try { return await window.go?.main?.App?.ForceRestartChrome() } catch (e) { return String(e) }
}

const TOAST_MS = 2500

function mergeRequests(current, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return current
  const seen = new Set(current.map(r => r.id))
  const next = [...current]
  for (const req of incoming) {
    if (!seen.has(req.id)) {
      seen.add(req.id)
      next.push(req)
    }
  }
  return next
}

export default function NetworkPanel() {
  const [requests, setRequests]           = useState([])
  const [recording, setRecording]         = useState(false)
  const [preserveLog, setPreserveLog]     = useState(false)
  const [disableCache, setDisableCache]   = useState(false)
  const [search, setSearch]               = useState('')
  const [filter, setFilter]               = useState('all')
  const [invert, setInvert]               = useState(false)
  const [selectedId, setSelectedId]       = useState(null)
  const [filterPanelOpen, setFilterPanelOpen] = useState(true)
  const [toast, setToast]                 = useState(null)
  const [proxyPort, setProxyPort]         = useState(9876)
  const [caInstalled, setCaInstalled]     = useState(true) // optimistic; checked on mount
  const fileInputRef = useRef(null)
  const searchInputRef = useRef(null)
  const toastTimer   = useRef(null)

  const showToast = useCallback((msg, type = 'info', action = null, timeout = TOAST_MS) => {
    setToast({ msg, type, action })
    clearTimeout(toastTimer.current)
    if (timeout > 0) {
      toastTimer.current = setTimeout(() => setToast(null), timeout)
    }
  }, [])

  // ---- Wails event listeners ----
  useEffect(() => {
    // Incoming network request from the Go proxy.
    const offReq = EventsOn('network:request', (req) => {
      setRequests(prev => mergeRequests(prev, [req]))
    })

    // Proxy status changes (start/stop).
    const offStatus = EventsOn('capture:status', ({ running, port }) => {
      setRecording(running)
      if (port) setProxyPort(port)
    })

    // Sync initial status with Go side.
    goGetStatus().then(s => {
      if (s) {
        setRecording(Boolean(s.running))
        if (s.port) setProxyPort(s.port)
      }
    })

    // Check whether our MITM CA is trusted by the OS.
    goIsCATrusted().then(trusted => setCaInstalled(Boolean(trusted)))

    goGetCapturedRequests().then(list => {
      if (Array.isArray(list)) setRequests(prev => mergeRequests(prev, list))
    })

    return () => {
      if (typeof offReq   === 'function') offReq()
      if (typeof offStatus === 'function') offStatus()
    }
  }, [])

  useEffect(() => {
    if (!recording) return undefined
    const syncCaptured = () => {
      goGetCapturedRequests().then(list => {
        if (Array.isArray(list)) setRequests(prev => mergeRequests(prev, list))
      })
    }
    syncCaptured()
    const id = setInterval(syncCaptured, 1000)
    return () => clearInterval(id)
  }, [recording])

  // ---- Recording toggle ----
  const handleToggleRecord = useCallback(async () => {
    if (recording) {
      await goStopCapture()
      showToast('Capture stopped — system proxy restored')
    } else {
      if (!preserveLog) {
        await goClearCapturedRequests()
        setRequests([])
        setSelectedId(null)
      }
      const err = await goStartCapture()
      if (err) {
        showToast('Failed to start capture: ' + err, 'error')
        return
      }
      showToast(`Capturing on port ${proxyPort} — system proxy set`, 'success')
    }
  }, [recording, preserveLog, proxyPort, showToast])

  const handleClear = useCallback(() => {
    goClearCapturedRequests()
    setRequests([])
    setSelectedId(null)
    showToast('Log cleared')
  }, [showToast])

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let list = requests
    if (filter !== 'all') {
      list = list.filter(r =>
        filter === 'fetch+xhr'
          ? r.type === 'fetch' || r.type === 'xhr'
          : r.type === filter
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const match = r =>
        (r.name  || '').toLowerCase().includes(q) ||
        (r.url   || '').toLowerCase().includes(q) ||
        (r.method || '').toLowerCase().includes(q) ||
        String(r.status).includes(q) ||
        (r.type  || '').toLowerCase().includes(q)
      list = invert ? list.filter(r => !match(r)) : list.filter(match)
    }
    return list
  }, [requests, filter, search, invert])

  const selected = useMemo(
    () => requests.find(r => r.id === selectedId) || null,
    [requests, selectedId]
  )

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const isAccel = e => e.ctrlKey || e.metaKey

    const onKey = e => {
      if (isAccel(e) && e.code === 'KeyF') {
        e.preventDefault()
        e.stopPropagation()
        searchInputRef.current?.focus()
        searchInputRef.current?.select?.()
      }
      if (isAccel(e) && e.code === 'KeyL') {
        e.preventDefault()
        e.stopPropagation()
        handleClear()
      }
      if (isAccel(e) && e.code === 'KeyR') {
        e.preventDefault()
        e.stopPropagation()
        handleToggleRecord()
      }
      if (e.key === 'Escape') setSelectedId(null)
    }

    // Capture phase on document is more reliable in embedded webviews.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [handleClear, handleToggleRecord])

  // ---- HAR export ----
  const handleExport = () => {
    const har = buildHAR(requests)
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `network-shark-${new Date().toISOString().slice(0, 19)}.har`
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
        const imported = parseHAR(JSON.parse(evt.target.result))
        setRequests(prev => preserveLog ? [...prev, ...imported] : imported)
        showToast(`Imported ${imported.length} requests`, 'success')
      } catch {
        showToast('Invalid HAR file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleInstallCA = useCallback(async () => {
    const err = await goInstallCA()
    if (err) {
      showToast('CA install failed: ' + err, 'error')
    } else {
      setCaInstalled(true)
      showToast('CA certificate installed — HTTPS traffic will now be decrypted', 'success')
    }
  }, [showToast])

  const handleForceRestartChrome = useCallback(async () => {
    showToast('Restarting Chrome with Network Shark proxy...', 'info', null, 0)
    const err = await goForceRestartChrome()
    if (err) {
      showToast('Chrome restart failed: ' + err, 'error', null, 0)
      return
    }
    showToast('Chrome restarted with Network Shark proxy', 'success')
  }, [showToast])

  const handleLaunchChrome = useCallback(async () => {
    const err = await goLaunchChrome()
    if (err) {
      const action = err.toLowerCase().includes('chrome is already running')
        ? { label: 'Force restart', onClick: handleForceRestartChrome }
        : null
      showToast('Chrome launch failed: ' + err, 'error', action, action ? 0 : TOAST_MS)
      return
    }
    showToast('Chrome launched with Network Shark proxy', 'success')
  }, [handleForceRestartChrome, showToast])

  const handleWindowMinimize = useCallback(() => {
    window?.runtime?.WindowMinimise?.()
  }, [])

  const handleWindowMaximize = useCallback(() => {
    window?.runtime?.WindowToggleMaximise?.()
  }, [])

  const handleWindowClose = useCallback(() => {
    window?.runtime?.Quit?.()
  }, [])

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
        flexShrink: 0, userSelect: 'none', '--wails-draggable': 'drag',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 5, '--wails-draggable': 'no-drag' }}>
            {[
              { color: '#ef4444', title: 'Minimize', onClick: handleWindowClose  },
              { color: '#f59e0b', title: 'Maximize / Restore', onClick: handleWindowMaximize },
              { color: '#10b981', title: 'Close', onClick: handleWindowMinimize },
            ].map(btn => (
              <button
                key={btn.title}
                onClick={btn.onClick}
                title={btn.title}
                style={{
                  width: 10, height: 10, borderRadius: '50%', border: 'none',
                  background: btn.color + 'cc', display: 'inline-block',
                  padding: 0, cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d8', marginLeft: 8 }}>
            Network Shark
          </span>
          <span style={{ fontSize: 10, color: '#52525b', fontFamily: 'ui-monospace, Consolas, monospace' }}>v1.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, '--wails-draggable': 'no-drag' }}>
          {recording && (
            <span style={{
              fontSize: 10, color: '#10b981', fontFamily: 'ui-monospace, Consolas, monospace',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#10b981',
                display: 'inline-block', animation: 'pulse 1.5s infinite',
              }} />
              LIVE · proxy :{ proxyPort }
            </span>
          )}
          {/* <span style={{ fontSize: 11, color: '#52525b', fontFamily: 'ui-monospace, Consolas, monospace' }}>
            ⌘L clear · Esc close · Click row for details
          </span> */}
        </div>
      </div>

      {!caInstalled && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 14px', background: '#451a03', borderBottom: '1px solid #78350f',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ flex: 1, fontSize: 12, color: '#fde68a' }}>
            HTTPS traffic is tunneled opaque. Install the Network Shark CA certificate to decrypt HTTPS requests.
          </span>
          <button
            onClick={handleInstallCA}
            style={{
              padding: '3px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4,
              background: '#d97706', border: 'none', color: '#fff', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Install Certificate
          </button>
          <button
            onClick={() => setCaInstalled(true)}
            title="Dismiss"
            style={{
              background: 'none', border: 'none', color: '#a16207', cursor: 'pointer',
              fontSize: 14, lineHeight: 1, padding: '0 2px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      <Toolbar
        recording={recording}
        onToggleRecord={handleToggleRecord}
        onClear={handleClear}
        onLaunchChrome={handleLaunchChrome}
        searchInputRef={searchInputRef}
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
        />
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRight: selected ? '1px solid #27272a' : 'none',
          width: selected ? '55%' : '100%',
        }}>
          <RequestTable
            requests={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            autoScroll={recording}
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
        accept=".har,.json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

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
          <span>{toast.msg}</span>
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                border: '1px solid #ef4444', background: '#7f1d1d', color: '#fee2e2',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes pulse  { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  )
}

/* ---- HAR helpers ---- */
function buildHAR(requests) {
  return {
    log: {
      version: '1.2',
      creator: { name: 'Network Shark', version: '1.0' },
      entries: requests.map(r => ({
        startedDateTime: new Date(r.startedAt).toISOString(),
        time: r.duration,
        request: {
          method: r.method, url: r.url, httpVersion: 'HTTP/1.1',
          headers: Object.entries(r.requestHeaders || {}).map(([name, value]) => ({ name, value: String(value) })),
          queryString: [], cookies: [], headersSize: -1,
          bodySize: r.payload ? r.payload.length : 0,
          postData: r.payload ? { mimeType: 'application/json', text: r.payload } : undefined,
        },
        response: {
          status: r.status, statusText: r.statusText || '', httpVersion: 'HTTP/1.1',
          headers: Object.entries(r.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) })),
          cookies: (r.cookies || []).map(c => ({ name: c.name, value: c.value })),
          content: { size: r.size, mimeType: r.mime || '', text: r.response || '' },
          redirectURL: '', headersSize: -1, bodySize: r.transferred,
        },
        cache: {},
        timings: {
          blocked: r.timing?.queue || 0, dns: r.timing?.dns || 0,
          connect: r.timing?.connect || 0, ssl: r.timing?.ssl || 0,
          send: 0, wait: r.timing?.ttfb || 0, receive: r.timing?.download || 0,
        },
        _resourceType: r.type,
      })),
    },
  }
}

function parseHAR(data) {
  return (data?.log?.entries || []).map((e, i) => {
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
    const startedAt = Date.now() - (data.log.entries.length - i) * 300
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
      mime: e.response?.content?.mimeType || '',
      requestHeaders: Object.fromEntries((e.request?.headers || []).map(h => [h.name, h.value])),
      responseHeaders: Object.fromEntries((e.response?.headers || []).map(h => [h.name, h.value])),
      payload: e.request?.postData?.text || null,
      response: e.response?.content?.text || '',
      cookies: (e.response?.cookies || []).map(c => ({ name: c.name, value: c.value, domain: host, path: '/', httpOnly: false, secure: true })),
    }
  })
}
