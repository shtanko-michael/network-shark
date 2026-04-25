const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'fetch+xhr', label: 'Fetch/XHR' },
  { key: 'doc', label: 'Doc' },
  { key: 'css', label: 'CSS' },
  { key: 'js', label: 'JS' },
  { key: 'font', label: 'Font' },
  { key: 'img', label: 'Img' },
  { key: 'media', label: 'Media' },
  { key: 'manifest', label: 'Manifest' },
  { key: 'socket', label: 'Socket' },
  { key: 'wasm', label: 'Wasm' },
  { key: 'other', label: 'Other' },
]

export default function FilterBar({ active, onChange, invert, onToggleInvert }) {
  return (
    <div style={{
      height: 36, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4,
      borderBottom: '1px solid #27272a', background: '#09090b', flexShrink: 0,
      overflowX: 'auto', userSelect: 'none',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#d4d4d8', cursor: 'pointer', marginRight: 8, whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={invert} onChange={onToggleInvert} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
        Invert
      </label>

      <div style={{ width: 1, height: 18, background: '#27272a', marginRight: 4 }} />

      {FILTERS.map(f => {
        const isActive = active === f.key
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            style={{
              padding: '3px 10px', borderRadius: 4, border: isActive ? '1px solid #3f3f46' : '1px solid transparent',
              background: isActive ? '#27272a' : 'none',
              color: isActive ? '#f4f4f5' : '#71717a',
              fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = '#e4e4e7'; e.currentTarget.style.background = '#18181b' } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.background = 'none' } }}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
