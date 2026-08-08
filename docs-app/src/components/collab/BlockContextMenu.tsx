import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorView } from 'prosemirror-view'
import { setBlockType } from 'prosemirror-commands'
import { Trash2, Copy, Heading1, Heading2, Type, Quote, Code, CheckSquare, Info } from 'lucide-react'
import { notionSchema } from '../../schema/notionSchema'
import { notionMarkdownSerializer } from '../../schema/notionSchema'

interface BlockContextMenuProps {
  view: EditorView | null
}

interface MenuItem {
  id: string
  label: string
  icon: any
  action: () => void
}

export default function BlockContextMenu({ view }: BlockContextMenuProps) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)
  const [blockPos, setBlockPos] = useState<number | null>(null)

  useEffect(() => {
    if (!view) return

    const handleContextMenu = (e: MouseEvent) => {
      const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!pos) return

      e.preventDefault()

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

      if (blockDepth === 0) return

      setBlockPos($pos.before(blockDepth))
      setCoords({ x: e.clientX, y: e.clientY })
      setShow(true)
    }

    const handleClick = () => {
      setShow(false)
    }

    const editorDom = view.dom
    editorDom.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClick)

    return () => {
      editorDom.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClick)
    }
  }, [view])

  if (!view || !show || !coords || blockPos === null) return null

  const $pos = view.state.doc.resolve(blockPos)
  let blockDepth = $pos.depth
  while (blockDepth > 0 && !$pos.node(blockDepth).isBlock) {
    blockDepth--
  }
  const blockNode = $pos.node(blockDepth)

  const deleteBlock = () => {
    const from = blockPos
    const to = blockPos + blockNode.nodeSize
    const tr = view.state.tr.delete(from, to)
    view.dispatch(tr)
    view.focus()
    setShow(false)
  }

  const copyBlock = () => {
    const from = blockPos
    const to = blockPos + blockNode.nodeSize
    const slice = view.state.doc.slice(from, to)
    // Create a temporary doc node to serialize the fragment
    const tempDoc = notionSchema.topNodeType.create(null, slice.content)
    const markdown = notionMarkdownSerializer.serialize(tempDoc)
    navigator.clipboard.writeText(markdown)
    setShow(false)
  }

  const convertTo = (nodeType: any, attrs: any = {}) => {
    return () => {
      setBlockType(nodeType, attrs)(view.state, view.dispatch, view)
      view.focus()
      setShow(false)
    }
  }

  const menuItems: MenuItem[] = [
    {
      id: 'delete',
      label: '删除块',
      icon: Trash2,
      action: deleteBlock,
    },
    {
      id: 'copy',
      label: '复制为 Markdown',
      icon: Copy,
      action: copyBlock,
    },
    {
      id: 'sep1',
      label: '',
      icon: null,
      action: () => {},
    },
    {
      id: 'to-p',
      label: '转为正文',
      icon: Type,
      action: convertTo(notionSchema.nodes.paragraph),
    },
    {
      id: 'to-h1',
      label: '转为标题 1',
      icon: Heading1,
      action: convertTo(notionSchema.nodes.heading, { level: 1 }),
    },
    {
      id: 'to-h2',
      label: '转为标题 2',
      icon: Heading2,
      action: convertTo(notionSchema.nodes.heading, { level: 2 }),
    },
    {
      id: 'to-quote',
      label: '转为引用',
      icon: Quote,
      action: () => {
        const { wrapIn } = require('prosemirror-commands')
        wrapIn(notionSchema.nodes.blockquote)(view.state, view.dispatch, view)
        view.focus()
        setShow(false)
      },
    },
    {
      id: 'to-code',
      label: '转为代码块',
      icon: Code,
      action: convertTo(notionSchema.nodes.code_block),
    },
  ]

  return createPortal(
    <div
      className="block-context-menu"
      style={{
        position: 'fixed',
        top: coords.y + 'px',
        left: coords.x + 'px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => {
        if (item.id.startsWith('sep')) {
          return <div key={item.id} className="menu-separator" />
        }
        const Icon = item.icon
        return (
          <div
            key={item.id}
            className="menu-item"
            onClick={item.action}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
