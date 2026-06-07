import { useState, useEffect, useRef } from 'react'
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
}

export default function LayoutCarouselWidget({ el, zoom, isPreview = false, pointData = {} }: Props) {
  const slides = el.layoutSlides ?? 3
  const interval = el.layoutInterval ?? 3000
  const slideCanvases = el.layoutSlideCanvases ?? []
  const [active, setActive] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const project = useEditorStore((s) => s.project)

  useEffect(() => {
    if (!isPreview || interval <= 0) return
    timerRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % slides)
    }, interval)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isPreview, interval, slides])

  const prev = () => setActive((a) => (a - 1 + slides) % slides)
  const next = () => setActive((a) => (a + 1) % slides)

  const w = el.width * zoom
  const h = el.height * zoom

  const boundCanvasId = slideCanvases[active]
  const boundCanvas = boundCanvasId ? project.canvases[boundCanvasId] : undefined

  // scale the bound canvas to fit the carousel widget area
  const slideZoom = boundCanvas
    ? Math.min(w / boundCanvas.width, h / boundCanvas.height)
    : zoom

  return (
    <div
      style={mergeAnimStyle(el, pointData, {
        position: 'absolute',
        left: el.x * zoom, top: el.y * zoom,
        width: w, height: h,
        zIndex: el.zIndex,
        background: el.fill || 'rgba(0,0,0,0.3)',
        border: el.stroke ? `${(el.strokeWidth ?? 1) * zoom}px solid ${el.stroke}` : undefined,
        borderRadius: el.borderRadius ? el.borderRadius * zoom : undefined,
        opacity: el.opacity ?? 1,
        overflow: 'hidden',
        pointerEvents: isPreview ? 'auto' : 'none',
        boxSizing: 'border-box',
      })}
    >
      {/* Slide content */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {boundCanvas ? (
          <div style={{ transform: `scale(${slideZoom})`, transformOrigin: 'top left' }}>
            <CanvasViewer canvas={boundCanvas} zoom={1} />
          </div>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.3)', fontSize: 12 * zoom,
            userSelect: 'none',
          }}>
            幻灯片 {active + 1}
          </div>
        )}
      </div>

      {/* Slide counter */}
      <div style={{
        position: 'absolute', top: 6 * zoom, right: 8 * zoom,
        fontSize: 11 * zoom, color: 'rgba(255,255,255,0.7)',
        userSelect: 'none', pointerEvents: 'none',
        background: 'rgba(0,0,0,0.4)', borderRadius: 3 * zoom,
        padding: `${2 * zoom}px ${5 * zoom}px`,
      }}>
        {active + 1} / {slides}
      </div>

      {/* Left arrow */}
      <button onClick={prev} style={{
        position: 'absolute', left: 6 * zoom, top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 4 * zoom, color: '#fff',
        width: 24 * zoom, height: 24 * zoom,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 14 * zoom, padding: 0,
        pointerEvents: isPreview ? 'auto' : 'none',
      }}>‹</button>

      {/* Right arrow */}
      <button onClick={next} style={{
        position: 'absolute', right: 6 * zoom, top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 4 * zoom, color: '#fff',
        width: 24 * zoom, height: 24 * zoom,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 14 * zoom, padding: 0,
        pointerEvents: isPreview ? 'auto' : 'none',
      }}>›</button>

      {/* Dot indicators */}
      <div style={{
        position: 'absolute', bottom: 8 * zoom, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 5 * zoom,
        pointerEvents: 'none',
      }}>
        {Array.from({ length: slides }).map((_, i) => (
          <div
            key={i}
            onClick={() => { if (isPreview) setActive(i) }}
            style={{
              width: 6 * zoom, height: 6 * zoom, borderRadius: '50%',
              background: i === active ? 'var(--accent, #4a9eff)' : 'rgba(255,255,255,0.35)',
              transition: 'background 0.2s',
              cursor: isPreview ? 'pointer' : 'default',
              pointerEvents: isPreview ? 'auto' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}
