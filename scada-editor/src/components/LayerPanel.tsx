import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { pushHistory } from '@/hooks/useHistory'

interface Props {
  collapsed?: boolean
  onToggle?: () => void
}

interface CtxMenu {
  x: number
  y: number
  id: string
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
  'dynamic-pipe': '#94a3b8',
  'echarts-bar': '#34d399',
  'echarts-line': '#34d399',
  'echarts-pie': '#34d399',
  'echarts-gauge': '#34d399',
  'echarts-scatter': '#34d399',
  'echarts-heatmap': '#34d399',
  'echarts-trend': '#34d399',
  'image-bg': '#f472b6',
  'image-widget': '#fb923c',
  'image-decoration': '#e879f9',
  'image-border-box': '#2dd4bf',
  'layout-carousel': '#38bdf8',
  'layout-modal': '#f97316',
  table: '#a3e635',
}

const typeShort: Record<string, string> = {
  rect: 'REC', circle: 'CIR', ellipse: 'ELP', line: 'LIN',
  text: 'TXT', button: 'BTN', image: 'IMG', group: 'GRP',
  'dynamic-pipe': 'PPE',
  'echarts-bar': 'BAR', 'echarts-line': 'LCH', 'echarts-pie': 'PIE', 'echarts-gauge': 'GAU',
  'echarts-scatter': 'SCT', 'echarts-heatmap': 'HMP', 'echarts-trend': 'TRD',
  'image-bg': 'BG', 'image-widget': 'WGT', 'image-decoration': 'DEC', 'image-border-box': 'BOX',
  'layout-carousel': 'CRS', 'layout-modal': 'MDL', table: 'TBL',
}

const EyeOpen = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx={12} cy={12} r={3} />
  </svg>
)
const EyeOff = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
  </svg>
)
const LockOpen = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x={3} y={11} width={18} height={11} rx={2} /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
)
const LockClosed = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <rect x={3} y={11} width={18} height={11} rx={2} /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export default function LayerPanel() {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const { selectedIds, layerCollapsed } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [modalSectionOpen, setModalSectionOpen] = useState(true)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [!!ctxMenu])

  if (!canvas || layerCollapsed) return null

  const sorted = [...canvas.elements].sort((a, b) => b.zIndex - a.zIndex)

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) store.renameElement(editingId, editName.trim())
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
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            store.selectElements([el.id])
            setCtxMenu({ x: e.clientX, y: e.clientY, id: el.id })
          }}
          className={`layer-row${isSelected ? ' active' : ''}${el.locked ? ' locked' : ''}`}
          style={{ paddingLeft: 6 + indent * 12 }}
        >
          {isGroup && (
            <button className="icon-btn" style={{ width: 14, height: 14, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); toggleGroup(el.id) }}>
              <ChevronIcon open={isExpanded} />
            </button>
          )}
          <span style={{
            fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
            color: el.visible ? dotColor : 'var(--text-muted)',
            background: el.visible ? `${dotColor}18` : 'var(--bg-overlay)',
            border: `1px solid ${el.visible ? `${dotColor}40` : 'transparent'}`,
            borderRadius: 3, padding: '1px 3px', flexShrink: 0, letterSpacing: '0.04em',
          }}>
            {typeShort[el.type] ?? el.type.slice(0, 3).toUpperCase()}
          </span>

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
                background: 'var(--bg-base)', border: '1px solid var(--accent)',
                color: 'var(--text-primary)', borderRadius: 3, padding: '0 4px',
                outline: 'none', fontFamily: 'inherit',
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
                <span style={{ color: 'var(--text-muted)', fontSize: 9, marginLeft: 4 }}>({el.children.length})</span>
              )}
            </span>
          )}

          <button className="icon-btn"
            style={{ width: 20, height: 20, color: el.visible ? 'var(--text-muted)' : 'var(--border-strong)' }}
            onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { visible: !el.visible }) }}
            title={el.visible ? '隐藏' : '显示'}>
            {el.visible ? <EyeOpen /> : <EyeOff />}
          </button>
          <button className="icon-btn"
            style={{ width: 20, height: 20, color: el.locked ? 'var(--warning)' : 'var(--text-muted)' }}
            onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { locked: !el.locked }) }}
            title={el.locked ? '解锁' : '锁定'}>
            {el.locked ? <LockClosed /> : <LockOpen />}
          </button>
          {isSelected && !isGroup && (
            <>
              <button className="icon-btn" style={{ width: 18, height: 18 }}
                onClick={(e) => { e.stopPropagation(); pushHistory(store.project); store.bringForward(el.id) }}
                title="上移一层">
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <button className="icon-btn" style={{ width: 18, height: 18 }}
                onClick={(e) => { e.stopPropagation(); pushHistory(store.project); store.sendBackward(el.id) }}
                title="下移一层">
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </>
          )}
        </div>
        {isGroup && isExpanded && children.map((child) => renderRow(child, indent + 1))}
      </div>
    )
  }

  const groupChildIds = new Set(
    canvas.elements.filter((e) => e.type === 'group' && e.children).flatMap((e) => e.children!)
  )

  // Separate modals from regular elements
  const modalElements = sorted.filter((e) => e.type === 'layout-modal')
  const topLevel = sorted.filter((e) => !groupChildIds.has(e.id) && e.type !== 'layout-modal')

  // Find which buttons/elements have open-modal events pointing to each modal
  const modalTriggers = (modalId: string) =>
    canvas.elements.filter((e) =>
      e.events?.some((ev) => ev.action === 'open-modal' && ev.target === modalId)
    )

  return (
    <div style={{
      width: 'var(--layer-w)',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
    }}>
      <div className="panel-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>图层</span>
        <span style={{ fontWeight: 400, letterSpacing: 0, color: 'var(--text-muted)', fontSize: 10 }}>
          {canvas.elements.length}
        </span>
      </div>

      <div className="scada-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Modal section ── */}
        {modalElements.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setModalSectionOpen((v) => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px', background: 'rgba(249,115,22,0.08)',
                border: 'none', cursor: 'pointer',
                color: '#f97316', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={3} y={3} width={18} height={18} rx={2} />
                  <path d="M9 3v18M3 9h6" />
                </svg>
                弹窗层 ({modalElements.length})
              </span>
              <ChevronIcon open={modalSectionOpen} />
            </button>

            {modalSectionOpen && modalElements.map((modal) => {
              const triggers = modalTriggers(modal.id)
              const isSelected = selectedIds.includes(modal.id)
              return (
                <div key={modal.id} style={{ borderBottom: '1px solid var(--border-strong)' }}>
                  {/* Modal row */}
                  <div
                    onClick={() => store.selectElements([modal.id])}
                    className={`layer-row${isSelected ? ' active' : ''}`}
                    style={{ paddingLeft: 8, background: isSelected ? undefined : 'rgba(249,115,22,0.04)' }}
                  >
                    <span style={{
                      fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: '#f97316', background: 'rgba(249,115,22,0.15)',
                      border: '1px solid rgba(249,115,22,0.3)',
                      borderRadius: 3, padding: '1px 3px', flexShrink: 0,
                    }}>MDL</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {modal.layoutModalTitle || modal.name || '弹窗'}
                    </span>
                    <button className="icon-btn"
                      style={{ width: 20, height: 20, color: modal.visible ? 'var(--text-muted)' : 'var(--border-strong)' }}
                      onClick={(e) => { e.stopPropagation(); store.updateElement(modal.id, { visible: !modal.visible }) }}>
                      {modal.visible ? <EyeOpen /> : <EyeOff />}
                    </button>
                  </div>

                  {/* Trigger buttons sub-list */}
                  {triggers.length > 0 && (
                    <div style={{ paddingLeft: 16, paddingBottom: 3 }}>
                      {triggers.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => store.selectElements([t.id])}
                          className={`layer-row${selectedIds.includes(t.id) ? ' active' : ''}`}
                          style={{ paddingLeft: 4, fontSize: 10 }}
                        >
                          <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth={2.5} style={{ flexShrink: 0 }}>
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          <span style={{
                            fontSize: 8, fontFamily: 'var(--font-mono)',
                            color: '#fbbf24', background: 'rgba(251,191,36,0.12)',
                            border: '1px solid rgba(251,191,36,0.25)',
                            borderRadius: 3, padding: '1px 3px', flexShrink: 0,
                          }}>
                            {typeShort[t.type] ?? t.type.slice(0, 3).toUpperCase()}
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                            {t.name || t.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {triggers.length === 0 && (
                    <div style={{ paddingLeft: 20, paddingBottom: 4, fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      未绑定触发按钮
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Regular elements ── */}
        {topLevel.length === 0 && modalElements.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7 }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}
              style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }}>
              <rect x={2} y={3} width={20} height={14} rx={2} /><path d="M8 21h8M12 17v4" />
            </svg>
            暂无元素<br />从左侧组件库添加
          </div>
        )}
        {topLevel.map((el) => renderRow(el))}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (() => {
        const el = canvas.elements.find((e) => e.id === ctxMenu.id)
        if (!el) return null
        const items: { label: string; action: () => void; danger?: boolean }[] = [
          { label: '置顶', action: () => { pushHistory(store.project); store.bringToFront(el.id) } },
          { label: '置底', action: () => { pushHistory(store.project); store.sendToBack(el.id) } },
          { label: '上移一层', action: () => { pushHistory(store.project); store.bringForward(el.id) } },
          { label: '下移一层', action: () => { pushHistory(store.project); store.sendBackward(el.id) } },
          { label: '删除', action: () => { pushHistory(store.project); store.deleteElements([el.id]); store.clearSelection() }, danger: true },
        ]
        return (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
              zIndex: 99999,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              padding: '3px 0', minWidth: 110,
            }}
          >
            {items.map(({ label, action, danger }) => (
              <button
                key={label}
                onMouseDown={(e) => { e.stopPropagation(); action(); setCtxMenu(null) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 12px', fontSize: 11, fontWeight: 500,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: danger ? 'var(--danger)' : 'var(--text-primary)',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
              >
                {label}
              </button>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
