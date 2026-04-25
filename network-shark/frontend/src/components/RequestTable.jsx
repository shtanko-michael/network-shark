import { useMemo, useRef, useEffect, useState } from 'react'
import Waterfall from './Waterfall'
import { formatSize, formatTime, statusClass, statusLabel } from '../lib/format'

const TYPE_ICON = {
  fetch: '{ }', xhr: '{ }', doc: '≡', css: '#', js: 'JS',
  font: 'F', img: '▭', media: '▶', manifest: '≡', socket: '↔', wasm: 'W', other: '•',
}

const COL_WIDTHS = ['28%', '9%', '7%', '8%', '13%', '8%', '8%', '19%']
const COL_LABELS = ['Name', 'Status', 'Method', 'Type', 'Initiator', 'Size', 'Time', 'Waterfall']
const METHOD_COLOR = {
  GET: '#22c55e',
  POST: '#3b82f6',
  PUT: '#eab308',
  DELETE: '#ef4444',
}

const cellStyle = (i) => ({
  padding: '3px 6px', fontSize: 11, whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0,
  borderRight: i < COL_LABELS.length - 1 ? '1px solid #1c1c1f' : 'none',
  boxSizing: 'border-box', width: COL_WIDTHS[i],
})

export default function RequestTable({ requests, selectedId, onSelect, autoScroll }) {
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  const { tStart, tEnd } = useMemo(() => {
    if (!requests.length) return { tStart: 0, tEnd: 1 }
    const start = Math.min(...requests.map(r => r.startedAt))
    const end = Math.max(...requests.map(r => r.finishedAt))
    return { tStart: start, tEnd: end + 1 }
  }, [requests])

  useEffect(() => {
    if (autoScroll && stickToBottom) {
      bottomRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [requests.length, autoScroll, stickToBottom])

  const handleScroll = () => {
    const node = scrollerRef.current
    if (!node) return
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    // Treat near-bottom as bottom to avoid jitter.
    setStickToBottom(distanceToBottom <= 20)
  }

  if (!requests.length) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#52525b', fontSize: 13, userSelect: 'none', flexDirection: 'column', gap: 8,
      }}>
        <span style={{ color: '#a1a1aa' }}>Recording network activity…</span>
        <span style={{ fontSize: 11 }}>Requests will appear here as they happen.</span>
      </div>
    )
  }

  return (
    <div ref={scrollerRef} onScroll={handleScroll} style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#09090b' }}>
          <tr style={{ borderBottom: '1px solid #27272a' }}>
            {COL_LABELS.map((label, i) => (
              <th key={label} style={{
                ...cellStyle(i),
                padding: '5px 6px', fontSize: 10, fontWeight: 600,
                color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em',
                textAlign: 'left', userSelect: 'none',
              }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
          {requests.map(r => {
            const selected = r.id === selectedId
            const isFailed = !r.status || r.status === 0
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id === selectedId ? null : r.id)}
                style={{
                  borderBottom: '1px solid #18181b',
                  background: selected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Name */}
                <td style={{ ...cellStyle(0), color: isFailed ? '#f87171' : '#e4e4e7' }}>
                  <span style={{ color: '#52525b', marginRight: 5, fontSize: 10 }}>
                    {TYPE_ICON[r.type] || '•'}
                  </span>
                  {r.name}
                </td>
                {/* Status */}
                <td style={{
                  ...cellStyle(1),
                  color: !r.status || r.status === 0 ? '#ef4444'
                    : r.status < 300 ? '#10b981'
                    : r.status < 400 ? '#f59e0b' : '#ef4444',
                  textDecoration: r.statusText ? 'line-through' : 'none',
                }}>
                  {statusLabel(r.status, r.statusText)}
                </td>
                {/* Method */}
                <td style={{ ...cellStyle(2), color: METHOD_COLOR[r.method] || '#a1a1aa' }}>{r.method}</td>
                {/* Type */}
                <td style={{ ...cellStyle(3), color: '#71717a' }}>{r.type}</td>
                {/* Initiator */}
                <td style={{ ...cellStyle(4), color: '#60a5fa', textDecoration: 'underline dotted' }}>{r.initiator}</td>
                {/* Size */}
                <td style={{ ...cellStyle(5), color: '#d4d4d8' }}>{formatSize(r.transferred)}</td>
                {/* Time */}
                <td style={{ ...cellStyle(6), color: '#d4d4d8' }}>{formatTime(r.duration)}</td>
                {/* Waterfall */}
                <td style={{ ...cellStyle(7), padding: '3px 6px', verticalAlign: 'middle' }}>
                  <Waterfall request={r} timelineStart={tStart} timelineEnd={tEnd} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div ref={bottomRef} />
    </div>
  )
}
