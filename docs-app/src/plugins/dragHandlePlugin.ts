import { Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

// 拖拽把手插件，处理块的拖放重排
export function dragHandlePlugin() {
  return new Plugin({
    props: {
      handleDOMEvents: {
        drop(view: EditorView, event: DragEvent) {
          const data = event.dataTransfer?.getData('text/plain')
          if (!data || !data.startsWith('block:')) {
            return false
          }

          event.preventDefault()

          const [, fromStr, toStr] = data.split(':')
          const from = parseInt(fromStr, 10)
          const to = parseInt(toStr, 10)

          // 计算放置位置
          const coords = { left: event.clientX, top: event.clientY }
          const dropPos = view.posAtCoords(coords)
          if (!dropPos) return true

          // 获取拖拽的节点
          const slice = view.state.doc.slice(from, to)
          
          // 删除原位置，插入新位置
          let tr = view.state.tr
          
          // 如果拖到后面，先删除再插入
          if (dropPos.pos > from) {
            tr = tr.delete(from, to)
            tr = tr.insert(dropPos.pos - (to - from), slice.content)
          } else {
            // 如果拖到前面，先插入再删除
            tr = tr.insert(dropPos.pos, slice.content)
            tr = tr.delete(from + slice.content.size, to + slice.content.size)
          }

          view.dispatch(tr)
          return true
        },

        dragover(view: EditorView, event: DragEvent) {
          // 允许拖放
          const data = event.dataTransfer?.getData('text/plain')
          if (data && data.startsWith('block:')) {
            event.preventDefault()
            event.dataTransfer!.dropEffect = 'move'
          }
          return false
        },
      },
    },
  })
}
