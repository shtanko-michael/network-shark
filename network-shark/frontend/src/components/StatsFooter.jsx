import { formatSize, formatTime } from '../lib/format'

const LEGEND = [
  { color: '#71717a', label: 'Queue' },
  { color: '#0ea5e9', label: 'DNS' },
  { color: '#f97316', label: 'Connect' },
  { color: '#a855f7', label: 'SSL' },
  { color: '#10b981', label: 'TTFB' },
  { color: '#3b82f6', label: 'Download' },
]

export default function StatsFooter({ requests, filteredCount }) {
  const totalTransferred = requests.reduce((a, r) => a + (r.transferred || 0), 0)
  const totalResources = requests.reduce((a, r) => a + (r.size || 0), 0)
  const finishTime = requests.length
    ? Math.max(...requests.map(r => r.finishedAt)) - Math.min(...requests.map(r => r.startedAt))
    : 0
  const failed = requests.filter(r => !r.status || r.status >= 400).length

  return (
    <div style={{
      height: 28, borderTop: '1px solid #27272a', display: 'flex', alignItems: 'center',
      padding: '0 12px', fontSize: 11, color: '#71717a', gap: 20, flexShrink: 0,
      background: '#09090b', fontFamily: 'ui-monospace, Consolas, monospace',
    }}>
      <span>
        <span style={{ color: '#e4e4e7' }}>{requests.length}</span> requests
        {filteredCount !== requests.length && (
          <span style={{ color: '#52525b' }}> ({filteredCount} shown)</span>
        )}
      </span>
      <span><span style={{ color: '#e4e4e7' }}>{formatSize(totalTransferred)}</span> transferred</span>
      <span><span style={{ color: '#e4e4e7' }}>{formatSize(totalResources)}</span> resources</span>
      <span>Finish: <span style={{ color: '#e4e4e7' }}>{formatTime(finishTime)}</span></span>
      {failed > 0 && <span style={{ color: '#f87171' }}>{failed} failed</span>}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 7, borderRadius: 2, background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
