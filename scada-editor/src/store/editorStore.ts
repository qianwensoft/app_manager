import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CanvasData, CanvasElement, CanvasProject, DrawingTool, AlignType } from '@/types'
import { generateId } from '@/utils/canvas'

const MAIN_CANVAS_ID = 100001

function defaultCanvas(): CanvasData {
  return {
    id: MAIN_CANVAS_ID,
    name: '主面板',
    width: 1920,
    height: 1080,
    background: '#1a1a2e',
    backgroundColor: '#1a1a2e',
    showGrid: true,
    snapToGrid: true,
    gridSize: 10,
    gridColor: '#2a2a4a',
    showRuler: true,
    elements: [],
    zoom: 1,
    viewport: { x: 0, y: 0, width: 1920, height: 1080 },
  }
}

interface EditorStore {
  // project
  scadaId: number | null
  project: CanvasProject
  isDirty: boolean

  // editor ui
  activeTool: DrawingTool
  selectedIds: string[]
  zoom: number
  panOffset: { x: number; y: number }

  // clipboard (in-memory, not persisted)
  _clipboard: CanvasElement[]

  // canvas element ref — registered by CanvasBoard, read by EditorHeader for snapshot
  _canvasEl: HTMLCanvasElement | null
  registerCanvasEl: (el: HTMLCanvasElement | null) => void
  getSnapshot: (maxWidth?: number) => string | null

  // actions - project
  loadProject: (scadaId: number, project: CanvasProject) => void
  resetProject: () => void
  markDirty: () => void
  markClean: () => void

  // actions - canvas
  activeCanvasId: () => number
  activeCanvas: () => CanvasData | undefined
  switchCanvas: (id: number) => void
  addCanvas: (canvas: CanvasData) => void
  updateCanvas: (id: number, updates: Partial<CanvasData>) => void
  deleteCanvas: (id: number) => void

  // actions - elements
  addElement: (el: CanvasElement) => void
  updateElement: (id: string, updates: Partial<CanvasElement>) => void
  deleteElements: (ids: string[]) => void
  moveElement: (id: string, x: number, y: number) => void
  reorderElements: (ids: string[]) => void
  renameElement: (id: string, name: string) => void

  // actions - selection (append=true → Shift/Ctrl multi-select)
  selectElements: (ids: string[], append?: boolean) => void
  clearSelection: () => void

  // actions - copy/paste/duplicate
  copySelected: () => void
  paste: () => void
  duplicateSelected: () => void

  // actions - group/ungroup
  groupSelected: () => void
  ungroup: (id: string) => void

  // actions - align/distribute
  alignElements: (ids: string[], align: AlignType) => void
  distributeElements: (ids: string[], axis: 'x' | 'y') => void

  // actions - z-order
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void

  // actions - editor
  setTool: (tool: DrawingTool) => void
  setZoom: (zoom: number) => void
  setPanOffset: (offset: { x: number; y: number }) => void
}

const initialProject: CanvasProject = {
  version: 1,
  canvases: { [MAIN_CANVAS_ID]: defaultCanvas() },
  activeCanvasId: MAIN_CANVAS_ID,
  canvasGroups: [
    {
      id: 1, name: '组态配置', type: 'panelSet',
      children: [{ id: 11, name: '面板', type: 'folder', children: [{ id: MAIN_CANVAS_ID, name: '主面板', type: 'panel' }] }],
    },
  ],
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    scadaId: null,
    project: initialProject,
    isDirty: false,
    activeTool: 'select',
    selectedIds: [],
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    _clipboard: [],
    _canvasEl: null,
    registerCanvasEl: (el) => set(() => ({ _canvasEl: el })),
    getSnapshot: (maxWidth = 480) => {
      const el = get()._canvasEl
      if (!el) return null
      try {
        if (maxWidth && el.width > maxWidth) {
          const scale = maxWidth / el.width
          const off = document.createElement('canvas')
          off.width = maxWidth
          off.height = Math.round(el.height * scale)
          off.getContext('2d')!.drawImage(el, 0, 0, off.width, off.height)
          return off.toDataURL('image/jpeg', 0.82)
        }
        return el.toDataURL('image/jpeg', 0.82)
      } catch { return null }
    },

    loadProject: (scadaId, project) =>
      set((s) => { s.scadaId = scadaId; s.project = project; s.isDirty = false }),

    resetProject: () =>
      set((s) => { s.project = initialProject; s.isDirty = false; s.scadaId = null }),

    markDirty: () => set((s) => { s.isDirty = true }),
    markClean: () => set((s) => { s.isDirty = false }),

    activeCanvasId: () => get().project.activeCanvasId,
    activeCanvas: () => get().project.canvases[get().project.activeCanvasId],

    switchCanvas: (id) =>
      set((s) => { if (s.project.canvases[id]) s.project.activeCanvasId = id }),

    addCanvas: (canvas) =>
      set((s) => { s.project.canvases[canvas.id] = canvas; s.isDirty = true }),

    updateCanvas: (id, updates) =>
      set((s) => {
        if (s.project.canvases[id]) {
          Object.assign(s.project.canvases[id], updates)
          s.isDirty = true
        }
      }),

    deleteCanvas: (id) =>
      set((s) => {
        if (id === MAIN_CANVAS_ID) return
        delete s.project.canvases[id]
        if (s.project.activeCanvasId === id) s.project.activeCanvasId = MAIN_CANVAS_ID
        s.isDirty = true
      }),

    addElement: (el) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (c) { c.elements.push(el); s.isDirty = true }
      }),

    updateElement: (id, updates) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const idx = c.elements.findIndex((e) => e.id === id)
        if (idx < 0) return
        const el = c.elements[idx]
        // If resizing a group, scale/move all children proportionally
        if (
          el.type === 'group' && el.children?.length &&
          (updates.x !== undefined || updates.y !== undefined ||
           updates.width !== undefined || updates.height !== undefined)
        ) {
          const oldX = el.x, oldY = el.y, oldW = el.width, oldH = el.height
          const newX = updates.x ?? oldX
          const newY = updates.y ?? oldY
          const newW = updates.width ?? oldW
          const newH = updates.height ?? oldH
          const scaleX = oldW > 0 ? newW / oldW : 1
          const scaleY = oldH > 0 ? newH / oldH : 1
          el.children.forEach((childId) => {
            const child = c.elements.find((e) => e.id === childId)
            if (!child) return
            child.x = newX + (child.x - oldX) * scaleX
            child.y = newY + (child.y - oldY) * scaleY
            child.width = Math.max(4, child.width * scaleX)
            child.height = Math.max(4, child.height * scaleY)
          })
        }
        Object.assign(el, updates)
        s.isDirty = true
      }),

    deleteElements: (ids) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        c.elements = c.elements.filter((e) => !ids.includes(e.id))
        s.selectedIds = s.selectedIds.filter((id) => !ids.includes(id))
        s.isDirty = true
      }),

    moveElement: (id, x, y) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const el = c.elements.find((e) => e.id === id)
        if (!el) return
        if (el.type === 'group' && el.children?.length) {
          const dx = x - el.x
          const dy = y - el.y
          el.children.forEach((childId) => {
            const child = c.elements.find((e) => e.id === childId)
            if (child) { child.x += dx; child.y += dy }
          })
        }
        el.x = x; el.y = y; s.isDirty = true
      }),

    reorderElements: (ids) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const map = new Map(c.elements.map((e) => [e.id, e]))
        c.elements = ids.map((id) => map.get(id)).filter(Boolean) as CanvasElement[]
        s.isDirty = true
      }),

    renameElement: (id, name) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const el = c.elements.find((e) => e.id === id)
        if (el) { el.name = name; s.isDirty = true }
      }),

    selectElements: (ids, append = false) =>
      set((s) => {
        if (append) {
          // toggle: if all already selected, deselect; otherwise add
          const toAdd = ids.filter((id) => !s.selectedIds.includes(id))
          const toRemove = ids.filter((id) => s.selectedIds.includes(id))
          s.selectedIds = [
            ...s.selectedIds.filter((id) => !toRemove.includes(id)),
            ...toAdd,
          ]
        } else {
          s.selectedIds = ids
        }
      }),

    clearSelection: () => set((s) => { s.selectedIds = [] }),

    copySelected: () => {
      const { selectedIds, activeCanvas } = get()
      const c = activeCanvas()
      if (!c || selectedIds.length === 0) return
      const els = c.elements.filter((e) => selectedIds.includes(e.id))
      set((s) => { s._clipboard = JSON.parse(JSON.stringify(els)) })
    },

    paste: () =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c || s._clipboard.length === 0) return
        const newIds: string[] = []
        const maxZ = c.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
        s._clipboard.forEach((src, i) => {
          const el: CanvasElement = {
            ...JSON.parse(JSON.stringify(src)),
            id: generateId(),
            x: src.x + 20,
            y: src.y + 20,
            zIndex: maxZ + i + 1,
          }
          c.elements.push(el)
          newIds.push(el.id)
        })
        s.selectedIds = newIds
        s.isDirty = true
      }),

    duplicateSelected: () => {
      const { selectedIds, activeCanvas } = get()
      const c = activeCanvas()
      if (!c || selectedIds.length === 0) return
      const els = c.elements.filter((e) => selectedIds.includes(e.id))
      set((s) => {
        const canvas = s.project.canvases[s.project.activeCanvasId]
        if (!canvas) return
        const newIds: string[] = []
        const maxZ = canvas.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
        els.forEach((src, i) => {
          const el: CanvasElement = {
            ...JSON.parse(JSON.stringify(src)),
            id: generateId(),
            x: src.x + 20,
            y: src.y + 20,
            zIndex: maxZ + i + 1,
          }
          canvas.elements.push(el)
          newIds.push(el.id)
        })
        s.selectedIds = newIds
        s.isDirty = true
      })
    },

    groupSelected: () =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c || s.selectedIds.length < 2) return
        const children = c.elements.filter((e) => s.selectedIds.includes(e.id))
        if (children.length < 2) return
        const minX = Math.min(...children.map((e) => e.x))
        const minY = Math.min(...children.map((e) => e.y))
        const maxX = Math.max(...children.map((e) => e.x + e.width))
        const maxY = Math.max(...children.map((e) => e.y + e.height))
        const maxZ = Math.max(...children.map((e) => e.zIndex))
        const groupEl: CanvasElement = {
          id: generateId(),
          type: 'group',
          name: '组合',
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          rotation: 0,
          visible: true,
          locked: false,
          zIndex: maxZ,
          opacity: 1,
          children: children.map((e) => e.id),
        }
        c.elements.push(groupEl)
        s.selectedIds = [groupEl.id]
        s.isDirty = true
      }),

    ungroup: (id) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const groupEl = c.elements.find((e) => e.id === id && e.type === 'group')
        if (!groupEl || !groupEl.children) return
        c.elements = c.elements.filter((e) => e.id !== id)
        s.selectedIds = groupEl.children
        s.isDirty = true
      }),

    alignElements: (ids, align) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c || ids.length < 2) return
        const els = c.elements.filter((e) => ids.includes(e.id))
        if (els.length < 2) return
        const minX = Math.min(...els.map((e) => e.x))
        const minY = Math.min(...els.map((e) => e.y))
        const maxX = Math.max(...els.map((e) => e.x + e.width))
        const maxY = Math.max(...els.map((e) => e.y + e.height))
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        els.forEach((el) => {
          const target = c.elements.find((e) => e.id === el.id)
          if (!target) return
          switch (align) {
            case 'left':   target.x = minX; break
            case 'right':  target.x = maxX - target.width; break
            case 'center': target.x = centerX - target.width / 2; break
            case 'top':    target.y = minY; break
            case 'bottom': target.y = maxY - target.height; break
            case 'middle': target.y = centerY - target.height / 2; break
          }
        })
        s.isDirty = true
      }),

    distributeElements: (ids, axis) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c || ids.length < 3) return
        const els = c.elements
          .filter((e) => ids.includes(e.id))
          .sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y))
        if (els.length < 3) return
        const first = els[0]
        const last = els[els.length - 1]
        if (axis === 'x') {
          const totalSpace = (last.x + last.width) - first.x
          const usedWidth = els.reduce((sum, e) => sum + e.width, 0)
          const gap = (totalSpace - usedWidth) / (els.length - 1)
          let cursor = first.x + first.width + gap
          els.slice(1, -1).forEach((el) => {
            const target = c.elements.find((e) => e.id === el.id)
            if (target) { target.x = cursor; cursor += target.width + gap }
          })
        } else {
          const totalSpace = (last.y + last.height) - first.y
          const usedHeight = els.reduce((sum, e) => sum + e.height, 0)
          const gap = (totalSpace - usedHeight) / (els.length - 1)
          let cursor = first.y + first.height + gap
          els.slice(1, -1).forEach((el) => {
            const target = c.elements.find((e) => e.id === el.id)
            if (target) { target.y = cursor; cursor += target.height + gap }
          })
        }
        s.isDirty = true
      }),

    bringForward: (id) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const el = c.elements.find((e) => e.id === id)
        if (!el) return
        // 找 zIndex 比当前大的最小元素
        const next = c.elements
          .filter((e) => e.id !== id && e.zIndex > el.zIndex)
          .sort((a, b) => a.zIndex - b.zIndex)[0]
        if (next) { const tmp = next.zIndex; next.zIndex = el.zIndex; el.zIndex = tmp }
        s.isDirty = true
      }),

    sendBackward: (id) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const el = c.elements.find((e) => e.id === id)
        if (!el) return
        // 找 zIndex 比当前小的最大元素
        const prev = c.elements
          .filter((e) => e.id !== id && e.zIndex < el.zIndex)
          .sort((a, b) => b.zIndex - a.zIndex)[0]
        if (prev) { const tmp = prev.zIndex; prev.zIndex = el.zIndex; el.zIndex = tmp }
        s.isDirty = true
      }),

    bringToFront: (id) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const el = c.elements.find((e) => e.id === id)
        if (!el) return
        const maxZ = Math.max(...c.elements.map((e) => e.zIndex))
        el.zIndex = maxZ + 1
        s.isDirty = true
      }),

    sendToBack: (id) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        const el = c.elements.find((e) => e.id === id)
        if (!el) return
        c.elements.forEach((e) => { if (e.id !== id) e.zIndex += 1 })
        el.zIndex = 0
        s.isDirty = true
      }),

    setTool: (tool) => set((s) => { s.activeTool = tool }),
    setZoom: (zoom) => set((s) => { s.zoom = Math.max(0.1, Math.min(5, zoom)) }),
    setPanOffset: (offset) => set((s) => { s.panOffset = offset }),
  }))
)
