import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorView } from 'prosemirror-view'
import { GripVertical } from 'lucide-react'

interface DragHandleProps {
  view: EditorView | null
}

// 鼠标从编辑器内部跨到左侧外置把手时存在视觉缝隙（约 8px），必须延迟隐藏，
// 否则 view.dom 的 mouseleave 会瞬间触发 setShow(false) 让把手消失，根本到不了。
// Notion / Tiptap 都采用同样的延迟隐藏 + 把手自身接管 hover 模式。
const HIDE_DELAY_MS = 150

export default function DragHandle({ view }: DragHandleProps) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [dragPos, setDragPos] = useState<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  function clearHideTimer() {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  function scheduleHide() {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      setShow(false)
      hideTimerRef.current = null
    }, HIDE_DELAY_MS)
  }

  useEffect(() => {
    if (!view) return

    const handleMouseMove = (e: MouseEvent) => {
      const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!pos) {
        scheduleHide()
        return
      }

      const $pos = view.state.doc.resolve(pos.pos)

      // 查找块级节点
      let blockDepth = $pos.depth
      while (blockDepth > 0) {
        const node = $pos.node(blockDepth)
        if (node.isBlock && node.type.name !== 'doc') {
          break
        }
        blockDepth--
      }

      if (blockDepth === 0) {
        scheduleHide()
        return
      }

      const blockNode = $pos.node(blockDepth)
      const blockPos = $pos.before(blockDepth)

      // 检查是否是可拖拽的块类型
      const draggableTypes = [
        'paragraph', 'heading', 'blockquote', 'code_block',
        'bullet_list', 'ordered_list', 'task_list',
        'callout', 'toggle_list', 'table', 'horizontal_rule',
      ]

      if (!draggableTypes.includes(blockNode.type.name)) {
        scheduleHide()
        return
      }

      // 计算块的坐标
      const domNode = view.nodeDOM(blockPos) as HTMLElement
      if (!domNode) {
        scheduleHide()
        return
      }

      const rect = domNode.getBoundingClientRect()
      const editorRect = view.dom.getBoundingClientRect()

      setCoords({
        top: rect.top,
        left: editorRect.left - 32, // 在编辑器左侧
      })
      setDragPos(blockPos)
      clearHideTimer()
      setShow(true)
    }

    const handleEditorMouseEnter = () => {
      // 鼠标重新进入编辑器：取消任何待执行的隐藏
      clearHideTimer()
    }

    const handleEditorMouseLeave = (e: MouseEvent) => {
      // 如果鼠标离开后进入了把手自身，handle 的 mouseenter 会取消定时器；
      // 否则延迟 HIDE_DELAY_MS 后再隐藏，给鼠标留出跨过 8px 缝隙的时间。
      const related = e.relatedTarget as HTMLElement | null
      if (related && related.closest && related.closest('.drag-handle')) {
        return
      }
      scheduleHide()
    }

    const editorDom = view.dom
    editorDom.addEventListener('mousemove', handleMouseMove)
    editorDom.addEventListener('mouseenter', handleEditorMouseEnter)
    editorDom.addEventListener('mouseleave', handleEditorMouseLeave)

    return () => {
      clearHideTimer()
      editorDom.removeEventListener('mousemove', handleMouseMove)
      editorDom.removeEventListener('mouseenter', handleEditorMouseEnter)
      editorDom.removeEventListener('mouseleave', handleEditorMouseLeave)
    }
  }, [view])

  const handleDragStart = (e: React.DragEvent) => {
    if (!view || dragPos === null) return

    const $pos = view.state.doc.resolve(dragPos)
    let blockDepth = $pos.depth
    while (blockDepth > 0 && !$pos.node(blockDepth).isBlock) {
      blockDepth--
    }

    const node = $pos.node(blockDepth)
    const from = dragPos
    const to = from + node.nodeSize

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `block:${from}:${to}`)

    // 添加拖拽视觉效果
    const dragImage = document.createElement('div')
    dragImage.className = 'drag-ghost'
    dragImage.textContent = '⋮⋮ 移动块'
    dragImage.style.position = 'absolute'
    dragImage.style.left = '-1000px'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }

  const handleDragEnd = () => {
    setShow(false)
    clearHideTimer()
  }

  const handleHandleMouseEnter = () => {
    // 鼠标进入把手：取消任何待执行的隐藏，让用户可以正常点击/拖拽
    clearHideTimer()
  }

  const handleHandleMouseLeave = () => {
    // 鼠标离开把手：立即隐藏（如果鼠标回到编辑器，editor mouseenter 会重新显示）
    clearHideTimer()
    setShow(false)
  }

  if (!view || !show || !coords) return null

  return createPortal(
    <div
      className="drag-handle"
      style={{
        position: 'fixed',
        top: coords.top + 'px',
        left: coords.left + 'px',
      }}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleHandleMouseEnter}
      onMouseLeave={handleHandleMouseLeave}
    >
      <GripVertical size={18} />
    </div>,
    document.body,
  )
}
