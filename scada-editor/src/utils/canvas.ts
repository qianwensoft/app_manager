import type { CanvasElement, CanvasData } from '@/types'

export function drawGrid(ctx: CanvasRenderingContext2D, canvas: CanvasData, zoom: number) {
  if (!canvas.showGrid) return
  const { width, height, gridSize, gridColor } = canvas
  ctx.save()
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 0.5
  const step = gridSize * zoom
  for (let x = 0; x <= width * zoom; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height * zoom); ctx.stroke()
  }
  for (let y = 0; y <= height * zoom; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width * zoom, y); ctx.stroke()
  }
  ctx.restore()
}

export function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement, zoom: number) {
  if (!el.visible) return
  ctx.save()
  ctx.globalAlpha = el.opacity ?? 1
  const cx = (el.x + el.width / 2) * zoom
  const cy = (el.y + el.height / 2) * zoom
  ctx.translate(cx, cy)
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180)
  ctx.translate(-cx, -cy)

  const x = el.x * zoom
  const y = el.y * zoom
  const w = el.width * zoom
  const h = el.height * zoom

  ctx.fillStyle = el.fill || 'transparent'
  ctx.strokeStyle = el.stroke || '#333'
  ctx.lineWidth = (el.strokeWidth ?? 1) * zoom

  switch (el.type) {
    case 'group': {
      ctx.strokeStyle = 'rgba(74,158,255,0.35)'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 4])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
      break
    }
    case 'rect':
      if (el.fill) { ctx.fillRect(x, y, w, h) }
      if (el.stroke) { ctx.strokeRect(x, y, w, h) }
      break
    case 'circle':
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      if (el.fill) ctx.fill()
      if (el.stroke) ctx.stroke()
      break
    }
    case 'line':
      ctx.beginPath()
      ctx.moveTo(x, y + h / 2)
      ctx.lineTo(x + w, y + h / 2)
      ctx.stroke()
      break
    case 'text':
    case 'button': {
      if (el.fill && el.type === 'button') {
        ctx.fillRect(x, y, w, h)
        if (el.stroke) ctx.strokeRect(x, y, w, h)
      }
      ctx.fillStyle = el.fontColor || '#fff'
      const weight = el.fontWeight === 'bold' ? 'bold ' : ''
      const fstyle = el.fontStyle === 'italic' ? 'italic ' : ''
      ctx.font = `${fstyle}${weight}${(el.fontSize ?? 14) * zoom}px ${el.fontFamily || 'sans-serif'}`
      ctx.textAlign = el.textAlign || 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(el.text || '', x + w / 2, y + h / 2, w)
      break
    }
    case 'image':
      break
    case 'dynamic-pipe': {
      const mid = y + h / 2
      ctx.fillStyle = el.fill || '#7f8c8d'
      ctx.fillRect(x, y, w, h)
      if (el.stroke) ctx.strokeRect(x, y, w, h)
      ctx.strokeStyle = el.stroke || '#95a5a6'
      ctx.lineWidth = 1 * zoom
      const arrowCount = Math.floor(w / (20 * zoom))
      for (let i = 1; i <= arrowCount; i++) {
        const ax = x + (w / (arrowCount + 1)) * i
        ctx.beginPath()
        ctx.moveTo(ax - 4 * zoom, mid - 4 * zoom)
        ctx.lineTo(ax + 4 * zoom, mid)
        ctx.lineTo(ax - 4 * zoom, mid + 4 * zoom)
        ctx.stroke()
      }
      break
    }
    case 'form-input':
    case 'form-number':
    case 'form-select':
    case 'form-textarea':
    case 'form-date':
    case 'form-switch':
    case 'form-radio':
    case 'form-checkbox':
    case 'form-rate':
    case 'form-slider':
    case 'form-grid':
    case 'form-submit': {
      const isSubmit = el.type === 'form-submit'
      ctx.fillStyle = isSubmit ? (el.fill || '#2980b9') : (el.fill || 'rgba(255,255,255,0.06)')
      ctx.fillRect(x, y, w, h)
      ctx.setLineDash([])
      ctx.strokeStyle = el.stroke || (isSubmit ? '#4a9eff' : 'rgba(255,255,255,0.18)')
      ctx.lineWidth = (el.strokeWidth ?? 1) * zoom
      ctx.strokeRect(x, y, w, h)
      // DOM overlay handles all content rendering; canvas only draws the frame
      break
    }
    default:
      ctx.fillStyle = el.fill || '#4a9eff33'
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
  }
  ctx.restore()
}

export function drawSelectionHandles(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  zoom: number,
) {
  const x = el.x * zoom
  const y = el.y * zoom
  const w = el.width * zoom
  const h = el.height * zoom
  const pad = 4

  ctx.save()
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2)
  ctx.setLineDash([])

  const handles = getHandlePositions(el, zoom)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  for (const [hx, hy] of handles) {
    ctx.beginPath()
    ctx.arc(hx, hy, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

// Unified bounding box for multi-select (no resize handles)
export function drawMultiSelectBox(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  zoom: number,
) {
  if (elements.length === 0) return
  const minX = Math.min(...elements.map((e) => e.x)) * zoom - 4
  const minY = Math.min(...elements.map((e) => e.y)) * zoom - 4
  const maxX = Math.max(...elements.map((e) => e.x + e.width)) * zoom + 4
  const maxY = Math.max(...elements.map((e) => e.y + e.height)) * zoom + 4
  ctx.save()
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
  ctx.setLineDash([])
  ctx.restore()
}

// Marquee selection rectangle (canvas pixel coords)
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
) {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const w = Math.abs(x2 - x1)
  const h = Math.abs(y2 - y1)
  ctx.save()
  ctx.fillStyle = 'rgba(74,158,255,0.08)'
  ctx.strokeStyle = 'rgba(74,158,255,0.6)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
  ctx.restore()
}

export function getHandlePositions(el: CanvasElement, zoom: number): [number, number][] {
  const x = el.x * zoom
  const y = el.y * zoom
  const w = el.width * zoom
  const h = el.height * zoom
  return [
    [x, y], [x + w / 2, y], [x + w, y],
    [x, y + h / 2],           [x + w, y + h / 2],
    [x, y + h], [x + w / 2, y + h], [x + w, y + h],
  ]
}

export function hitTestHandle(el: CanvasElement, mx: number, my: number, zoom: number): number {
  const handles = getHandlePositions(el, zoom)
  const r = 7
  for (let i = 0; i < handles.length; i++) {
    const [hx, hy] = handles[i]
    if (Math.abs(mx - hx) <= r && Math.abs(my - hy) <= r) return i
  }
  return -1
}

export function hitTest(el: CanvasElement, mx: number, my: number, zoom: number): boolean {
  const x = el.x * zoom
  const y = el.y * zoom
  const w = el.width * zoom
  const h = el.height * zoom
  return mx >= x && mx <= x + w && my >= y && my <= y + h
}

// Elements whose bounding box overlaps the marquee rect (canvas pixel coords)
export function hitTestMarquee(
  elements: CanvasElement[],
  x1: number, y1: number, x2: number, y2: number,
  zoom: number,
): string[] {
  const rx = Math.min(x1, x2)
  const ry = Math.min(y1, y2)
  const rw = Math.abs(x2 - x1)
  const rh = Math.abs(y2 - y1)
  return elements
    .filter((el) => {
      if (!el.visible) return false
      const ex = el.x * zoom
      const ey = el.y * zoom
      const ew = el.width * zoom
      const eh = el.height * zoom
      return ex < rx + rw && ex + ew > rx && ey < ry + rh && ey + eh > ry
    })
    .map((el) => el.id)
}

export function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize
}

export function generateId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}
