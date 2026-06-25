import { useEffect } from 'react'
import { useRuntimeStore } from '@/store/runtimeStore'
import { useEditorStore } from '@/store/editorStore'
import type { CanvasElement } from '@/types'
import CanvasViewer from './CanvasViewer'
import type { PointDataMap } from '@/hooks/useStompPointData'

interface Props {
  el: CanvasElement
  zoom: number
  isPreview?: boolean
  pointData?: PointDataMap
  scadaCode?: string
  onSwitchCanvas?: (canvasId: number) => void
}

export default function LayoutModalWidget({ el, zoom, isPreview = false, pointData = {}, scadaCode, onSwitchCanvas }: Props) {
  const visible = useRuntimeStore((s) => s.modalVisible[el.id] ?? null)
  const openModal = useRuntimeStore((s) => s.openModal)
  const closeModal = useRuntimeStore((s) => s.closeModal)
  const project = useEditorStore((s) => s.project)

  const title = el.layoutModalTitle || '弹窗'
  const showClose = el.layoutShowClose !== false
  const defaultVisible = !!el.layoutModalDefaultVisible
  const w = el.width * zoom
  const h = el.height * zoom
  const titleBarH = 32 * zoom

  // bound canvas
  const boundCanvas = el.layoutModalCanvasId ? project.canvases[el.layoutModalCanvasId] : undefined

  // Initialize runtime visibility from defaultVisible when first mounted
  useEffect(() => {
    if (isPreview && visible === null) {
      if (defaultVisible) openModal(el.id)
      else closeModal(el.id)
    }
  }, [isPreview]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolved visibility: null means not yet initialized → use defaultVisible
  const resolvedVisible = visible === null ? defaultVisible : visible

  const titleBar = (
    <div style={{
      height: titleBarH,
      background: 'rgba(0,0,0,0.35)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center',
      padding: `0 ${10 * zoom}px`, gap: 6 * zoom, flexShrink: 0,
    }}>
      <span style={{
        flex: 1, fontSize: 12 * zoom, color: 'var(--text-primary, #e0e6f0)',
        fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', userSelect: 'none',
      }}>
        {title}
      </span>
      {showClose && isPreview && (
        <button
          onClick={() => closeModal(el.id)}
          style={{
            width: 20 * zoom, height: 20 * zoom,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.08)', border: 'none',
            borderRadius: 3 * zoom, color: 'rgba(255,255,255,0.7)',
            fontSize: 14 * zoom, cursor: 'pointer', padding: 0, lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
      {showClose && !isPreview && (
        <div style={{
          width: 16 * zoom, height: 16 * zoom,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.5)', fontSize: 14 * zoom, lineHeight: 1,
        }}>×</div>
      )}
    </div>
  )

  // body content: bound canvas or placeholder
  const bodyContent = boundCanvas
    ? (
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <CanvasViewer
          canvas={boundCanvas}
          fitContainer
          fitMode="fit"
          pointData={pointData}
          scadaCode={scadaCode}
          onSwitchCanvas={onSwitchCanvas}
        />
      </div>
    )
    : (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.2)', fontSize: 11 * zoom, userSelect: 'none',
      }}>
        {isPreview ? '未绑定画布' : '点击右侧「绑定画布」配置内容'}
      </div>
    )

  // Editor mode: always rendered in-place
  if (!isPreview) {
    const editorVisible = el.visible !== false
    return (
      <div
        style={{
          position: 'absolute', left: el.x * zoom, top: el.y * zoom,
          width: w, height: h, zIndex: el.zIndex,
          background: editorVisible ? (el.fill || 'var(--bg-panel)') : 'transparent',
          border: editorVisible
            ? (el.stroke ? `${(el.strokeWidth ?? 1) * zoom}px solid ${el.stroke}` : '1px solid var(--border-strong)')
            : `1px dashed rgba(249,115,22,0.35)`,
          borderRadius: (el.borderRadius ?? 4) * zoom,
          opacity: editorVisible ? (el.opacity ?? 1) : 0.35,
          overflow: 'hidden',
          pointerEvents: 'none',
          boxSizing: 'border-box',
          transition: 'opacity 0.15s, border-color 0.15s',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {editorVisible && titleBar}
        {editorVisible && bodyContent}
        {!editorVisible && (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 4,
          }}>
            <svg width={16 * zoom} height={16 * zoom} viewBox="0 0 24 24" fill="none"
              stroke="rgba(249,115,22,0.5)" strokeWidth={1.5}>
              <rect x={3} y={3} width={18} height={18} rx={2} />
              <path d="M9 3v18M3 9h6" />
            </svg>
            <span style={{ fontSize: 10 * zoom, color: 'rgba(249,115,22,0.5)', userSelect: 'none' }}>
              {title}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Preview / publish mode: fixed overlay driven by runtimeStore
  if (!resolvedVisible) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => { if (showClose) closeModal(el.id) }}
    >
      <div
        style={{
          width: w, height: h,
          background: el.fill || 'var(--bg-panel, #1a2233)',
          border: el.stroke ? `${(el.strokeWidth ?? 1) * zoom}px solid ${el.stroke}` : '1px solid var(--border-strong)',
          borderRadius: (el.borderRadius ?? 4) * zoom,
          overflow: 'hidden', boxShadow: '0 16px 64px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {titleBar}
        {bodyContent}
      </div>
    </div>
  )
}
