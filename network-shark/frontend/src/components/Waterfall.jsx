const PHASES = [
  { key: 'queue',    color: '#71717a' },
  { key: 'dns',      color: '#0ea5e9' },
  { key: 'connect',  color: '#f97316' },
  { key: 'ssl',      color: '#a855f7' },
  { key: 'ttfb',     color: '#10b981' },
  { key: 'download', color: '#3b82f6' },
]

export default function Waterfall({ request, timelineStart, timelineEnd }) {
  const total = Math.max(1, timelineEnd - timelineStart)
  let cursor = request.startedAt

  return (
    <div style={{ position: 'relative', height: '10px', width: '100%' }}>
      {PHASES.map((p) => {
        const dur = request.timing[p.key] || 0
        if (dur <= 0) return null
        const left = ((cursor - timelineStart) / total) * 100
        const width = (dur / total) * 100
        cursor += dur
        return (
          <div
            key={p.key}
            title={`${p.key}: ${dur.toFixed(1)}ms`}
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              height: '6px',
              borderRadius: '2px',
              backgroundColor: p.color,
              left: `${left}%`,
              width: `${Math.max(0.3, width)}%`,
              opacity: 0.9,
            }}
          />
        )
      })}
    </div>
  )
}
