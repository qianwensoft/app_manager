import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import AlignToolbar from './AlignToolbar'

const MAIN_CANVAS_ID = 100001

interface Props {
  layerCollapsed?: boolean
  onToggleLayer?: () => void
}

const PlusIcon = () => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const CloseIcon = () => (
  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

function TabLabel({ id, name, active }: { id: number; name: string; active: boolean }) {
  const store = useEditorStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const canRename = id !== MAIN_CANVAS_ID

  // Sync draft when name changes externally
  useEffect(() => { setDraft(name) }, [name])

  const startEdit = () => {
    if (!canRename) return
    setDraft(name)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) {
      store.updateCanvas(id, { name: trimmed })
    }
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setEditing(false); setDraft(name) }
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: Math.max(60, draft.length * 8 + 16),
          height: 20,
          padding: '0 4px',
          fontSize: 12,
          color: 'var(--text-primary)',
          background: 'var(--bg-overlay)',
          border: '1px solid var(--accent)',
          borderRadius: 3,
          outline: 'none',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); startEdit() }}
      title={canRename ? '双击重命名' : undefined}
      style={{ cursor: canRename && active ? 'text' : undefined }}
    >
      {name}
    </span>
  )
}

export default function CanvasTabs({ layerCollapsed = false, onToggleLayer }: Props) {
  const store = useEditorStore()
  const { project } = store
  const activeId = project.activeCanvasId
  const canvases = Object.values(project.canvases ?? {})

  return (
    <div className="tab-bar">
      {canvases.map((c) => (
        <div
          key={c.id}
          onClick={() => store.switchCanvas(c.id)}
          className={`tab-item${activeId === c.id ? ' active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5}>
            <rect x={3} y={3} width={18} height={18} rx={2} />
          </svg>
          <TabLabel id={c.id} name={c.name} active={activeId === c.id} />
          {canvases.length > 1 && activeId === c.id && (
            <button
              className="icon-btn"
              style={{ width: 16, height: 16, borderRadius: 3, marginLeft: 2 }}
              onClick={(e) => { e.stopPropagation(); /* future: remove canvas */ }}
              title="关闭"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={() => {
          const id = Date.now()
          store.addCanvas({
            id,
            name: `画布 ${canvases.length + 1}`,
            width: 1920,
            height: 1080,
            background: '#1a1a2e',
            backgroundColor: '#1a1a2e',
            showGrid: true,
            snapToGrid: true,
            gridSize: 10,
            gridColor: '#2a2a4a',
            showRuler: true,
            elements: [],
            zoom: 1,
            viewport: { x: 0, y: 0, width: 1920, height: 1080 },
          })
          store.switchCanvas(id)
        }}
        className="icon-btn"
        title="新建画布"
        style={{
          marginLeft: 4,
          width: 24, height: 24,
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border-strong)',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <PlusIcon />
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Align toolbar — shows when 2+ elements selected */}
      <AlignToolbar />

      {/* Layer panel toggle */}
      <button
        onClick={onToggleLayer}
        title={layerCollapsed ? '展开图层' : '收起图层'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 24, padding: '0 8px',
          border: `1px solid ${layerCollapsed ? 'var(--border-accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          background: layerCollapsed ? 'var(--accent-muted)' : 'transparent',
          color: layerCollapsed ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 500, cursor: 'pointer',
          flexShrink: 0, marginRight: 4,
          transition: 'all var(--duration-fast)',
        }}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        图层
      </button>
    </div>
  )
}
