/**
 * ImageLightbox.tsx
 *
 * 全屏图片查看器：旋转 / 缩放 / 拖动平移 / 滚轮缩放 / 双指捏合 / 双击缩放切换。
 *
 * 设计要点：
 * - 单例 host（`ImageLightbox`）挂在 docs-app 入口，全局只渲染一次。
 * - 任何 `components.img` 通过 `openImageLightbox(src)` 触发，无需逐层透传 state。
 * - 用原生 pointer events + wheel 处理手势，无需第三方库；CSS transform 合成层加速。
 * - 缩放范围 0.2x ~ 10x；旋转 90° 步进；平移不设硬限，依靠 CSS `transform` 直接给值即可。
 * - 双击切换 1x / 2.5x 双指捏合保持上一基准缩放，连续平滑。
 *
 * 使用：
 * 1. 在入口挂一次：`<ImageLightbox />`
 * 2. 在需要的位置调用 `openImageLightbox(src)`
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// 模块级事件：任何位置调 openImageLightbox(src) 都能打开，host 内部订阅并 setState。
// ---------------------------------------------------------------------------

type OpenFn = (src: string, alt?: string) => void
let _open: OpenFn | null = null

export function openImageLightbox(src: string, alt?: string): void {
  if (!_open) {
    // Host 没挂载（极少见，可能是 SSR 或 hot reload 时机问题）。用 window.open 兜底
    // 避免静默失败，至少能让用户在新标签页看到原图。
    if (typeof window !== 'undefined') {
      window.open(src, '_blank', 'noopener,noreferrer')
    }
    return
  }
  _open(src, alt)
}

// ---------------------------------------------------------------------------
// 手势工具：双指捏合的距离变化驱动缩放，单指拖动驱动平移，双击驱动缩放切换。
// ---------------------------------------------------------------------------

interface PointerSnapshot {
  id: number
  x: number
  y: number
}

const MIN_SCALE = 0.2
const MAX_SCALE = 10
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_DIST = 24 // px 距离阈值：超过就不算双击
const ZOOM_STEP = 1.25 // 按钮 +/- / 滚轮每步倍数

function clampScale(v: number): number {
  if (v < MIN_SCALE) return MIN_SCALE
  if (v > MAX_SCALE) return MAX_SCALE
  return v
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export function ImageLightbox() {
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [alt, setAlt] = useState<string>('')

  // 变换状态：旋转、平移、缩放。统一用 transform 一次写入避免中间帧抖动。
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  // 拖动 / 缩放过程中的瞬时值：写在 ref 里，避免每个 pointermove 都触发 setState
  // 重渲染开销（移动端双指缩放会高频派发）。
  const pointersRef = useRef<Map<number, PointerSnapshot>>(new Map())
  const dragRef = useRef<{ startTx: number; startTy: number; startX: number; startY: number } | null>(null)
  const pinchRef = useRef<{ startDist: number; startScale: number; centerX: number; centerY: number } | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 })

  // 订阅模块级 open 函数。组件挂载/卸载时切换引用，避免多 host 竞态。
  useEffect(() => {
    const fn: OpenFn = (s, a) => {
      setSrc(s)
      setAlt(a || '')
      setRotation(0)
      setScale(1)
      setTx(0)
      setTy(0)
      setOpen(true)
    }
    _open = fn
    return () => {
      if (_open === fn) _open = null
    }
  }, [])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP)
      else if (e.key === '-') zoomBy(1 / ZOOM_STEP)
      else if (e.key.toLowerCase() === 'r') rotate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // body 滚动锁定（避免背景跟着滚）
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    // 延迟清 src，避免淡出过程中图片瞬间消失。
    setTimeout(() => setSrc(null), 200)
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => clampScale(s * factor))
  }, [])

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy])
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), [])
  const reset = useCallback(() => {
    setRotation(0)
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  // 图片居中显示 + 鼠标滚轮缩放（以鼠标位置为锚点）
  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLImageElement>) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      const rect = e.currentTarget.getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      // 锚点缩放：以鼠标位置为不动点，调整 tx/ty 使视觉上保持鼠标处不变。
      const next = clampScale(scale * factor)
      const realFactor = next / scale
      setScale(next)
      setTx((tx) => tx - cx * (realFactor - 1))
      setTy((ty) => ty - cy * (realFactor - 1))
    },
    [scale, tx, ty],
  )

  // 双击缩放 / 单击拖动开始
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

      if (pointersRef.current.size === 1) {
        // 单指：可能是拖动开始，也可能是双击的第二下
        const now = Date.now()
        const last = lastTapRef.current
        const dx = e.clientX - last.x
        const dy = e.clientY - last.y
        const isDoubleTap = now - last.time < DOUBLE_TAP_MS && Math.hypot(dx, dy) < DOUBLE_TAP_DIST
        if (isDoubleTap) {
          // 双击：1x 与 2.5x 之间切换
          if (scale > 1.05) {
            setScale(1)
            setTx(0)
            setTy(0)
          } else {
            // 双击图片的相对位置（图片坐标系），放大到 2.5x 时把点击处移到屏幕中心。
            const rect = e.currentTarget.getBoundingClientRect()
            const cx = e.clientX - rect.left - rect.width / 2
            const cy = e.clientY - rect.top - rect.height / 2
            const target = 2.5
            const f = target / 1
            setScale(target)
            setTx(-cx * (f - 1))
            setTy(-cy * (f - 1))
          }
          lastTapRef.current = { time: 0, x: 0, y: 0 } // 防止连点三次误触
          pointersRef.current.delete(e.pointerId)
          return
        }
        lastTapRef.current = { time: now, x: e.clientX, y: e.clientY }
        // 准备拖动
        dragRef.current = { startTx: tx, startTy: ty, startX: e.clientX, startY: e.clientY }
      } else if (pointersRef.current.size === 2) {
        // 双指：开始捏合，记录初始距离和当前缩放
        const [p1, p2] = Array.from(pointersRef.current.values())
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        pinchRef.current = {
          startDist: dist,
          startScale: scale,
          centerX: (p1.x + p2.x) / 2,
          centerY: (p1.y + p2.y) / 2,
        }
        // 双指期间取消单指拖动
        dragRef.current = null
      }
    },
    [scale, tx, ty],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      const snap = pointersRef.current.get(e.pointerId)
      if (!snap) return
      snap.x = e.clientX
      snap.y = e.clientY
      pointersRef.current.set(e.pointerId, snap)

      if (pointersRef.current.size === 1 && dragRef.current) {
        // 单指拖动平移
        const d = dragRef.current
        setTx(d.startTx + (e.clientX - d.startX))
        setTy(d.startTy + (e.clientY - d.startY))
      } else if (pointersRef.current.size === 2 && pinchRef.current) {
        // 双指捏合：以两指中点为不动点缩放
        const [p1, p2] = Array.from(pointersRef.current.values())
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const pinch = pinchRef.current
        const next = clampScale((pinch.startScale * dist) / pinch.startDist)
        const rect = e.currentTarget.getBoundingClientRect()
        // 中点相对图片中心的偏移（屏幕坐标）
        const cx = pinch.centerX - rect.left - rect.width / 2
        const cy = pinch.centerY - rect.top - rect.height / 2
        const realFactor = next / scale
        setScale(next)
        // 维持双指中点视觉不变
        setTx((tx) => tx + (pinch.centerX - (rect.left + rect.width / 2 + tx)) * (realFactor - 1))
        setTy((ty) => ty + (pinch.centerY - (rect.top + rect.height / 2 + ty)) * (realFactor - 1))
      }
    },
    [scale],
  )

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size === 0) {
      dragRef.current = null
    }
  }, [])

  if (!open || !src) return null

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || '图片预览'}
      onClick={close}
    >
      <div className="image-lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="缩小" title="缩小 (-)" onClick={zoomOut}>
          <span aria-hidden="true">−</span>
        </button>
        <button type="button" aria-label="放大" title="放大 (+)" onClick={zoomIn}>
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" aria-label="旋转" title="旋转 90° (R)" onClick={rotate}>
          <span aria-hidden="true">↻</span>
        </button>
        <button type="button" aria-label="重置" title="重置 (0)" onClick={reset}>
          <span aria-hidden="true">⟲</span>
        </button>
        <span className="image-lightbox-scale" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="image-lightbox-close"
          aria-label="关闭"
          title="关闭 (Esc)"
          onClick={close}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="image-lightbox-stage" onClick={close}>
        <img
          src={src}
          alt={alt}
          className="image-lightbox-img"
          draggable={false}
          style={{
            transform: `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${scale})`,
          }}
          onClick={(e) => e.stopPropagation()}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  )
}