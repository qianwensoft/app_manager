import { useEditorStore } from '@/store/editorStore'
import { pushHistory } from '@/hooks/useHistory'
import type { AlignType } from '@/types'

const AlignIcon = ({ d }: { d: string }) => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const ALIGN_BTNS: { align: AlignType; title: string; d: string }[] = [
  { align: 'left',   title: '左对齐',   d: 'M3 5v14M8 8h11M8 16h8' },
  { align: 'center', title: '水平居中', d: 'M12 3v18M7 8h10M9 16h6' },
  { align: 'right',  title: '右对齐',   d: 'M21 5v14M3 8h13M5 16h11' },
  { align: 'top',    title: '顶对齐',   d: 'M5 3h14M8 8v11M16 8v8' },
  { align: 'middle', title: '垂直居中', d: 'M3 12h18M8 7v10M16 9v6' },
  { align: 'bottom', title: '底对齐',   d: 'M5 21h14M8 3v13M16 5v11' },
]

const DIST_BTNS: { axis: 'x' | 'y'; title: string; d: string }[] = [
  { axis: 'x', title: '水平分布', d: 'M3 5v14M21 5v14M8 12h8' },
  { axis: 'y', title: '垂直分布', d: 'M5 3h14M5 21h14M12 8v8' },
]

const Tip = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ position: 'relative', display: 'inline-flex' }}
    title={title}>
    {children}
  </div>
)

export default function AlignToolbar() {
  const store = useEditorStore()
  const { selectedIds } = store
  const show = selectedIds.length >= 2

  if (!show) return null

  const handleAlign = (align: AlignType) => {
    pushHistory(store.project)
    store.alignElements(selectedIds, align)
  }

  const handleDist = (axis: 'x' | 'y') => {
    if (selectedIds.length < 3) return
    pushHistory(store.project)
    store.distributeElements(selectedIds, axis)
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all var(--duration-fast)',
    padding: 0,
    flexShrink: 0,
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '0 6px',
      borderLeft: '1px solid var(--border)',
      marginLeft: 2,
      flexShrink: 0,
    }}>
      {/* Selected count badge */}
      <span style={{
        fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)',
        color: 'var(--accent)', marginRight: 4,
        background: 'var(--accent-muted)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-sm)',
        padding: '1px 4px',
      }}>
        {selectedIds.length}
      </span>

      {/* Align buttons */}
      {ALIGN_BTNS.map(({ align, title, d }) => (
        <Tip key={align} title={title}>
          <button
            style={btnStyle}
            onClick={() => handleAlign(align)}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.background = 'var(--bg-overlay)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <AlignIcon d={d} />
          </button>
        </Tip>
      ))}

      {/* Separator */}
      <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />

      {/* Distribute buttons — only when 3+ selected */}
      {DIST_BTNS.map(({ axis, title, d }) => (
        <Tip key={axis} title={`${title}${selectedIds.length < 3 ? '（需选 3+ 个元素）' : ''}`}>
          <button
            style={{ ...btnStyle, opacity: selectedIds.length < 3 ? 0.35 : 1 }}
            onClick={() => handleDist(axis)}
            disabled={selectedIds.length < 3}
            onMouseEnter={(e) => {
              if (selectedIds.length < 3) return
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.background = 'var(--bg-overlay)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <AlignIcon d={d} />
          </button>
        </Tip>
      ))}
    </div>
  )
}
