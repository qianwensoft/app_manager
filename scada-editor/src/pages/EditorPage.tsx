import { useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useScadaInfo, useSaveCanvas } from '@/hooks/useScada'
import { useEditorStore } from '@/store/editorStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import EditorHeader from '@/components/EditorHeader'
import Toolbar from '@/components/Toolbar'
import WidgetPanel from '@/components/WidgetPanel'
import LayerPanel from '@/components/LayerPanel'
import CanvasBoard from '@/components/CanvasBoard'
import CanvasTabs from '@/components/CanvasTabs'
import PropertiesPanel from '@/components/PropertiesPanel'
import type { CanvasProject } from '@/types'

const MAIN_CANVAS_ID = 100001

// 兼容旧版 Vue SCADA schema（{ version, widgets, width, height, ... }）
function normalizeProject(raw: unknown): CanvasProject | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  // 已是新格式
  if (obj.canvases && typeof obj.canvases === 'object') {
    return obj as unknown as CanvasProject
  }

  // 旧格式：包裹成新格式
  return {
    version: 1,
    activeCanvasId: MAIN_CANVAS_ID,
    canvasGroups: [],
    canvases: {
      [MAIN_CANVAS_ID]: {
        id: MAIN_CANVAS_ID,
        name: '主面板',
        width: (obj.width as number) || 1920,
        height: (obj.height as number) || 1080,
        background: (obj.background as string) || '#1a1a2e',
        backgroundColor: (obj.background as string) || '#1a1a2e',
        showGrid: true,
        snapToGrid: true,
        gridSize: 10,
        gridColor: '#2a2a4a',
        showRuler: true,
        elements: [],
        zoom: 1,
        viewport: { x: 0, y: 0, width: (obj.width as number) || 1920, height: (obj.height as number) || 1080 },
      },
    },
  }
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const scadaId = Number(id)
  const { data: info, isLoading } = useScadaInfo(scadaId)
  const store = useEditorStore()
  const saveCanvas = useSaveCanvas()

  const doSave = () => {
    if (!scadaId) return
    const previewImage = store.getSnapshot(480) ?? undefined
    saveCanvas.mutate({ id: scadaId, project: store.project, previewImage })
  }

  useKeyboardShortcuts(doSave)

  useEffect(() => {
    if (!info) return
    if (info.canvas_data) {
      try {
        const raw = JSON.parse(info.canvas_data)
        const project = normalizeProject(raw)
        if (project) {
          store.loadProject(scadaId, project)
          return
        }
      } catch { /* fall through to reset */ }
    }
    store.resetProject()
    store.loadProject(scadaId, store.project)
  }, [info])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-app)',
        color: 'var(--text-muted)', fontSize: 13, gap: 10, flexDirection: 'column',
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        加载组态数据…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)' }}>
      <EditorHeader
        scadaName={info?.scada_name}
        scadaCode={info?.scada_code}
        publishStatus={info?.publish_status}
        onBack={() => navigate('/')}
        onPreview={() => navigate(`/preview/${scadaId}`)}
      />
      <CanvasTabs />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar />
        <WidgetPanel />
        <LayerPanel />
        <CanvasBoard />
        <PropertiesPanel />
      </div>
    </div>
  )
}
