import { useEffect, useState } from 'react'
import { Circle, Ban, Globe, Filter, Search, Download, Upload, Settings2 } from 'lucide-react'

export default function Toolbar({
  recording, onToggleRecord, onClear, onLaunchChrome,
  search, onSearch,
  onExport, onImport, onShowSettings,
  filterPanelOpen, onToggleFilterPanel,
  searchInputRef,
}) {
  const [showChromeTip, setShowChromeTip] = useState(true)

  useEffect(() => {
    const timerId = setTimeout(() => setShowChromeTip(false), 5000)
    return () => clearTimeout(timerId)
  }, [])

  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center', padding: '0 8px',
      borderBottom: '1px solid #27272a', gap: 4, flexShrink: 0,
      background: '#09090b', userSelect: 'none',
    }}>
      <IconBtn
        onClick={onToggleRecord}
        title={recording ? 'Stop recording (Ctrl+R)' : 'Record network log (Ctrl+R)'}
        style={{ color: recording ? '#ef4444' : '#71717a' }}
      >
        <Circle size={13} fill={recording ? 'currentColor' : 'none'} />
      </IconBtn>

      <IconBtn onClick={onClear} title="Clear (Ctrl+L)">
        <Ban size={13} />
      </IconBtn>

      <div style={{ position: 'relative' }}>
        <IconBtn
          onClick={onLaunchChrome}
          title="Open Chrome through Network Shark"
          style={showChromeTip ? { color: '#60a5fa', background: '#1e293b' } : undefined}
        >
          <Globe size={13} />
        </IconBtn>
        {showChromeTip && (
          <div style={{
            position: 'absolute',
            top: 36,
            left: -6,
            width: 260,
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #2563eb',
            background: '#0f172a',
            color: '#dbeafe',
            fontSize: 11,
            lineHeight: 1.35,
            zIndex: 30,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }}>
            Launch Chrome from here so proxy flags apply and requests are captured reliably.
          </div>
        )}
      </div>

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
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Filter (Ctrl+F)"
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
