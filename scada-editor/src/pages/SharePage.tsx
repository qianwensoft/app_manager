import { useParams } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useScadaByShareToken } from '@/hooks/useScada'
import { useCanvasBindingData } from '@/hooks/useCanvasBindingData'
import CanvasViewer from '@/components/CanvasViewer'
import type { CanvasProject, CanvasData } from '@/types'
import { shouldAutoLandscape, isLandscape } from '@/utils/deviceDetect'
import { useToastHost } from '@/components/ToastHost'
import { resetGlobalContext } from '@/runtime/workflow/globalContext'

/**
 * 免登分享页：app 端 WebView / 外部链接通过 share_token 访问已发布组态。
 * 路由 /share/:token —— 服务端 agent 菜单下发 /scada-editor/share/<token>。
 * 数据走免登 STOMP 通道 /ws/stomp-scada?share_token=。
 */
export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const { data: info, isLoading, isError } = useScadaByShareToken(token)
  const [project, setProject] = useState<CanvasProject | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [needLandscape, setNeedLandscape] = useState(false)
  const { toast, node: toastNode } = useToastHost()

  useEffect(() => {
    resetGlobalContext()
    return () => resetGlobalContext()
  }, [token])

  useEffect(() => {
    if (!info?.canvas_data) return
    try {
      const p: CanvasProject = JSON.parse(info.canvas_data)
      setProject(p)
      setActiveId(p.activeCanvasId)

      // 检查是否需要自动横屏
      const activeCanvas = p.canvases[p.activeCanvasId]
      if (activeCanvas && shouldAutoLandscape(activeCanvas.autoLandscape)) {
        setNeedLandscape(!isLandscape())
      } else {
        setNeedLandscape(false)
      }
    } catch {
      console.error('canvas_data parse error')
    }
  }, [info])

  // 监听画布切换，重新检查横屏需求
  useEffect(() => {
    if (!project || !activeId) return
    const canvas = project.canvases[activeId]
    if (canvas && shouldAutoLandscape(canvas.autoLandscape)) {
      setNeedLandscape(!isLandscape())
    } else {
      setNeedLandscape(false)
    }
  }, [activeId, project])

  // 监听窗口大小变化（屏幕旋转），重新检查横屏需求
  useEffect(() => {
    const handleResize = () => {
      if (!project || !activeId) return
      const canvas = project.canvases[activeId]
      if (canvas && shouldAutoLandscape(canvas.autoLandscape)) {
        setNeedLandscape(!isLandscape())
      } else {
        setNeedLandscape(false)
      }
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [project, activeId])

  const allElements = project && activeId ? (project.canvases[activeId]?.elements ?? []) : []
  const { pointData, tableLiveData } = useCanvasBindingData({
    scadaCode: info?.scada_code ?? '',
    elements: allElements,
    stompEnabled: true,
    httpPollEnabled: false,
    interfaceEnabled: true,
    shareToken: token,
  })

  const activeCanvas: CanvasData | undefined =
    project && activeId ? project.canvases[activeId] : undefined

  if (isLoading) return <div style={centerStyle}>加载中…</div>
  if (isError || !info) return <div style={centerStyle}>分享链接无效或组态未发布</div>

  // 横屏容器样式
  const landscapeContainerStyle: React.CSSProperties = needLandscape ? {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vh',
    height: '100vw',
    transform: 'rotate(90deg) translateY(-100%)',
    transformOrigin: 'top left',
  } : {}

  return (
    <div
      ref={containerRef}
      style={{
        height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: activeCanvas?.adaptiveMode === 'screen' ? 0 : undefined,
        ...landscapeContainerStyle,
      }}
    >
      {activeCanvas ? (
        activeCanvas.adaptiveMode === 'screen' ? (
          // 屏幕自适应：画布填充整个容器
          <CanvasViewer
            canvas={activeCanvas}
            fitContainer
            fitMode="fill"
            pointData={pointData}
            tableLiveData={tableLiveData}
            scadaCode={info.scada_code}
            onSwitchCanvas={setActiveId}
            workflows={project?.workflows}
            workflowLibs={project?.workflowLibs}
            enableWorkflows
            onToast={toast}
            shareToken={token}
          />
        ) : (
          // 固定尺寸或适应内容：保持原有行为
          <CanvasViewer
            canvas={activeCanvas}
            fitContainer
            fitMode="fit"
            pointData={pointData}
            tableLiveData={tableLiveData}
            scadaCode={info.scada_code}
            onSwitchCanvas={setActiveId}
            workflows={project?.workflows}
            workflowLibs={project?.workflowLibs}
            enableWorkflows
            onToast={toast}
            shareToken={token}
          />
        )
      ) : (
        <div style={centerStyle}>
          {project === null && info.canvas_data ? '画布数据解析失败' : '该组态暂无画布内容'}
        </div>
      )}
      {toastNode}
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '100%', width: '100%',
  color: 'var(--text-muted)', fontSize: 13,
}
