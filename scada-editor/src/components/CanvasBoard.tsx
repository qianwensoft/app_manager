import { useRef, useEffect, useCallback, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import {
  drawGrid, drawElement, drawSelectionHandles, drawMultiSelectBox, drawMarquee,
  hitTest, hitTestHandle, hitTestMarquee, snapToGrid, generateId,
} from '@/utils/canvas'
import { pushHistory } from '@/hooks/useHistory'
import type { CanvasElement } from '@/types'
import ChartWidget from './ChartWidget'
import ImageWidget from './ImageWidget'
import { WIDGET_DRAG_TYPE, buildWidgetElement } from './WidgetPanel'
import type { WidgetDef } from './WidgetPanel'

const HANDLE_EDGES: [boolean, boolean, boolean, boolean][] = [
  [true,  true,  false, false],
  [false, true,  false, false],
  [false, true,  true,  false],
  [true,  false, false, false],
  [false, false, true,  false],
  [true,  false, false, true ],
  [false, false, false, true ],
  [false, false, true,  true ],
]

type ResizeRef = {
  id: string
  handle: number
  startX: number; startY: number
  elX: number; elY: number; elW: number; elH: number
}

type DragRef = {
  startX: number; startY: number
  // snapshot of each selected element's initial position
  origins: { id: string; x: number; y: number }[]
}

type MarqueeRef = {
  startX: number; startY: number   // canvas pixel coords
  curX: number; curY: number
}

export default function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragRef | null>(null)
  const resizeRef = useRef<ResizeRef | null>(null)
  const drawingRef = useRef<{ startX: number; startY: number } | null>(null)
  const marqueeRef = useRef<MarqueeRef | null>(null)

  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const { activeTool, selectedIds, zoom } = store

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  // 注册 canvas 元素到 store，供保存时截图
  useEffect(() => {
    store.registerCanvasEl(canvasRef.current)
    return () => store.registerCanvasEl(null)
  }, [])

  const draw = useCallback(() => {
    const el = canvasRef.current
    if (!el || !canvas) return
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

    // Draw selection handles on overlay canvas
    const oc = overlayCanvasRef.current
    if (oc) {
      oc.width = el.width
      oc.height = el.height
      const octx = oc.getContext('2d')
      if (octx) {
        octx.clearRect(0, 0, oc.width, oc.height)
        if (selectedIds.length === 1) {
          const selEl = canvas.elements.find((e) => e.id === selectedIds[0])
          if (selEl) drawSelectionHandles(octx, selEl, zoom)
        } else if (selectedIds.length > 1) {
          const selEls = canvas.elements.filter((e) => selectedIds.includes(e.id))
          selEls.forEach((e) => {
            octx.save()
            octx.strokeStyle = 'rgba(74,158,255,0.5)'
            octx.lineWidth = 1
            octx.setLineDash([3, 3])
            octx.strokeRect(e.x * zoom - 2, e.y * zoom - 2, e.width * zoom + 4, e.height * zoom + 4)
            octx.setLineDash([])
            octx.restore()
          })
          drawMultiSelectBox(octx, selEls, zoom)
        }
        if (marqueeRef.current) {
          const m = marqueeRef.current
          drawMarquee(octx, m.startX, m.startY, m.curX, m.curY)
        }
      }
    }
  }, [canvas, zoom, selectedIds])

  useEffect(() => { draw() }, [draw])

  // Trackpad pinch-to-zoom — must be non-passive to call preventDefault
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useEffect(() => {
    const el = overlayCanvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = -e.deltaY * 0.01
      store.setZoom(zoomRef.current + delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = overlayCanvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left),          // canvas pixel coords (already scaled)
      y: (e.clientY - rect.top),
      // logical coords (divide by zoom)
      lx: (e.clientX - rect.left) / zoom,
      ly: (e.clientY - rect.top) / zoom,
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvas) return
    const { x: mx, y: my, lx, ly } = getCanvasPos(e)
    const shift = e.shiftKey || e.ctrlKey || e.metaKey

    if (activeTool === 'select') {
      // 1. Try resize handle (only when exactly one element selected)
      if (selectedIds.length === 1 && !shift) {
        const selEl = canvas.elements.find((el) => el.id === selectedIds[0])
        if (selEl && !selEl.locked) {
          const hi = hitTestHandle(selEl, mx, my, zoom)
          if (hi >= 0) {
            pushHistory(store.project)
            resizeRef.current = {
              id: selEl.id, handle: hi,
              startX: e.clientX, startY: e.clientY,
              elX: selEl.x, elY: selEl.y, elW: selEl.width, elH: selEl.height,
            }
            return
          }
        }
      }

      // 2. Hit test element — highest zIndex first
      const hit = [...canvas.elements].sort((a, b) => b.zIndex - a.zIndex).find((el) => hitTest(el, mx, my, zoom))
      if (hit) {
        // If hit element belongs to a group, redirect selection to the group
        const parentGroup = canvas.elements.find(
          (el) => el.type === 'group' && el.children?.includes(hit.id)
        )
        const targetId = parentGroup ? parentGroup.id : hit.id
        const targetEl = canvas.elements.find((e) => e.id === targetId)
        if (shift) {
          // toggle this element in/out of selection
          store.selectElements([targetId], true)
        } else {
          // if clicking an already-selected element, keep selection for drag
          if (!selectedIds.includes(targetId)) {
            store.selectElements([targetId])
          }
          // only start drag if target is not locked
          if (!targetEl?.locked) {
            pushHistory(store.project)
            const currentIds = selectedIds.includes(targetId) ? selectedIds : [targetId]
            const origins = currentIds
              .map((id) => {
                const el = canvas.elements.find((e) => e.id === id)
                return el ? { id, x: el.x, y: el.y } : null
              })
              .filter(Boolean) as { id: string; x: number; y: number }[]
            dragRef.current = { startX: e.clientX, startY: e.clientY, origins }
          }
        }
        return
      }

      // 3. Clicked empty area → start marquee or clear selection
      if (!shift) store.clearSelection()
      marqueeRef.current = { startX: mx, startY: my, curX: mx, curY: my }
      return
    }

    drawingRef.current = { startX: lx, startY: ly }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvas) return

    if (resizeRef.current) {
      const r = resizeRef.current
      const dx = (e.clientX - r.startX) / zoom
      const dy = (e.clientY - r.startY) / zoom
      const [moveL, moveT, moveR, moveB] = HANDLE_EDGES[r.handle]
      let nx = r.elX, ny = r.elY, nw = r.elW, nh = r.elH
      if (moveL) { nx = r.elX + dx; nw = r.elW - dx }
      if (moveT) { ny = r.elY + dy; nh = r.elH - dy }
      if (moveR) { nw = r.elW + dx }
      if (moveB) { nh = r.elH + dy }
      if (nw < 10) { nw = 10; if (moveL) nx = r.elX + r.elW - 10 }
      if (nh < 10) { nh = 10; if (moveT) ny = r.elY + r.elH - 10 }
      store.updateElement(r.id, { x: nx, y: ny, width: nw, height: nh })
      return
    }

    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startX) / zoom
      const dy = (e.clientY - dragRef.current.startY) / zoom
      dragRef.current.origins.forEach(({ id, x, y }) => {
        let nx = x + dx
        let ny = y + dy
        if (canvas.snapToGrid) { nx = snapToGrid(nx, canvas.gridSize); ny = snapToGrid(ny, canvas.gridSize) }
        store.moveElement(id, nx, ny)
      })
      return
    }

    if (marqueeRef.current) {
      const { x: mx, y: my } = getCanvasPos(e)
      marqueeRef.current.curX = mx
      marqueeRef.current.curY = my
      draw() // re-draw to show marquee live
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!canvas) return

    if (resizeRef.current) { resizeRef.current = null; return }
    if (dragRef.current) { dragRef.current = null; return }

    if (marqueeRef.current) {
      const m = marqueeRef.current
      const ids = hitTestMarquee(canvas.elements, m.startX, m.startY, m.curX, m.curY, zoom)
      if (ids.length > 0) {
        const shift = e.shiftKey || e.ctrlKey || e.metaKey
        if (shift) {
          ids.forEach((id) => store.selectElements([id], true))
        } else {
          store.selectElements(ids)
        }
      }
      marqueeRef.current = null
      draw()
      return
    }

    if (drawingRef.current && activeTool !== 'select') {
      pushHistory(store.project)
      const rect = overlayCanvasRef.current!.getBoundingClientRect()
      const lx = (e.clientX - rect.left) / zoom
      const ly = (e.clientY - rect.top) / zoom
      const sx = drawingRef.current.startX
      const sy = drawingRef.current.startY
      const w = Math.abs(lx - sx) || 100
      const h = Math.abs(ly - sy) || 60
      const nx = Math.min(sx, lx)
      const ny = Math.min(sy, ly)

      const newEl: CanvasElement = {
        id: generateId(),
        type: activeTool as CanvasElement['type'],
        name: activeTool,
        x: canvas.snapToGrid ? snapToGrid(nx, canvas.gridSize) : nx,
        y: canvas.snapToGrid ? snapToGrid(ny, canvas.gridSize) : ny,
        width: w < 10 ? 100 : w,
        height: h < 10 ? 60 : h,
        rotation: 0,
        visible: true,
        locked: false,
        zIndex: canvas.elements.length,
        fill: '#4a9eff44',
        stroke: '#4a9eff',
        strokeWidth: 1,
        opacity: 1,
        text: activeTool === 'text' || activeTool === 'button' ? '文本' : undefined,
        fontSize: 14,
        fontColor: '#ffffff',
      }
      store.addElement(newEl)
      store.selectElements([newEl.id])
      store.setTool('select')
      drawingRef.current = null
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(WIDGET_DRAG_TYPE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!canvas || !canvasRef.current) return
    const raw = e.dataTransfer.getData(WIDGET_DRAG_TYPE)
    if (!raw) return
    let def: WidgetDef
    try { def = JSON.parse(raw) } catch { return }

    const rect = canvasRef.current.getBoundingClientRect()
    const lx = (e.clientX - rect.left) / zoom
    const ly = (e.clientY - rect.top) / zoom
    // Center the element on drop point
    const w = def.defaults?.width ?? 100
    const h = def.defaults?.height ?? 60
    const dropX = lx - w / 2
    const dropY = ly - h / 2

    pushHistory(store.project)
    const el = buildWidgetElement(def, canvas, Math.max(0, dropX), Math.max(0, dropY))
    store.addElement(el)
    store.selectElements([el.id])
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!canvas) return
    const { x: mx, y: my } = getCanvasPos(e)
    const hit = [...canvas.elements].sort((a, b) => b.zIndex - a.zIndex).find((el) => hitTest(el, mx, my, zoom))
    if (!hit) { setCtxMenu(null); return }
    const parentGroup = canvas.elements.find(
      (el) => el.type === 'group' && el.children?.includes(hit.id)
    )
    const targetId = parentGroup ? parentGroup.id : hit.id
    if (!selectedIds.includes(targetId)) store.selectElements([targetId])
    setCtxMenu({ x: e.clientX, y: e.clientY, id: targetId })
  }

  const closeCtxMenu = () => setCtxMenu(null)

  if (!canvas) return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: 13,
    }}>
      未选择画布
    </div>
  )

  const chartElements = canvas.elements.filter((el) => el.visible && el.type.startsWith('echarts-'))
  const imageElements = canvas.elements.filter((el) => el.visible && (
    el.type === 'image-bg' || el.type === 'image-widget' ||
    el.type === 'image-decoration' || el.type === 'image-border-box'
  ))
  // 合并 overlay 元素并按 zIndex 排序，保证层级正确
  const overlayElements = [...chartElements, ...imageElements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div
      className="canvas-board scada-scroll"
      style={{ padding: 24 }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={closeCtxMenu}
    >
      <div style={{
        position: 'relative',
        display: 'inline-block',
        boxShadow: '0 0 0 1px var(--border-strong), 0 8px 40px rgba(0,0,0,0.6), 0 0 80px rgba(74,158,255,0.06)',
        borderRadius: 2,
        flexShrink: 0,
      }}>
        {/* Content canvas — behind overlay widgets */}
        <canvas ref={canvasRef} style={{ display: 'block' }} />
        {/* DOM overlay widgets (image/chart) — interleaved by zIndex */}
        {overlayElements.map((el) =>
          el.type.startsWith('echarts-')
            ? <ChartWidget key={el.id} el={el} zoom={zoom} />
            : <ImageWidget key={el.id} el={el} zoom={zoom} />
        )}
        {/* Selection/marquee overlay canvas — always on top, receives all mouse events */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute', inset: 0, display: 'block',
            cursor: activeTool === 'select' ? 'default' : 'crosshair',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* ── Right-click context menu ── */}
      {ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 9999,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: 150,
            padding: '4px 0',
            fontSize: 12,
          }}
        >
          {[
            {
              label: '置顶', icon: 'M5 3h14M5 7h14M12 11v10M8 17l4 4 4-4',
              action: () => { pushHistory(store.project); store.bringToFront(ctxMenu.id); closeCtxMenu() },
            },
            {
              label: '置底', icon: 'M5 21h14M5 17h14M12 13V3M8 7l4-4 4 4',
              action: () => { pushHistory(store.project); store.sendToBack(ctxMenu.id); closeCtxMenu() },
            },
            {
              label: '上移一层', icon: 'M8 7l4-4 4 4M12 3v10M5 21h14',
              action: () => { pushHistory(store.project); store.bringForward(ctxMenu.id); closeCtxMenu() },
            },
            {
              label: '下移一层', icon: 'M8 17l4 4 4-4M12 21V11M5 3h14',
              action: () => { pushHistory(store.project); store.sendBackward(ctxMenu.id); closeCtxMenu() },
            },
          ].map(({ label, icon, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-primary)', fontSize: 12, textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
              {label}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            onClick={() => {
              pushHistory(store.project)
              store.deleteElements([ctxMenu.id])
              store.clearSelection()
              closeCtxMenu()
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--danger)', fontSize: 12, textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-muted)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            删除
          </button>
        </div>
      )}
    </div>
  )
}
