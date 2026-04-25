import { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useSaveCanvas } from '@/hooks/useScada'
import { useHistory } from '@/hooks/useHistory'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import AccessPoliciesModal from '@/components/AccessPoliciesModal'

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const Icons = {
  Undo:    'M3 7v6h6M3.5 13A9 9 0 1 0 5.5 6.5',
  Redo:    'M21 7v6h-6M20.5 13A9 9 0 1 1 18.5 6.5',
  ZoomIn:  'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35M11 8v6M8 11h6',
  ZoomOut: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35M8 11h6',
  Eye:     'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  Save:    'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  Help:    'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10ZM12 17h.01M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
  Book:    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4v16M20 4v13',
  Schema:  'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  Shield:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  Compare: 'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 3v18',
  ChevD:   'M6 9l6 6 6-6',
  External:'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  Back:    'M19 12H5M12 19l-7-7 7-7',
}

/* ── Divider ── */
const Div = () => <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

interface Props {
  scadaName?: string
  publishStatus?: number
  onPreview?: () => void
  onBack?: () => void
}

export default function EditorHeader({ scadaName, publishStatus, onPreview, onBack }: Props) {
  const store = useEditorStore()
  const { isDirty, zoom, setZoom, project, scadaId } = store
  const saveCanvas = useSaveCanvas()
  const { undo, redo, canUndo, canRedo } = useHistory()
  const [showPolicies, setShowPolicies] = useState(false)

  const openInNewTab = (path: string) => window.open(path, '_blank')

  return (
    <>
    <div
      style={{
        display: 'flex', alignItems: 'center',
        height: 'var(--header-h)', flexShrink: 0,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        padding: '0 8px',
        gap: 2,
      }}
    >
      {/* Back button */}
      {onBack && (
        <Tooltip content="返回列表">
          <Button size="icon" variant="ghost" onClick={onBack} aria-label="返回">
            <Icon d={Icons.Back} size={13} />
          </Button>
        </Tooltip>
      )}

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'var(--accent-muted)',
          border: '1px solid var(--border-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2}>
            <rect x={3} y={3} width={7} height={7} rx={1} />
            <rect x={14} y={3} width={7} height={7} rx={1} />
            <rect x={3} y={14} width={7} height={7} rx={1} />
            <rect x={14} y={14} width={7} height={7} rx={1} />
          </svg>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          SCADA
        </span>
      </div>

      <Div />

      {/* Title + dirty */}
      {scadaName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: 180 }}>
          <span style={{
            fontSize: 12, color: 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {scadaName}
          </span>
          {isDirty && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--warning)',
              boxShadow: '0 0 4px var(--warning)',
              flexShrink: 0,
            }} title="有未保存的修改" />
          )}
          <Badge variant={publishStatus === 1 ? 'success' : 'default'}>
            {publishStatus === 1 ? '已发布' : '草稿'}
          </Badge>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Undo / Redo */}
      <Tooltip content="撤销 Ctrl+Z">
        <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} aria-label="撤销">
          <Icon d={Icons.Undo} size={13} />
        </Button>
      </Tooltip>
      <Tooltip content="重做 Ctrl+Y">
        <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} aria-label="重做">
          <Icon d={Icons.Redo} size={13} />
        </Button>
      </Tooltip>

      <Div />

      {/* Zoom */}
      <Tooltip content="缩小 [-]">
        <Button size="icon" variant="ghost" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} aria-label="缩小">
          <Icon d={Icons.ZoomOut} size={13} />
        </Button>
      </Tooltip>
      <button
        onClick={() => setZoom(1)}
        title="点击重置 100%"
        style={{
          minWidth: 42, height: 24,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)',
          cursor: 'pointer', padding: '0 6px',
          transition: 'border-color var(--duration-fast)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <Tooltip content="放大 [+]">
        <Button size="icon" variant="ghost" onClick={() => setZoom(Math.min(4, zoom + 0.1))} aria-label="放大">
          <Icon d={Icons.ZoomIn} size={13} />
        </Button>
      </Tooltip>

      <Div />

      {/* Preview */}
      <Tooltip content="预览">
        <Button size="icon" variant="ghost" onClick={onPreview ?? (() => {})} aria-label="预览">
          <Icon d={Icons.Eye} size={13} />
        </Button>
      </Tooltip>

      {/* Save */}
      <button
        onClick={() => scadaId && saveCanvas.mutate({ id: scadaId, project })}
        disabled={saveCanvas.isPending}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 28, padding: '0 10px',
          borderRadius: 'var(--radius-sm)',
          background: isDirty ? 'var(--accent)' : 'var(--bg-surface)',
          color: isDirty ? '#fff' : 'var(--text-secondary)',
          border: isDirty ? 'none' : '1px solid var(--border-strong)',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          transition: 'all var(--duration-base)',
          opacity: saveCanvas.isPending ? 0.7 : 1,
        }}
        onMouseEnter={(e) => { if (isDirty) e.currentTarget.style.background = 'var(--accent-dim)' }}
        onMouseLeave={(e) => { if (isDirty) e.currentTarget.style.background = 'var(--accent)' }}
      >
        <Icon d={Icons.Save} size={12} />
        {saveCanvas.isPending ? '保存中…' : '保存'}
      </button>

      <Div />

      {/* Access Policies */}
      <Tooltip content="访问策略">
        <Button size="icon" variant="ghost" onClick={() => setShowPolicies(true)} aria-label="访问策略">
          <Icon d={Icons.Shield} size={13} />
        </Button>
      </Tooltip>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="gap-1 px-2" aria-label="帮助">
            <Icon d={Icons.Help} size={13} />
            <Icon d={Icons.ChevD} size={10} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>文档</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => openInNewTab('/scada-editor/schema')}>
            <Icon d={Icons.Schema} size={13} /> Schema 说明
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openInNewTab('/scada-editor/schema#canvas')}>
            <Icon d={Icons.Book} size={13} /> 画布数据结构
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openInNewTab('/scada-editor/schema#element')}>
            <Icon d={Icons.Book} size={13} /> 元素类型参考
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openInNewTab('/scada-editor/schema#diff')}>
            <Icon d={Icons.Compare} size={13} /> 差异对比
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openInNewTab('https://echarts.apache.org/zh/index.html')}>
            <Icon d={Icons.External} size={13} /> ECharts 文档
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    {showPolicies && scadaId && (
      <AccessPoliciesModal scadaId={scadaId} onClose={() => setShowPolicies(false)} />
    )}
  </>
  )
}
