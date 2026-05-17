import { useRef, useEffect, useState, useCallback } from 'react'
import type { CanvasData, ChartConfig } from '@/types'
import { drawGrid, drawElement } from '@/utils/canvas'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { resolveElementValue } from '@/hooks/useInterfaceBindingData'
import { useRuntimeStore } from '@/store/runtimeStore'
import { useEditorStore } from '@/store/editorStore'
import ChartWidget from './ChartWidget'
import TrendWidget from './TrendWidget'
import UPlotTrendWidget from './UPlotTrendWidget'
import ImageWidget from './ImageWidget'
import TableWidget from './TableWidget'
import FormFieldWidget from './FormFieldWidget'
import LayoutCarouselWidget from './LayoutCarouselWidget'
import LayoutModalWidget from './LayoutModalWidget'

interface Props {
  canvas: CanvasData
  zoom?: number
  /** When true, ignores zoom prop and auto-fits the canvas to its container via ResizeObserver */
  fitContainer?: boolean
  /** 'fit' = maintain aspect ratio (default when fitContainer); 'fill' = stretch to fill */
  fitMode?: 'fit' | 'fill'
  pointData?: PointDataMap
  scadaCode?: string
  onSwitchCanvas?: (canvasId: number) => void
}

export default function CanvasViewer({
  canvas,
  zoom = 1,
  fitContainer = false,
  fitMode = 'fit',
  pointData = {},
  scadaCode,
  onSwitchCanvas,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const openModal = useRuntimeStore((s) => s.openModal)
  const closeModal = useRuntimeStore((s) => s.closeModal)
  const switchCanvas = useEditorStore((s) => s.switchCanvas)

  // resolved zoom — either from prop or computed from container size
  const [resolvedZoom, setResolvedZoom] = useState(zoom)

  const computeZoom = useCallback((cw: number, ch: number) => {
    if (!cw || !ch) return
    const zx = cw / canvas.width
    const zy = ch / canvas.height
    setResolvedZoom(fitMode === 'fill' ? Math.max(zx, zy) : Math.min(zx, zy))
  }, [canvas.width, canvas.height, fitMode])

  // ResizeObserver for fitContainer mode
  useEffect(() => {
    if (!fitContainer) {
      setResolvedZoom(zoom)
      return
    }
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      computeZoom(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    // initial compute
    computeZoom(el.clientWidth, el.clientHeight)
    return () => ro.disconnect()
  }, [fitContainer, zoom, computeZoom])

  const z = resolvedZoom

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    el.width = canvas.width * z
    el.height = canvas.height * z

    ctx.fillStyle = canvas.backgroundColor
    ctx.fillRect(0, 0, el.width, el.height)

    drawGrid(ctx, canvas, z)

    const sorted = [...canvas.elements].sort((a, b) => a.zIndex - b.zIndex)
    for (const element of sorted) {
      drawElement(ctx, element, z)
    }
  }, [canvas, z, pointData])

  const domElements = canvas.elements.filter(
    (el) => el.visible && (el.type === 'text' || el.type === 'button'),
  )
  const chartElements = canvas.elements.filter(
    (el) => el.visible && el.type.startsWith('echarts-'),
  )
  const imageElements = canvas.elements.filter(
    (el) => el.visible && (
      el.type === 'image-bg' || el.type === 'image-widget' ||
      el.type === 'image-decoration' || el.type === 'image-border-box'
    ),
  )
  const layoutElements = canvas.elements.filter(
    (el) => el.visible && (el.type === 'layout-carousel' || el.type === 'layout-modal'),
  )
  const tableElements = canvas.elements.filter(
    (el) => el.visible && el.type === 'table',
  )
  const formFieldElements = canvas.elements.filter(
    (el) => el.visible && el.type.startsWith('form-'),
  )
  const formValuesRef = useRef<Record<string, string>>({})

  const handleElementClick = (el: (typeof domElements)[0]) => {
    if (!el.events?.length) return
    for (const ev of el.events) {
      if (ev.trigger !== 'click') continue
      if (ev.action === 'open-modal' && ev.target) openModal(ev.target)
      else if (ev.action === 'close-modal' && ev.target) closeModal(ev.target)
      else if (ev.action === 'navigate-canvas' && ev.target) {
        const id = Number(ev.target)
        if (onSwitchCanvas) onSwitchCanvas(id)
        else switchCanvas(id)
      }
      else if (ev.action === 'navigate' && ev.target) window.open(ev.target, '_blank')
      else if (ev.action === 'popup' && ev.target) window.open(ev.target, '_blank', 'width=800,height=600')
      else if (ev.action === 'script' && ev.script) {
        try { new Function(ev.script)() } catch { /* ignore */ }
      }
    }
  }

  // When fitContainer, the outer div fills its parent; the inner canvas is centered
  const outerStyle: React.CSSProperties = fitContainer
    ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    : { position: 'relative', display: 'inline-block' }

  return (
    <div ref={containerRef} style={outerStyle}>
      {/* inner wrapper sized to the scaled canvas */}
      <div style={{ position: 'relative', width: canvas.width * z, height: canvas.height * z, flexShrink: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
        {chartElements.map((el) =>
          el.type === 'echarts-trend'
            ? ((el.properties?.chartConfig as ChartConfig | undefined)?.renderEngine === 'uplot-canvas' || (el.properties?.chartConfig as ChartConfig | undefined)?.renderEngine === 'uplot-webgl'
                ? <UPlotTrendWidget key={el.id} el={el} zoom={z} pointData={pointData} scadaCode={scadaCode} />
                : <TrendWidget key={el.id} el={el} zoom={z} pointData={pointData} scadaCode={scadaCode} />)
            : <ChartWidget key={el.id} el={el} zoom={z} pointData={pointData} />
        )}
        {imageElements.map((el) => (
          <ImageWidget key={el.id} el={el} zoom={z} />
        ))}
        {layoutElements.map((el) =>
          el.type === 'layout-carousel'
            ? <LayoutCarouselWidget key={el.id} el={el} zoom={z} isPreview={true} />
            : <LayoutModalWidget key={el.id} el={el} zoom={z} isPreview={true} pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
        )}
        {tableElements.map((el) => (
          <TableWidget key={el.id} el={el} zoom={z} pointData={pointData} />
        ))}
        {formFieldElements.map((el) => (
          <FormFieldWidget key={el.id} el={el} zoom={z} isPreview={true} canvas={canvas} valuesRef={formValuesRef} />
        ))}
        {domElements.map((el) => {
          const displayText = resolveElementValue(el, pointData)
          const hasEvents = !!el.events?.length
          const isBtn = el.type === 'button'
          return (
            <div
              key={el.id}
              onClick={() => handleElementClick(el)}
              style={{
                position: 'absolute',
                left: el.x * z,
                top: el.y * z,
                width: el.width * z,
                height: el.height * z,
                zIndex: el.zIndex,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  el.textAlign === 'left' ? 'flex-start'
                  : el.textAlign === 'right' ? 'flex-end'
                  : 'center',
                color: el.fontColor || '#fff',
                fontSize: (el.fontSize ?? 14) * z,
                fontFamily: el.fontFamily || 'sans-serif',
                fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
                fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
                background: isBtn ? (el.fill || 'transparent') : 'transparent',
                borderRadius: isBtn ? ((el.borderRadius ?? 4) * z) : undefined,
                border: isBtn && el.stroke ? `${(el.strokeWidth ?? 1) * z}px solid ${el.stroke}` : undefined,
                pointerEvents: (isBtn || hasEvents) ? 'auto' : 'none',
                cursor: (isBtn || hasEvents) ? 'pointer' : 'default',
                userSelect: 'none',
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                boxSizing: 'border-box',
              }}
            >
              {displayText}
            </div>
          )
        })}
      </div>
    </div>
  )
}
