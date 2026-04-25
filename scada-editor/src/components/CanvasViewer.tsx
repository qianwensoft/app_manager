import { useRef, useEffect } from 'react'
import type { CanvasData, CanvasElement } from '@/types'
import { drawGrid, drawElement } from '@/utils/canvas'
import type { PointDataMap } from '@/hooks/useStompPointData'
import ChartWidget from './ChartWidget'
import ImageWidget from './ImageWidget'

interface Props {
  canvas: CanvasData
  zoom?: number
  pointData?: PointDataMap
}

/** 解析元件绑定的实时值，支持简单 JS transform 表达式 */
function resolveValue(el: CanvasElement, pointData: PointDataMap): string | undefined {
  const link = el.pointBinding?.pointKey
  if (!link) return el.text
  const raw = pointData[link]
  if (raw === undefined) return el.text
  if (el.pointBinding?.transform) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('val', `return (${el.pointBinding.transform})`)
      return String(fn(raw))
    } catch {
      return String(raw)
    }
  }
  return String(raw)
}

export default function CanvasViewer({ canvas, zoom = 1, pointData = {} }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    el.width = canvas.width * zoom
    el.height = canvas.height * zoom

    ctx.fillStyle = canvas.backgroundColor
    ctx.fillRect(0, 0, el.width, el.height)

    drawGrid(ctx, canvas, zoom)

    const sorted = [...canvas.elements].sort((a, b) => a.zIndex - b.zIndex)
    for (const element of sorted) {
      drawElement(ctx, element, zoom)
    }
  }, [canvas, zoom, pointData])

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

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      {chartElements.map((el) => (
        <ChartWidget key={el.id} el={el} zoom={zoom} pointData={pointData} />
      ))}
      {imageElements.map((el) => (
        <ImageWidget key={el.id} el={el} zoom={zoom} />
      ))}
      {domElements.map((el) => {
        const displayText = resolveValue(el, pointData)
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: el.x * zoom,
              top: el.y * zoom,
              width: el.width * zoom,
              height: el.height * zoom,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                el.textAlign === 'left' ? 'flex-start'
                : el.textAlign === 'right' ? 'flex-end'
                : 'center',
              color: el.fontColor || '#fff',
              fontSize: (el.fontSize ?? 14) * zoom,
              fontFamily: el.fontFamily || 'sans-serif',
              pointerEvents: el.type === 'button' ? 'auto' : 'none',
              cursor: el.type === 'button' ? 'pointer' : 'default',
              userSelect: 'none',
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            }}
          >
            {displayText}
          </div>
        )
      })}
    </div>
  )
}
