import { useState } from 'react'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { useEditorStore } from '@/store/editorStore'
import { mergeAnimStyle } from '@/runtime/animationExecutor'
import CanvasViewer from './CanvasViewer'

interface Props {
  el: CanvasElement
  zoom: number
  isPreview?: boolean
  pointData?: PointDataMap
  scadaCode?: string
  onSwitchCanvas?: (canvasId: number) => void
}

export default function LayoutCollapseWidget({ el, zoom, isPreview = false, pointData = {}, scadaCode, onSwitchCanvas }: Props) {
  const title = el.layoutCollapseTitle || '折叠面板'
  const defaultExpanded = el.layoutCollapseExpanded !== false
  const [expanded, setExpanded] = useState(defaultExpanded)
  const project = useEditorStore((s) => s.project)

  const w = el.width * zoom
  const h = el.height * zoom
  const headerH = 32 * zoom
  const bodyH = Math.max(0, h - headerH)
  const boundCanvas = el.layoutCollapseCanvasId ? project.canvases[el.layoutCollapseCanvasId] : undefined
  const contentZoom = boundCanvas && expanded
    ? Math.min(w / boundCanvas.width, bodyH / boundCanvas.height)
    : zoom

  const isOpen = isPreview ? expanded : defaultExpanded

  return (
    <div
      style={mergeAnimStyle(el, pointData, {
        position: 'absolute',
        left: el.x * zoom,
        top: el.y * zoom,
        width: w,
        height: h,
        zIndex: el.zIndex,
        background: el.fill || 'rgba(0,0,0,0.35)',
        border: el.stroke ? `${(el.strokeWidth ?? 1) * zoom}px solid ${el.stroke}` : undefined,
        borderRadius: el.borderRadius ? el.borderRadius * zoom : undefined,
        opacity: el.opacity ?? 1,
        overflow: 'hidden',
        pointerEvents: isPreview ? 'auto' : 'none',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      <button
        type="button"
        onClick={() => { if (isPreview) setExpanded(v => !v) }}
        style={{
          height: headerH,
          width: '100%',
          border: 'none',
          borderBottom: isOpen ? '1px solid rgba(255,255,255,0.1)' : undefined,
          background: 'rgba(0,0,0,0.3)',
          color: '#e0e6f0',
          display: 'flex',
          alignItems: 'center',
          gap: 8 * zoom,
          padding: `0 ${10 * zoom}px`,
          fontSize: 12 * zoom,
          fontWeight: 600,
          cursor: isPreview ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          fontSize: 10 * zoom,
          color: 'rgba(255,255,255,0.6)',
        }}>▶</span>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
      </button>
      {isOpen && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {boundCanvas ? (
            <div style={{ transform: `scale(${contentZoom})`, transformOrigin: 'top left' }}>
              <CanvasViewer
                canvas={boundCanvas}
                zoom={1}
                pointData={pointData}
                scadaCode={scadaCode}
                onSwitchCanvas={onSwitchCanvas}
              />
            </div>
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.35)', fontSize: 12 * zoom,
            }}>
              折叠内容区
            </div>
          )}
        </div>
      )}
    </div>
  )
}
