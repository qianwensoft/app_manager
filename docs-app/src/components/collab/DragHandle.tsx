import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorView } from 'prosemirror-view'
import { GripVertical } from 'lucide-react'

interface DragHandleProps {
  view: EditorView | null
}

export default function DragHandle({ view }: DragHandleProps) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [dragPos, setDragPos] = useState<number | null>(null)

  useEffect(() => {
    if (!view) return

    const handleMouseMove = (e: MouseEvent) => {
      const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!pos) {
        setShow(false)
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
        setShow(false)
        return
      }

      const blockNode = $pos.node(blockDepth)
      const blockPos = $pos.before(blockDepth)

      // 检查是否是可拖拽的块类型
      const draggableTypes = [
        'paragraph', 'heading', 'blockquote', 'code_block',
        'bullet_list', 'ordered_list', 'task_list',
        'callout', 'toggle_list', 'table', 'horizontal_rule'
      ]

      if (!draggableTypes.includes(blockNode.type.name)) {
        setShow(false)
        return
      }

      // 计算块的坐标
      const domNode = view.nodeDOM(blockPos) as HTMLElement
      if (!domNode) {
        setShow(false)
        return
      }

      const rect = domNode.getBoundingClientRect()
      const editorRect = view.dom.getBoundingClientRect()

      setCoords({
        top: rect.top,
        left: editorRect.left - 32, // 在编辑器左侧
      })
      setDragPos(blockPos)
      setShow(true)
    }

    const handleMouseLeave = () => {
      setShow(false)
    }

    const editorDom = view.dom
    editorDom.addEventListener('mousemove', handleMouseMove)
    editorDom.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      editorDom.removeEventListener('mousemove', handleMouseMove)
      editorDom.removeEventListener('mouseleave', handleMouseLeave)
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
    >
      <GripVertical size={18} />
    </div>,
    document.body
  )
}
