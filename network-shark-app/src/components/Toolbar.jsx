import { Circle, Ban, Filter, Search, Download, Upload, Settings2 } from 'lucide-react'

export default function Toolbar({
  recording, onToggleRecord, onClear,
  preserveLog, onTogglePreserve,
  disableCache, onToggleCache,
  search, onSearch,
  onExport, onImport, onShowSettings,
  filterPanelOpen, onToggleFilterPanel,
}) {
  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center', padding: '0 8px',
      borderBottom: '1px solid #27272a', gap: 4, flexShrink: 0,
      background: '#09090b', userSelect: 'none',
    }}>
      <IconBtn
        onClick={onToggleRecord}
        title={recording ? 'Stop recording (⌘E)' : 'Record network log (⌘E)'}
        style={{ color: recording ? '#ef4444' : '#71717a' }}
      >
        <Circle size={13} fill={recording ? 'currentColor' : 'none'} />
      </IconBtn>

      <IconBtn onClick={onClear} title="Clear (⌘L)">
        <Ban size={13} />
      </IconBtn>

      <IconBtn
        onClick={onToggleFilterPanel}
        title="Toggle filter bar"
        style={{ color: filterPanelOpen ? '#60a5fa' : '#71717a', background: filterPanelOpen ? '#1e293b' : undefined }}
      >
        <Filter size={13} />
      </IconBtn>

      <div style={{ position: 'relative' }}>
        <Search size={11} style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          color: '#52525b', pointerEvents: 'none',
        }} />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Filter"
          style={{
            background: '#18181b', border: '1px solid #27272a', borderRadius: 4,
            paddingLeft: 28, paddingRight: 8, height: 26, width: 220,
            fontSize: 12, color: '#f4f4f5', outline: 'none',
            fontFamily: 'inherit',
          }}
          onFocus={e => e.target.style.borderColor = '#3b82f6'}
          onBlur={e => e.target.style.borderColor = '#27272a'}
        />
      </div>

      <div style={{ width: 1, height: 20, background: '#27272a', margin: '0 4px' }} />

      <CheckLabel checked={preserveLog} onChange={onTogglePreserve}>Preserve log</CheckLabel>
      <CheckLabel checked={disableCache} onChange={onToggleCache}>Disable cache</CheckLabel>

      <div style={{ flex: 1 }} />

      <IconBtn onClick={onImport} title="Import HAR"><Upload size={13} /></IconBtn>
      <IconBtn onClick={onExport} title="Export HAR"><Download size={13} /></IconBtn>
      <IconBtn onClick={onShowSettings} title="Settings"><Settings2 size={13} /></IconBtn>
    </div>
  )
}

function IconBtn({ onClick, title, style, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: 6, borderRadius: 4, color: '#a1a1aa',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s',
        ...style,
      }}
      onMouseEnter={e => { if (!style?.background) e.currentTarget.style.background = '#27272a' }}
      onMouseLeave={e => { if (!style?.background) e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

function CheckLabel({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#d4d4d8', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
      {children}
    </label>
  )
}
