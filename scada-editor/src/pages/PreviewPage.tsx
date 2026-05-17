import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useScadaInfo } from '@/hooks/useScada'
import { useStompPointData, type PointDataMap } from '@/hooks/useStompPointData'
import { useHttpPollingPointData } from '@/hooks/useHttpPollingPointData'
import { useInterfaceBindingData } from '@/hooks/useInterfaceBindingData'
import CanvasViewer from '@/components/CanvasViewer'
import type { CanvasProject, CanvasData } from '@/types'

type DataMode = 'stomp' | 'http' | 'none'

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: info, isLoading } = useScadaInfo(Number(id))
  const [project, setProject] = useState<CanvasProject | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [pointData, setPointData] = useState<PointDataMap>({})
  const [dataMode, setDataMode] = useState<DataMode>('none')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [headerHovered, setHeaderHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!info?.canvas_data) return
    try {
      const p: CanvasProject = JSON.parse(info.canvas_data)
      setProject(p)
      setActiveId(p.activeCanvasId)
      setDataMode(info.publish_status === 1 ? 'stomp' : 'http')
    } catch {
      console.error('canvas_data parse error')
    }
  }, [info])

  const handleData = useCallback((data: PointDataMap) => {
    setPointData((prev) => ({ ...prev, ...data }))
  }, [])

  useStompPointData({
    scadaCode: info?.scada_code ?? '',
    onData: handleData,
    enabled: dataMode === 'stomp' && !!info?.scada_code,
  })

  useHttpPollingPointData({
    scadaCode: info?.scada_code ?? '',
    intervalMs: 2000,
    onData: handleData,
    enabled: dataMode === 'http' && !!info?.scada_code,
  })

  const allElements = project && activeId ? (project.canvases[activeId]?.elements ?? []) : []
  useInterfaceBindingData({ elements: allElements, onData: handleData })

  const activeCanvas: CanvasData | undefined =
    project && activeId ? project.canvases[activeId] : undefined
  const canvasList = project ? Object.values(project.canvases) : []

  if (isLoading) return <div style={centerStyle}>加载中…</div>
  if (!info) return <div style={centerStyle}>未找到组态</div>

  const headerVisible = !headerCollapsed || headerHovered

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)' }}>

      {/* Thin hover zone shown when header is collapsed */}
      {headerCollapsed && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 4,
            zIndex: 100, cursor: 'pointer',
            background: 'transparent',
          }}
          onMouseEnter={() => setHeaderHovered(true)}
          onMouseLeave={() => setHeaderHovered(false)}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 'var(--header-h)', flexShrink: 0,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          padding: '0 12px',
          overflow: 'hidden',
          maxHeight: headerVisible ? 'var(--header-h)' : 0,
          transition: 'max-height 0.2s ease',
        }}
        onMouseEnter={() => headerCollapsed && setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <button
          onClick={() => navigate(`/editor/${id}`)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 28, padding: '0 8px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
            transition: 'all var(--duration-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <Icon d="M19 12H5M12 19l-7-7 7-7" size={12} />
          编辑器
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>SCADA</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{info.scada_name}</span>

        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 6px',
          borderRadius: 'var(--radius-full)',
          background: info.publish_status === 1 ? 'rgba(34,197,94,0.15)' : 'var(--bg-elevated)',
          color: info.publish_status === 1 ? '#4ade80' : 'var(--text-muted)',
          border: `1px solid ${info.publish_status === 1 ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
        }}>
          {info.publish_status === 1 ? '已发布' : '草稿'}
        </span>

        <div style={{ flex: 1 }} />

        {/* Data mode toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 1,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: 2,
        }}>
          {(['stomp', 'http', 'none'] as DataMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setDataMode(mode)}
              style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 500,
                borderRadius: 3, border: 'none', cursor: 'pointer',
                transition: 'all var(--duration-fast)',
                background: dataMode === mode ? 'var(--accent)' : 'transparent',
                color: dataMode === mode ? '#fff' : 'var(--text-muted)',
              }}
            >
              {mode === 'stomp' ? 'STOMP' : mode === 'http' ? 'HTTP 轮询' : '无数据'}
            </button>
          ))}
        </div>

        {/* Canvas tabs */}
        {canvasList.length > 1 && canvasList.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)',
              border: `1px solid ${activeId === c.id ? 'var(--border-accent)' : 'var(--border)'}`,
              background: activeId === c.id ? 'var(--accent-muted)' : 'transparent',
              color: activeId === c.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all var(--duration-fast)',
            }}
          >
            {c.name}
          </button>
        ))}

        {/* Zoom indicator */}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          自适应
        </span>

        {/* Collapse toggle */}
        <button
          onClick={() => { setHeaderCollapsed(c => !c); setHeaderHovered(false) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'all var(--duration-fast)', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          title={headerCollapsed ? '展开工具栏' : '收起工具栏'}
        >
          {/* chevron-up when expanded, chevron-down when collapsed */}
          <Icon d={headerCollapsed ? 'M6 9l6 6 6-6' : 'M18 15l-6-6-6 6'} size={12} />
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflow: 'hidden', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, rgba(74,158,255,0.04) 0%, transparent 70%), var(--bg-base)',
          padding: 24, boxSizing: 'border-box',
        }}
      >
        {activeCanvas ? (
          <div style={{
            boxShadow: '0 0 0 1px var(--border-strong), 0 16px 48px rgba(0,0,0,0.7)',
            borderRadius: 2, flex: 1, alignSelf: 'stretch', overflow: 'hidden', minWidth: 0, minHeight: 0,
          }}>
            <CanvasViewer
              canvas={activeCanvas}
              fitContainer
              fitMode="fit"
              pointData={pointData}
              scadaCode={info?.scada_code}
              onSwitchCanvas={setActiveId}
            />
          </div>
        ) : (
          <div style={centerStyle}>
            {project === null && info.canvas_data
              ? '画布数据解析失败'
              : '该组态暂无画布内容，请先在编辑器中添加元件并保存'}
          </div>
        )}
      </div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '100%', width: '100%',
  color: 'var(--text-muted)', fontSize: 13,
}
