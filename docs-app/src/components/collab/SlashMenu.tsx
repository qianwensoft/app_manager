import { useEffect, useState, useRef } from 'react'
import { EditorView } from 'prosemirror-view'
import { 
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Quote, Code, Minus, Table, ChevronRight, Info, AlertTriangle,
  AlertCircle, CheckCircle, type LucideIcon
} from 'lucide-react'
import { notionSchema } from '../../schema/notionSchema'
import { setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'

interface MenuItem {
  id: string
  title: string
  description: string
  icon: LucideIcon
  keywords: string[]
  action: (view: EditorView) => boolean
}

interface SlashMenuProps {
  view: EditorView
  pos: number
  query: string
  onClose: () => void
}

export default function SlashMenu({ view, pos, query, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  // 定义所有菜单项
  const allItems: MenuItem[] = [
    {
      id: 'paragraph',
      title: '正文',
      description: '普通段落文本',
      icon: ChevronRight,
      keywords: ['text', 'paragraph', 'p', '正文', '段落'],
      action: (view) => setBlockType(notionSchema.nodes.paragraph)(view.state, view.dispatch),
    },
    {
      id: 'h1',
      title: '标题 1',
      description: '大号标题',
      icon: Heading1,
      keywords: ['heading', 'h1', 'title', '标题', '一级'],
      action: (view) => setBlockType(notionSchema.nodes.heading, { level: 1 })(view.state, view.dispatch),
    },
    {
      id: 'h2',
      title: '标题 2',
      description: '中号标题',
      icon: Heading2,
      keywords: ['heading', 'h2', '标题', '二级'],
      action: (view) => setBlockType(notionSchema.nodes.heading, { level: 2 })(view.state, view.dispatch),
    },
    {
      id: 'h3',
      title: '标题 3',
      description: '小号标题',
      icon: Heading3,
      keywords: ['heading', 'h3', '标题', '三级'],
      action: (view) => setBlockType(notionSchema.nodes.heading, { level: 3 })(view.state, view.dispatch),
    },
    {
      id: 'bullet',
      title: '无序列表',
      description: '创建简单的项目符号列表',
      icon: List,
      keywords: ['bullet', 'list', 'ul', '列表', '无序'],
      action: (view) => wrapInList(notionSchema.nodes.bullet_list)(view.state, view.dispatch),
    },
    {
      id: 'ordered',
      title: '有序列表',
      description: '创建编号列表',
      icon: ListOrdered,
      keywords: ['ordered', 'numbered', 'list', 'ol', '列表', '有序', '编号'],
      action: (view) => wrapInList(notionSchema.nodes.ordered_list)(view.state, view.dispatch),
    },
    {
      id: 'task',
      title: '任务列表',
      description: '可勾选的待办事项',
      icon: CheckSquare,
      keywords: ['todo', 'task', 'checkbox', '任务', '待办', '清单'],
      action: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const taskItem = notionSchema.nodes.task_item.create({ checked: false }, state.schema.nodes.paragraph.create())
        const taskList = notionSchema.nodes.task_list.create(null, taskItem)
        const tr = state.tr.replaceSelectionWith(taskList)
        dispatch(tr)
        return true
      },
    },
    {
      id: 'quote',
      title: '引用',
      description: '创建引用块',
      icon: Quote,
      keywords: ['quote', 'blockquote', '引用', '引述'],
      action: (view) => wrapIn(notionSchema.nodes.blockquote)(view.state, view.dispatch),
    },
    {
      id: 'code',
      title: '代码块',
      description: '插入代码片段',
      icon: Code,
      keywords: ['code', 'codeblock', '代码'],
      action: (view) => setBlockType(notionSchema.nodes.code_block)(view.state, view.dispatch),
    },
    {
      id: 'divider',
      title: '分割线',
      description: '插入水平分割线',
      icon: Minus,
      keywords: ['divider', 'hr', 'line', '分割', '分隔'],
      action: (view) => {
        const { state, dispatch } = view
        const hr = notionSchema.nodes.horizontal_rule.create()
        dispatch(state.tr.replaceSelectionWith(hr))
        return true
      },
    },
    {
      id: 'table',
      title: '表格',
      description: '插入 3x3 表格',
      icon: Table,
      keywords: ['table', 'grid', '表格'],
      action: (view) => {
        const { state, dispatch } = view
        const { table, table_row, table_cell } = notionSchema.nodes
        
        // 创建 3x3 表格
        const cells = []
        for (let i = 0; i < 3; i++) {
          cells.push(table_cell.create(null, state.schema.nodes.paragraph.create()))
        }
        const rows = []
        for (let i = 0; i < 3; i++) {
          rows.push(table_row.create(null, cells))
        }
        const tableNode = table.create(null, rows)
        
        dispatch(state.tr.replaceSelectionWith(tableNode))
        return true
      },
    },
    {
      id: 'toggle',
      title: '折叠块',
      description: '可展开/收起的内容块',
      icon: ChevronRight,
      keywords: ['toggle', 'collapse', 'details', '折叠', '展开'],
      action: (view) => {
        const { state, dispatch } = view
        const { toggle_item, toggle_summary, toggle_content, paragraph } = notionSchema.nodes
        
        const summary = toggle_summary.create(null, state.schema.text('折叠标题'))
        const content = toggle_content.create(null, paragraph.create())
        const toggle = toggle_item.create({ open: true }, [summary, content])
        const toggleList = notionSchema.nodes.toggle_list.create(null, toggle)
        
        dispatch(state.tr.replaceSelectionWith(toggleList))
        return true
      },
    },
    {
      id: 'info',
      title: '信息提示',
      description: '蓝色信息框',
      icon: Info,
      keywords: ['callout', 'info', 'note', '提示', '信息'],
      action: (view) => {
        const { state, dispatch } = view
        const callout = notionSchema.nodes.callout.create(
          { type: 'info' },
          state.schema.nodes.paragraph.create()
        )
        dispatch(state.tr.replaceSelectionWith(callout))
        return true
      },
    },
    {
      id: 'warning',
      title: '警告提示',
      description: '黄色警告框',
      icon: AlertTriangle,
      keywords: ['callout', 'warning', 'caution', '警告', '注意'],
      action: (view) => {
        const { state, dispatch } = view
        const callout = notionSchema.nodes.callout.create(
          { type: 'warning' },
          state.schema.nodes.paragraph.create()
        )
        dispatch(state.tr.replaceSelectionWith(callout))
        return true
      },
    },
    {
      id: 'error',
      title: '错误提示',
      description: '红色错误框',
      icon: AlertCircle,
      keywords: ['callout', 'error', 'danger', '错误', '危险'],
      action: (view) => {
        const { state, dispatch } = view
        const callout = notionSchema.nodes.callout.create(
          { type: 'error' },
          state.schema.nodes.paragraph.create()
        )
        dispatch(state.tr.replaceSelectionWith(callout))
        return true
      },
    },
    {
      id: 'success',
      title: '成功提示',
      description: '绿色成功框',
      icon: CheckCircle,
      keywords: ['callout', 'success', 'tip', '成功', '提示'],
      action: (view) => {
        const { state, dispatch } = view
        const callout = notionSchema.nodes.callout.create(
          { type: 'success' },
          state.schema.nodes.paragraph.create()
        )
        dispatch(state.tr.replaceSelectionWith(callout))
        return true
      },
    },
  ]

  // 根据查询过滤菜单项
  const filteredItems = query
    ? allItems.filter((item) => {
        const q = query.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.keywords.some((kw) => kw.includes(q))
        )
      })
    : allItems

  // 计算菜单位置
  useEffect(() => {
    const coordsAtPos = view.coordsAtPos(pos)
    setCoords({
      top: coordsAtPos.bottom + 4,
      left: coordsAtPos.left,
    })
  }, [view, pos])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filteredItems.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filteredItems.length) % filteredItems.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        selectItem(filteredItems[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, filteredItems])

  // 选中重置
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 滚动到选中项
  useEffect(() => {
    const selected = menuRef.current?.children[selectedIndex] as HTMLElement
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const selectItem = (item: MenuItem) => {
    // 删除触发斜杠的文本
    const { state, dispatch } = view
    const from = pos - query.length - 1 // -1 for the '/' character
    const to = pos
    const tr = state.tr.delete(from, to)
    dispatch(tr)

    // 执行命令
    setTimeout(() => {
      item.action(view)
      view.focus()
      onClose()
    }, 0)
  }

  if (!coords || filteredItems.length === 0) return null

  return (
    <div
      className="slash-menu"
      ref={menuRef}
      style={{
        position: 'fixed',
        top: coords.top + 'px',
        left: coords.left + 'px',
      }}
    >
      {filteredItems.map((item, index) => {
        const Icon = item.icon
        return (
          <div
            key={item.id}
            className={'slash-menu-item' + (index === selectedIndex ? ' selected' : '')}
            onClick={() => selectItem(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="slash-menu-icon">
              <Icon size={18} />
            </div>
            <div className="slash-menu-text">
              <div className="slash-menu-title">{item.title}</div>
              <div className="slash-menu-desc">{item.description}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
