import { useState } from 'react'
import { X } from 'lucide-react'
import { formatSize, formatTime, statusLabel } from '../lib/format'

const TABS = ['Headers', 'Payload', 'Preview', 'Response', 'Timing', 'Cookies']

const panelStyle = {
  height: '100%', display: 'flex', flexDirection: 'column',
  background: '#09090b', overflow: 'hidden',
}

export default function RequestDetails({ request, onClose }) {
  const [tab, setTab] = useState('Headers')
  if (!request) return null

  return (
    <div style={panelStyle}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid #27272a', height: 36,
        background: '#111113', flexShrink: 0, alignItems: 'stretch',
      }}>
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px',
            color: '#52525b', display: 'flex', alignItems: 'center', transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e4e4e7'}
          onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
        >
          <X size={13} />
        </button>

        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer', padding: '0 12px', fontSize: 12,
              color: tab === t ? '#f4f4f5' : '#71717a',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { if (tab !== t) e.currentTarget.style.color = '#e4e4e7' }}
            onMouseLeave={e => { if (tab !== t) e.currentTarget.style.color = '#71717a' }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        {tab === 'Headers'  && <HeadersTab r={request} />}
        {tab === 'Payload'  && <PayloadTab r={request} />}
        {tab === 'Preview'  && <PreviewTab r={request} />}
        {tab === 'Response' && <ResponseTab r={request} />}
        {tab === 'Timing'   && <TimingTab r={request} />}
        {tab === 'Cookies'  && <CookiesTab r={request} />}
      </div>
    </div>
  )
}

/* ---- shared atoms ---- */
function SectionHeader({ title }) {
  return (
    <div style={{
      padding: '5px 12px', background: '#111113', borderTop: '1px solid #27272a',
      borderBottom: '1px solid #27272a', fontSize: 10, fontWeight: 600,
      color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em',
      userSelect: 'none',
    }}>
      {title}
    </div>
  )
}

function KV({ k, v, vStyle }) {
  return (
    <div style={{
      display: 'flex', padding: '4px 12px', fontSize: 11,
      fontFamily: 'ui-monospace, Consolas, monospace',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ width: '35%', color: '#71717a', wordBreak: 'break-all', paddingRight: 8, flexShrink: 0 }}>{k}</span>
      <span style={{ flex: 1, color: '#e4e4e7', wordBreak: 'break-all', ...vStyle }}>{v}</span>
    </div>
  )
}

/* ---- tabs ---- */
function HeadersTab({ r }) {
  const statusColor = !r.status || r.status === 0 ? '#ef4444'
    : r.status < 300 ? '#10b981'
    : r.status < 400 ? '#f59e0b' : '#ef4444'

  return (
    <div>
      <SectionHeader title="General" />
      <KV k="Request URL" v={r.url} vStyle={{ color: '#93c5fd' }} />
      <KV k="Request Method" v={r.method} />
      <KV k="Status Code" v={statusLabel(r.status, r.statusText)} vStyle={{ color: statusColor }} />
      <KV k="Remote Address" v={`${r.host}:443`} />
      <KV k="Referrer Policy" v="strict-origin-when-cross-origin" />

      <SectionHeader title="Response Headers" />
      {Object.entries(r.responseHeaders).map(([k, v]) => <KV key={k} k={k} v={String(v)} />)}

      <SectionHeader title="Request Headers" />
      {Object.entries(r.requestHeaders).map(([k, v]) => <KV key={k} k={k} v={String(v)} />)}
    </div>
  )
}

function PayloadTab({ r }) {
  if (!r.payload) return <Empty text="This request has no payload." />
  return (
    <>
      <SectionHeader title="Request Payload" />
      <pre style={{ margin: 0, padding: '8px 12px', fontSize: 11, color: '#e4e4e7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'ui-monospace, Consolas, monospace' }}>
        {r.payload}
      </pre>
    </>
  )
}

function PreviewTab({ r }) {
  if (r.type === 'img') return (
    <div style={{ padding: 16, fontSize: 11, color: '#71717a', fontFamily: 'ui-monospace, Consolas, monospace' }}>
      [image preview unavailable in mock mode]<br />
      URL: <span style={{ color: '#93c5fd', wordBreak: 'break-all' }}>{r.url}</span>
    </div>
  )
  if (!r.response) return <Empty text="No preview available." />
  return (
    <pre style={{ margin: 0, padding: '8px 12px', fontSize: 11, color: '#e4e4e7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'ui-monospace, Consolas, monospace' }}>
      {r.response}
    </pre>
  )
}

function ResponseTab({ r }) {
  if (!r.response) return <Empty text="No response body." />
  return (
    <pre style={{ margin: 0, padding: '8px 12px', fontSize: 11, color: '#e4e4e7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'ui-monospace, Consolas, monospace' }}>
      {r.response}
    </pre>
  )
}

const TIMING_PHASES = [
  { key: 'queue',    label: 'Queueing',                  color: '#71717a' },
  { key: 'dns',      label: 'DNS Lookup',                color: '#0ea5e9' },
  { key: 'connect',  label: 'Initial connection',        color: '#f97316' },
  { key: 'ssl',      label: 'SSL',                       color: '#a855f7' },
  { key: 'ttfb',     label: 'Waiting for server (TTFB)', color: '#10b981' },
  { key: 'download', label: 'Content Download',          color: '#3b82f6' },
]

function TimingTab({ r }) {
  const total = Object.values(r.timing).reduce((a, b) => a + b, 0)
  return (
    <>
      <SectionHeader title="Resource Scheduling & Timing" />
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TIMING_PHASES.map(p => {
          const v = r.timing[p.key] || 0
          const pct = total ? (v / total) * 100 : 0
          return (
            <div key={p.key} style={{ fontSize: 11, fontFamily: 'ui-monospace, Consolas, monospace' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', marginBottom: 4 }}>
                <span>{p.label}</span>
                <span style={{ color: '#e4e4e7' }}>{formatTime(v)}</span>
              </div>
              <div style={{ height: 8, background: '#18181b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(1, pct)}%`, background: p.color, opacity: 0.85, borderRadius: 3 }} />
              </div>
            </div>
          )
        })}
        <div style={{ borderTop: '1px solid #27272a', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontFamily: 'ui-monospace, Consolas, monospace' }}>
          <Row label="Total" value={formatTime(total)} bold />
          <Row label="Transferred" value={formatSize(r.transferred)} />
          <Row label="Resource size" value={formatSize(r.size)} />
        </div>
      </div>
    </>
  )
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#71717a' }}>{label}</span>
      <span style={{ color: '#e4e4e7', fontWeight: bold ? 600 : 400 }}>{value}</span>
    </div>
  )
}

function CookiesTab({ r }) {
  if (!r.cookies || !r.cookies.length) return <Empty text="This request has no cookies." />
  const headers = ['Name', 'Value', 'Domain', 'Path', 'HttpOnly', 'Secure']
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'ui-monospace, Consolas, monospace' }}>
        <thead>
          <tr style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '5px 10px', textAlign: 'left', color: '#71717a', fontWeight: 600, fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.cookies.map((c, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #18181b' }}>
              <td style={{ padding: '4px 10px', color: '#e4e4e7' }}>{c.name}</td>
              <td style={{ padding: '4px 10px', color: '#a1a1aa', wordBreak: 'break-all' }}>{c.value}</td>
              <td style={{ padding: '4px 10px', color: '#a1a1aa' }}>{c.domain}</td>
              <td style={{ padding: '4px 10px', color: '#a1a1aa' }}>{c.path}</td>
              <td style={{ padding: '4px 10px', color: c.httpOnly ? '#10b981' : '#52525b' }}>{c.httpOnly ? '✓' : ''}</td>
              <td style={{ padding: '4px 10px', color: c.secure ? '#10b981' : '#52525b' }}>{c.secure ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Empty({ text }) {
  return (
    <div style={{ padding: 24, fontSize: 11, color: '#52525b', fontFamily: 'ui-monospace, Consolas, monospace' }}>
      {text}
    </div>
  )
}
