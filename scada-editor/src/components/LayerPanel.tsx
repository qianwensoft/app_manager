import { useState, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { pushHistory } from '@/hooks/useHistory'

interface Props {
  collapsed?: boolean
  onToggle?: () => void
}

const typeColor: Record<string, string> = {
  rect: '#4a9eff',
  circle: '#a78bfa',
  ellipse: '#a78bfa',
  line: '#64748b',
  text: '#94a3b8',
  button: '#fbbf24',
  image: '#f472b6',
  group: '#4ade80',
  'dynamic-valve': '#4ade80',
  'dynamic-pump': '#c084fc',
  'dynamic-tank': '#38bdf8',
  'dynamic-pipe': '#94a3b8',
  'echarts-bar': '#34d399',
  'echarts-line': '#34d399',
  'echarts-pie': '#34d399',
  'echarts-gauge': '#34d399',
  'echarts-scatter': '#34d399',
  'echarts-heatmap': '#34d399',
  'image-bg': '#f472b6',
  'image-widget': '#fb923c',
  'image-decoration': '#e879f9',
  'image-border-box': '#2dd4bf',
}

const typeShort: Record<string, string> = {
  rect: 'REC', circle: 'CIR', ellipse: 'ELP', line: 'LIN',
  text: 'TXT', button: 'BTN', image: 'IMG', group: 'GRP',
  'dynamic-valve': 'VLV', 'dynamic-pump': 'PMP', 'dynamic-tank': 'TNK', 'dynamic-pipe': 'PPE',
  'echarts-bar': 'BAR', 'echarts-line': 'LCH', 'echarts-pie': 'PIE', 'echarts-gauge': 'GAU',
  'echarts-scatter': 'SCT', 'echarts-heatmap': 'HMP',
  'image-bg': 'BG', 'image-widget': 'WGT', 'image-decoration': 'DEC', 'image-border-box': 'BOX',
}

const EyeOpen = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
    <circle cx={12} cy={12} r={3} />
  </svg>
)

const EyeOff = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
  </svg>
)

const LockOpen = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x={3} y={11} width={18} height={11} rx={2} />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
)

const LockClosed = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x={3} y={11} width={18} height={11} rx={2} />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export default function LayerPanel({ collapsed = false }: Props) {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const { selectedIds } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  if (!canvas || collapsed) return null

  const sorted = [...canvas.elements].sort((a, b) => b.zIndex - a.zIndex)

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      store.renameElement(editingId, editName.trim())
    }
    setEditingId(null)
  }

  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }))

  const renderRow = (el: (typeof sorted)[0], indent = 0) => {
    const isSelected = selectedIds.includes(el.id)
    const dotColor = typeColor[el.type] ?? '#64748b'
    const isGroup = el.type === 'group'
    const isExpanded = expandedGroups[el.id] ?? true
    const children = isGroup && el.children
      ? canvas.elements.filter((c) => el.children!.includes(c.id))
      : []

    return (
      <div key={el.id}>
        <div
          onClick={() => store.selectElements([el.id])}
          className={`layer-row${isSelected ? ' active' : ''}${el.locked ? ' locked' : ''}`}
          style={{ paddingLeft: 6 + indent * 12 }}
        >
          {/* Group expand toggle */}
          {isGroup && (
            <button
              className="icon-btn"
              style={{ width: 14, height: 14, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); toggleGroup(el.id) }}
            >
              <ChevronIcon open={isExpanded} />
            </button>
          )}

          {/* Type badge */}
          <span style={{
            fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
            color: el.visible ? dotColor : 'var(--text-muted)',
            background: el.visible ? `${dotColor}18` : 'var(--bg-overlay)',
            border: `1px solid ${el.visible ? `${dotColor}40` : 'transparent'}`,
            borderRadius: 3,
            padding: '1px 3px',
            flexShrink: 0,
            letterSpacing: '0.04em',
          }}>
            {typeShort[el.type] ?? el.type.slice(0, 3).toUpperCase()}
          </span>

          {/* Name — double click to edit */}
          {editingId === el.id ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditingId(null)
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1, height: 20, fontSize: 11,
                background: 'var(--bg-base)',
                border: '1px solid var(--accent)',
                color: 'var(--text-primary)',
                borderRadius: 3, padding: '0 4px', outline: 'none',
                fontFamily: 'inherit',
              }}
              autoFocus
            />
          ) : (
            <span
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}
              onDoubleClick={(e) => { e.stopPropagation(); startEdit(el.id, el.name || el.type) }}
              title="双击重命名"
            >
              {el.name || el.type}
              {isGroup && el.children && (
                <span style={{ color: 'var(--text-muted)', fontSize: 9, marginLeft: 4 }}>
                  ({el.children.length})
                </span>
              )}
            </span>
          )}

          {/* Visibility */}
          <button
            className="icon-btn"
            style={{ width: 20, height: 20, color: el.visible ? 'var(--text-muted)' : 'var(--border-strong)' }}
            onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { visible: !el.visible }) }}
            title={el.visible ? '隐藏' : '显示'}
          >
            {el.visible ? <EyeOpen /> : <EyeOff />}
          </button>

          {/* Lock */}
          <button
            className="icon-btn"
            style={{ width: 20, height: 20, color: el.locked ? 'var(--warning)' : 'var(--text-muted)' }}
            onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { locked: !el.locked }) }}
            title={el.locked ? '解锁' : '锁定'}
          >
            {el.locked ? <LockClosed /> : <LockOpen />}
          </button>

          {/* Z-order buttons */}
          {isSelected && !isGroup && (
            <>
              <button
                className="icon-btn"
                style={{ width: 18, height: 18 }}
                onClick={(e) => { e.stopPropagation(); pushHistory(store.project); store.bringForward(el.id) }}
                title="上移一层"
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <button
                className="icon-btn"
                style={{ width: 18, height: 18 }}
                onClick={(e) => { e.stopPropagation(); pushHistory(store.project); store.sendBackward(el.id) }}
                title="下移一层"
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Render children if group is expanded */}
        {isGroup && isExpanded && children.map((child) => renderRow(child, indent + 1))}
      </div>
    )
  }

  // top-level elements (not children of any group)
  const groupChildIds = new Set(
    canvas.elements
      .filter((e) => e.type === 'group' && e.children)
      .flatMap((e) => e.children!)
  )
  const topLevel = sorted.filter((e) => !groupChildIds.has(e.id))

  return (
    <div style={{
      width: 'var(--layer-w)',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <div className="panel-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>图层</span>
        <span style={{ fontWeight: 400, letterSpacing: 0, color: 'var(--text-muted)', fontSize: 10 }}>
          {canvas.elements.length}
        </span>
      </div>

      <div className="scada-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {topLevel.length === 0 && (
          <div style={{
            padding: '24px 12px', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7,
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}
              style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }}>
              <rect x={2} y={3} width={20} height={14} rx={2} />
              <path d="M8 21h8M12 17v4" />
            </svg>
            暂无元素
            <br />从左侧组件库添加
          </div>
        )}
        {topLevel.map((el) => renderRow(el))}
      </div>
    </div>
  )
}
