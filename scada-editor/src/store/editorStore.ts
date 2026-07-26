import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CanvasData, CanvasElement, CanvasProject, DrawingTool, AlignType } from '@/types'
import type { ScadaWorkflow, WorkflowLib } from '@/types/workflow'
import { generateId } from '@/utils/canvas'

const MAIN_CANVAS_ID = 100001

// 将选中的根元素展开为「根 + 组合内所有后代」的完整集合（递归、去重），
// 以便复制/粘贴/再制组合时连同其子元素一起处理。
function expandWithChildren(all: CanvasElement[], roots: CanvasElement[]): CanvasElement[] {
  const byId = new Map(all.map((e) => [e.id, e]))
  const out = new Map<string, CanvasElement>()
  const visit = (el: CanvasElement) => {
    if (out.has(el.id)) return
    out.set(el.id, el)
    if (el.type === 'group' && el.children) {
      for (const cid of el.children) {
        const child = byId.get(cid)
        if (child) visit(child)
      }
    }
  }
  roots.forEach(visit)
  return [...out.values()]
}

// 克隆一组元素：分配新 id、按偏移平移、重排 zIndex，并把组合的 children 重映射到新 id。
// 返回克隆结果与「根 id」（集合内未被任何组合引用的元素）供粘贴后选中。
function cloneWithRemap(
  sources: CanvasElement[],
  offset: number,
  baseZ: number,
): { clones: CanvasElement[]; rootIds: string[] } {
  const srcIds = new Set(sources.map((s) => s.id))
  const idMap = new Map<string, string>()
  sources.forEach((s) => idMap.set(s.id, generateId()))

  // 按原 zIndex 升序克隆，保持层叠顺序
  const ordered = [...sources].sort((a, b) => a.zIndex - b.zIndex)
  const clones = ordered.map((src, i) => {
    const clone: CanvasElement = JSON.parse(JSON.stringify(src))
    clone.id = idMap.get(src.id)!
    clone.x = src.x + offset
    clone.y = src.y + offset
    clone.zIndex = baseZ + i + 1
    if (clone.children) {
      clone.children = clone.children
        .filter((cid) => srcIds.has(cid))
        .map((cid) => idMap.get(cid)!)
    }
    return clone
  })

  const referenced = new Set<string>()
  sources.forEach((s) => {
    if (s.type === 'group' && s.children) {
      s.children.forEach((cid) => { if (srcIds.has(cid)) referenced.add(cid) })
    }
  })
  const rootIds = sources.filter((s) => !referenced.has(s.id)).map((s) => idMap.get(s.id)!)
  return { clones, rootIds }
}

// 清理组合的悬空引用与空组合：从每个组合的 children 中移除已不存在的元素；
// children 变空的组合本身删除，并级联（父组合可能因此再变空）。就地修改 c.elements。
function pruneGroups(c: CanvasData): void {
  let changed = true
  while (changed) {
    changed = false
    const present = new Set(c.elements.map((e) => e.id))
    for (const el of c.elements) {
      if (el.type === 'group' && el.children) {
        const filtered = el.children.filter((cid) => present.has(cid))
        if (filtered.length !== el.children.length) {
          el.children = filtered
          changed = true
        }
      }
    }
    const emptyIds = new Set(
      c.elements.filter((e) => e.type === 'group' && (!e.children || e.children.length === 0)).map((e) => e.id),
    )
    if (emptyIds.size) {
      c.elements = c.elements.filter((e) => !emptyIds.has(e.id))
      changed = true
    }
  }
}

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
  fitCanvasToContent: (id: number, padding?: number) => void

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
  /** 按图层面板显示顺序（前=顶层）重排 zIndex */
  reorderLayersByDisplay: (displayOrder: string[]) => void

  // actions - editor
  setTool: (tool: DrawingTool) => void
  setZoom: (zoom: number) => void
  setPanOffset: (offset: { x: number; y: number }) => void

  // actions - workflows（随 canvas_data 持久化）
  addWorkflow: (wf: ScadaWorkflow) => void
  updateWorkflow: (id: string, updates: Partial<ScadaWorkflow>) => void
  deleteWorkflow: (id: string) => void
  duplicateWorkflow: (id: string) => void
  setWorkflowLibs: (libs: WorkflowLib[]) => void

  // ui prefs — persisted to localStorage
  liveDataOn: boolean
  toggleLiveData: () => void
  layerCollapsed: boolean
  toggleLayerCollapsed: () => void
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
    liveDataOn: localStorage.getItem('scada:liveDataOn') === 'true',
    layerCollapsed: localStorage.getItem('scada:layerCollapsed') === 'true',
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
      set((s) => {
        s.scadaId = scadaId
        s.project = project
        // 清理历史数据中遗留的空组合 / 悬空引用（此前删除子元素未同步维护组合）
        Object.values(s.project.canvases).forEach((c) => c && pruneGroups(c))
        s.isDirty = false
      }),

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

    fitCanvasToContent: (id, padding = 20) =>
      set((s) => {
        const c = s.project.canvases[id]
        if (!c || !c.elements.length) return
        const maxX = Math.max(...c.elements.map((e) => e.x + e.width))
        const maxY = Math.max(...c.elements.map((e) => e.y + e.height))
        c.width = Math.max(1, maxX + padding)
        c.height = Math.max(1, maxY + padding)
        s.isDirty = true
      }),

    addElement: (el) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (c) {
          c.elements.push(el)
          s.isDirty = true
          if (c.adaptiveMode === 'fit' && c.elements.length) {
            const pad = 20
            c.width = Math.max(c.width, Math.max(...c.elements.map((e) => e.x + e.width)) + pad)
            c.height = Math.max(c.height, Math.max(...c.elements.map((e) => e.y + e.height)) + pad)
          }
        }
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
        if (c.adaptiveMode === 'fit' && c.elements.length) {
          const pad = 20
          c.width = Math.max(...c.elements.map((e) => e.x + e.width)) + pad
          c.height = Math.max(...c.elements.map((e) => e.y + e.height)) + pad
        }
      }),

    deleteElements: (ids) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c) return
        c.elements = c.elements.filter((e) => !ids.includes(e.id))
        // 从组合 children 中移除被删元素，并清理由此变空的组合（级联），避免残留空组合渲染成蓝色小框
        pruneGroups(c)
        const present = new Set(c.elements.map((e) => e.id))
        s.selectedIds = s.selectedIds.filter((id) => present.has(id))
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
        if (c.adaptiveMode === 'fit' && c.elements.length) {
          const pad = 20
          c.width = Math.max(...c.elements.map((e) => e.x + e.width)) + pad
          c.height = Math.max(...c.elements.map((e) => e.y + e.height)) + pad
        }
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
      const roots = c.elements.filter((e) => selectedIds.includes(e.id))
      // 组合需连同其后代一起复制，否则粘贴出的组合会丢失子元素
      const els = expandWithChildren(c.elements, roots)
      set((s) => { s._clipboard = JSON.parse(JSON.stringify(els)) })
    },

    paste: () =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c || s._clipboard.length === 0) return
        const maxZ = c.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
        const { clones, rootIds } = cloneWithRemap(s._clipboard, 20, maxZ)
        clones.forEach((el) => c.elements.push(el))
        s.selectedIds = rootIds
        s.isDirty = true
      }),

    duplicateSelected: () => {
      const { selectedIds, activeCanvas } = get()
      const c = activeCanvas()
      if (!c || selectedIds.length === 0) return
      const roots = c.elements.filter((e) => selectedIds.includes(e.id))
      const els = expandWithChildren(c.elements, roots)
      set((s) => {
        const canvas = s.project.canvases[s.project.activeCanvasId]
        if (!canvas) return
        const maxZ = canvas.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
        const { clones, rootIds } = cloneWithRemap(els, 20, maxZ)
        clones.forEach((el) => canvas.elements.push(el))
        s.selectedIds = rootIds
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

    reorderLayersByDisplay: (displayOrder) =>
      set((s) => {
        const c = s.project.canvases[s.project.activeCanvasId]
        if (!c || displayOrder.length < 2) return
        const zPool = displayOrder
          .map((id) => c.elements.find((e) => e.id === id))
          .filter((e): e is CanvasElement => !!e)
          .map((e) => e.zIndex)
          .sort((a, b) => b - a)
        displayOrder.forEach((id, i) => {
          const el = c.elements.find((e) => e.id === id)
          if (el && zPool[i] !== undefined) el.zIndex = zPool[i]
        })
        s.isDirty = true
      }),

    addWorkflow: (wf) =>
      set((s) => {
        if (!s.project.workflows) s.project.workflows = []
        s.project.workflows.push(wf)
        s.isDirty = true
      }),

    updateWorkflow: (id, updates) =>
      set((s) => {
        const list = s.project.workflows
        if (!list) return
        const idx = list.findIndex((w) => w.id === id)
        if (idx < 0) return
        Object.assign(list[idx], updates)
        s.isDirty = true
      }),

    deleteWorkflow: (id) =>
      set((s) => {
        if (!s.project.workflows) return
        s.project.workflows = s.project.workflows.filter((w) => w.id !== id)
        s.isDirty = true
      }),

    duplicateWorkflow: (id) =>
      set((s) => {
        const list = s.project.workflows
        if (!list) return
        const src = list.find((w) => w.id === id)
        if (!src) return
        const copy: ScadaWorkflow = JSON.parse(JSON.stringify(src))
        copy.id = generateId()
        copy.name = `${src.name || '工作流'} 副本`
        list.push(copy)
        s.isDirty = true
      }),

    setWorkflowLibs: (libs) =>
      set((s) => { s.project.workflowLibs = libs; s.isDirty = true }),

    setTool: (tool) => set((s) => { s.activeTool = tool }),
    setZoom: (zoom) => set((s) => { s.zoom = Math.max(0.1, Math.min(5, zoom)) }),
    setPanOffset: (offset) => set((s) => { s.panOffset = offset }),
    toggleLiveData: () => set((s) => {
      const next = !s.liveDataOn
      s.liveDataOn = next
      localStorage.setItem('scada:liveDataOn', String(next))
    }),
    toggleLayerCollapsed: () => set((s) => {
      const next = !s.layerCollapsed
      s.layerCollapsed = next
      localStorage.setItem('scada:layerCollapsed', String(next))
    }),
  }))
)
