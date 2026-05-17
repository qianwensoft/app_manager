import { useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useHistory } from './useHistory'
import { pushHistory } from './useHistory'

export function useKeyboardShortcuts(onSave?: () => void) {
  const store = useEditorStore()
  const { undo, redo } = useHistory()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 's') { e.preventDefault(); onSave?.(); return }
      if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return }

      if (ctrl && e.key === 'a') {
        e.preventDefault()
        const canvas = store.activeCanvas()
        if (canvas) store.selectElements(canvas.elements.map((el) => el.id))
        return
      }

      // Copy / Paste / Duplicate
      if (ctrl && e.key === 'c') { e.preventDefault(); store.copySelected(); return }
      if (ctrl && e.key === 'v') { e.preventDefault(); pushHistory(store.project); store.paste(); return }
      if (ctrl && e.key === 'd') { e.preventDefault(); pushHistory(store.project); store.duplicateSelected(); return }

      // Group / Ungroup
      if (ctrl && !e.shiftKey && e.key === 'g') {
        e.preventDefault()
        pushHistory(store.project)
        store.groupSelected()
        return
      }
      if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        if (store.selectedIds.length === 1) {
          pushHistory(store.project)
          store.ungroup(store.selectedIds[0])
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedIds.length > 0) {
          pushHistory(store.project)
          store.deleteElements(store.selectedIds)
          store.clearSelection()
        }
        return
      }

      if (e.key === 'Escape') { store.clearSelection(); store.setTool('select'); return }

      // Arrow keys nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const canvas = store.activeCanvas()
        if (!canvas) return
        store.selectedIds.forEach((id) => {
          const el = canvas.elements.find((e) => e.id === id)
          if (el) store.moveElement(id, el.x + dx, el.y + dy)
        })
        return
      }

      // Tool shortcuts (no ctrl)
      const toolMap: Record<string, string> = {
        v: 'select', r: 'rect', c: 'circle', l: 'line', t: 'text', b: 'button',
      }
      if (!ctrl && toolMap[e.key]) {
        store.setTool(toolMap[e.key] as any)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store, undo, redo])
}
