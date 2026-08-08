import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useSaveCanvas, usePublish, useUnpublish, useUpdateInfo } from '@/hooks/useScada'
import { useHistory } from '@/hooks/useHistory'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import AccessPoliciesModal from '@/components/AccessPoliciesModal'
import SimPointsModal from '@/components/SimPointsModal'

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const Icons = {
  Undo:    'M3 7v6h6M3.5 13A9 9 0 1 0 5.5 6.5',
  Redo:    'M21 7v6h-6M20.5 13A9 9 0 1 1 18.5 6.5',
  Points:  'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
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
  Publish: 'M12 2v13M12 2 7 7M12 2l5 5M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3',
  Unpublish: 'M12 15V2M12 15l-5-5M12 15l5-5M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3',
  Workflow: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9v3a3 3 0 0 1-3 3H9',
  Globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
}

/* ── Divider ── */
const Div = () => <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

interface Props {
  scadaName?: string
  scadaCode?: string
  publishStatus?: number
  onPreview?: () => void
  onBack?: () => void
  onWorkflow?: () => void
}

export default function EditorHeader({ scadaName, scadaCode, publishStatus, onPreview, onBack, onWorkflow }: Props) {
  const store = useEditorStore()
  const { isDirty, zoom, setZoom, project, scadaId, liveDataOn, globalContextOpen, toggleGlobalContext } = store
  const saveCanvas = useSaveCanvas()
  const publish = usePublish()
  const unpublish = useUnpublish()
  const updateInfo = useUpdateInfo()
  const { undo, redo, canUndo, canRedo } = useHistory()
  const [showPolicies, setShowPolicies] = useState(false)
  const [showPoints, setShowPoints] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const openInNewTab = (path: string) => window.open(path, '_blank')

  const doSave = () => {
    if (!scadaId) return
    const previewImage = store.getSnapshot(480) ?? undefined
    saveCanvas.mutate({ id: scadaId, project, previewImage })
  }

  const isPublished = publishStatus === 1
  const publishBusy = publish.isPending || unpublish.isPending || saveCanvas.isPending

  const doPublish = () => {
    if (!scadaId || publishBusy) return
    // 发布前先保存当前画布，确保发布的是最新内容
    const previewImage = store.getSnapshot(480) ?? undefined
    saveCanvas.mutate(
      { id: scadaId, project, previewImage },
      { onSuccess: () => publish.mutate(scadaId) },
    )
  }

  const doUnpublish = () => {
    if (!scadaId || publishBusy) return
    unpublish.mutate(scadaId)
  }

  const startEditTitle = () => {
    setEditingTitle(scadaName || '')
    setIsEditingTitle(true)
  }

  const saveTitle = () => {
    if (!scadaId || !editingTitle.trim()) {
      setIsEditingTitle(false)
      return
    }
    if (editingTitle.trim() === scadaName) {
      setIsEditingTitle(false)
      return
    }
    updateInfo.mutate(
      { id: scadaId, body: { scada_name: editingTitle.trim() } },
      { onSuccess: () => setIsEditingTitle(false) }
    )
  }

  const cancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditingTitle('')
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: 240 }}>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') cancelEditTitle()
              }}
              disabled={updateInfo.isPending}
              style={{
                fontSize: 12, color: 'var(--text-primary)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
                outline: 'none',
                minWidth: 120,
                maxWidth: 180,
              }}
            />
          ) : (
            <span
              onClick={startEditTitle}
              title="点击修改标题"
              style={{
                fontSize: 12, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 'var(--radius-sm)',
                transition: 'background var(--duration-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {scadaName}
            </span>
          )}
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
          <Icon d={Icons.Undo} size={15} />
        </Button>
      </Tooltip>
      <Tooltip content="重做 Ctrl+Shift+Z">
        <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} aria-label="重做">
          <Icon d={Icons.Redo} size={15} />
        </Button>
      </Tooltip>

      <Div />

      {/* Live-data toggle */}
      <button
        onClick={() => store.toggleLiveData()}
        title={store.liveDataOn ? '关闭接口/静态数据加载' : '开启接口数据加载（模拟数据始终推送）'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 26, padding: '0 8px',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${store.liveDataOn ? 'var(--border-accent)' : 'var(--border)'}`,
          background: store.liveDataOn ? 'var(--accent-muted)' : 'transparent',
          color: store.liveDataOn ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 11, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {/* pill */}
        <div style={{
          width: 26, height: 13, borderRadius: 7,
          background: store.liveDataOn ? 'var(--accent)' : 'var(--border-strong)',
          position: 'relative', transition: 'background 0.15s', flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', top: 1.5, left: store.liveDataOn ? 14 : 1.5,
            width: 10, height: 10, borderRadius: '50%',
            background: '#fff', transition: 'left 0.15s',
          }} />
        </div>
        加载数据
        {store.liveDataOn && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#22c55e', boxShadow: '0 0 4px #22c55e',
          }} />
        )}
      </button>

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

      {/* Workflow */}
      {onWorkflow && (
        <Tooltip content="工作流">
          <Button size="icon" variant="ghost" onClick={onWorkflow} aria-label="工作流">
            <Icon d={Icons.Workflow} size={13} />
          </Button>
        </Tooltip>
      )}

      {/* Global context — 仅加载数据时可用 */}
      <Tooltip content={liveDataOn ? '全局上下文' : '开启「加载数据」后可查看全局上下文'}>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleGlobalContext}
          disabled={!liveDataOn}
          aria-label="全局上下文"
          style={globalContextOpen ? { color: 'var(--accent)', background: 'var(--accent-muted)' } : undefined}
        >
          <Icon d={Icons.Globe} size={13} />
        </Button>
      </Tooltip>

      {/* Save */}
      <button
        onClick={doSave}
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

      {/* Publish / Unpublish */}
      <button
        onClick={isPublished ? doUnpublish : doPublish}
        disabled={publishBusy}
        title={isPublished ? '取消发布（停止对外分享）' : '发布（保存并对外分享实时大屏）'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 28, padding: '0 10px',
          borderRadius: 'var(--radius-sm)',
          background: isPublished ? 'var(--bg-surface)' : 'var(--success, #22c55e)',
          color: isPublished ? 'var(--text-secondary)' : '#fff',
          border: isPublished ? '1px solid var(--border-strong)' : 'none',
          fontSize: 11, fontWeight: 600,
          cursor: publishBusy ? 'default' : 'pointer',
          transition: 'all var(--duration-base)',
          opacity: publishBusy ? 0.7 : 1,
        }}
      >
        <Icon d={isPublished ? Icons.Unpublish : Icons.Publish} size={12} />
        {publish.isPending ? '发布中…' : unpublish.isPending ? '处理中…' : isPublished ? '取消发布' : '发布'}
      </button>

      {/* Point Management */}
      <Tooltip content="点位管理">
        <Button size="icon" variant="ghost" onClick={() => setShowPoints(true)} aria-label="点位管理">
          <Icon d={Icons.Points} size={13} />
        </Button>
      </Tooltip>

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
    {showPoints && scadaCode && (
      <SimPointsModal scadaCode={scadaCode} onClose={() => setShowPoints(false)} />
    )}
  </>
  )
}
