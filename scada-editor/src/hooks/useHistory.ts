import { useEditorStore } from '@/store/editorStore'
import type { CanvasProject } from '@/types'

const MAX_HISTORY = 50

interface HistoryState {
  past: CanvasProject[]
  future: CanvasProject[]
}

// simple in-memory history outside zustand to avoid circular deps
let _history: HistoryState = { past: [], future: [] }

export function pushHistory(project: CanvasProject) {
  _history.past.push(JSON.parse(JSON.stringify(project)))
  if (_history.past.length > MAX_HISTORY) _history.past.shift()
  _history.future = []
}

export function useHistory() {
  const store = useEditorStore()

  const canUndo = _history.past.length > 0
  const canRedo = _history.future.length > 0

  const undo = () => {
    if (!canUndo) return
    const prev = _history.past.pop()!
    _history.future.push(JSON.parse(JSON.stringify(store.project)))
    store.loadProject(store.scadaId!, prev)
  }

  const redo = () => {
    if (!canRedo) return
    const next = _history.future.pop()!
    _history.past.push(JSON.parse(JSON.stringify(store.project)))
    store.loadProject(store.scadaId!, next)
  }

  return { undo, redo, canUndo, canRedo }
}
