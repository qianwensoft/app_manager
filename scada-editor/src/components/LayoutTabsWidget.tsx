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

export default function LayoutTabsWidget({ el, zoom, isPreview = false, pointData = {}, scadaCode, onSwitchCanvas }: Props) {
  const labels = el.layoutTabLabels?.length
    ? el.layoutTabLabels
    : ['Tab 1', 'Tab 2', 'Tab 3']
  const tabCanvases = el.layoutTabCanvases ?? []
  const [active, setActive] = useState(el.layoutActiveTab ?? 0)
  const project = useEditorStore((s) => s.project)

  const w = el.width * zoom
  const h = el.height * zoom
  const tabBarH = 32 * zoom
  const boundCanvasId = tabCanvases[active]
  const boundCanvas = boundCanvasId ? project.canvases[boundCanvasId] : undefined
  const bodyH = h - tabBarH
  const slideZoom = boundCanvas
    ? Math.min(w / boundCanvas.width, bodyH / boundCanvas.height)
    : zoom

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
      <div style={{
        height: tabBarH,
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.25)',
      }}>
        {labels.map((label, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            onClick={() => { if (isPreview) setActive(i) }}
            style={{
              flex: 1,
              border: 'none',
              borderRight: i < labels.length - 1 ? '1px solid rgba(255,255,255,0.08)' : undefined,
              background: i === active ? 'rgba(74,158,255,0.25)' : 'transparent',
              color: i === active ? '#fff' : 'rgba(255,255,255,0.55)',
              fontSize: 11 * zoom,
              fontWeight: i === active ? 600 : 400,
              cursor: isPreview ? 'pointer' : 'default',
              padding: `0 ${8 * zoom}px`,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {boundCanvas ? (
          <div style={{ transform: `scale(${slideZoom})`, transformOrigin: 'top left' }}>
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
            {labels[active] ?? `Tab ${active + 1}`}
          </div>
        )}
      </div>
    </div>
  )
}
