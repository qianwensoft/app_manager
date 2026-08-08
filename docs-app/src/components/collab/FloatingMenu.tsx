import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { toggleMark, setBlockType } from 'prosemirror-commands'
import { Bold, Italic, Code, Link2, Heading1, Heading2, Quote, Sparkles, RefreshCw, Wand2, Expand, ChevronDown } from 'lucide-react'
import { notionSchema } from '../../schema/notionSchema'
import { getToken } from '../../api/client'

interface FloatingMenuProps {
  view: EditorView | null
}

// AI 操作选项
const AI_ACTIONS = [
  { id: 'rewrite', label: '重写', icon: RefreshCw, prompt: '请重写以下内容，使其表达更清晰：' },
  { id: 'improve', label: '润色', icon: Wand2, prompt: '请润色以下内容，使其更专业流畅：' },
  { id: 'expand', label: '扩写', icon: Expand, prompt: '请扩写以下内容，添加更多细节和说明：' },
  { id: 'shorter', label: '精简', icon: ChevronDown, prompt: '请精简以下内容，保留核心要点：' },
]

function markActive(state: EditorState, type: any): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

export default function FloatingMenu({ view }: FloatingMenuProps) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [showAIMenu, setShowAIMenu] = useState(false)
  const [aiLoading, setAILoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!view) return

    const updateMenu = () => {
      const { state } = view
      const { selection } = state
      const { from, to } = selection

      // 只在非空文本选区时显示
      if (from === to || !selection.empty === false) {
        setShow(false)
        setShowAIMenu(false)
        return
      }

      // 提取选中文本
      const text = state.doc.textBetween(from, to, ' ')
      setSelectedText(text)

      // 计算选区的屏幕坐标
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)

      setCoords({
        left: (start.left + end.left) / 2,
        top: start.top - 50, // 在选区上方
      })
      setShow(true)
    }

    // 初始更新
    updateMenu()

    // 监听选区变化
    const handleUpdate = () => {
      updateMenu()
    }

    view.dom.addEventListener('mouseup', handleUpdate)
    view.dom.addEventListener('keyup', handleUpdate)

    return () => {
      view.dom.removeEventListener('mouseup', handleUpdate)
      view.dom.removeEventListener('keyup', handleUpdate)
    }
  }, [view])

  if (!view || !show || !coords) return null

  const state = view.state

  const run = (cmd: any) => {
    cmd(state, view.dispatch, view)
    view.focus()
  }

  const isBold = markActive(state, notionSchema.marks.strong)
  const isItalic = markActive(state, notionSchema.marks.em)
  const isCode = markActive(state, notionSchema.marks.code)
  const isLink = markActive(state, notionSchema.marks.link)

  const handleLink = () => {
    const href = window.prompt('链接地址 URL', '')
    if (href) {
      run(toggleMark(notionSchema.marks.link, { href }))
    }
  }

  async function handleAIAction(action: typeof AI_ACTIONS[0]) {
    if (!view || !selectedText || aiLoading) return
    
    setAILoading(true)
    setShowAIMenu(false)
    
    try {
      const resp = await fetch('/api/docs/ai/transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          action: action.id,
          text: selectedText,
          prompt: action.prompt,
        }),
      })
      
      if (!resp.ok) {
        throw new Error('AI 请求失败')
      }
      
      const data = await resp.json()
      const result = data.result || ''
      
      if (result) {
        // 替换选中内容
        const { from, to } = view.state.selection
        const tr = view.state.tr.replaceWith(
          from,
          to,
          view.state.schema.text(result)
        )
        view.dispatch(tr)
        view.focus()
      }
    } catch (err) {
      alert('AI 操作失败: ' + (err as Error).message)
    } finally {
      setAILoading(false)
      setShow(false)
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="floating-menu"
      style={{
        position: 'fixed',
        top: coords.top + 'px',
        left: coords.left + 'px',
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={'fm-btn' + (isBold ? ' active' : '')}
        title="加粗 (Ctrl+B)"
        onClick={() => run(toggleMark(notionSchema.marks.strong))}
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        className={'fm-btn' + (isItalic ? ' active' : '')}
        title="斜体 (Ctrl+I)"
        onClick={() => run(toggleMark(notionSchema.marks.em))}
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        className={'fm-btn' + (isCode ? ' active' : '')}
        title="代码"
        onClick={() => run(toggleMark(notionSchema.marks.code))}
      >
        <Code size={16} />
      </button>
      <button
        type="button"
        className={'fm-btn' + (isLink ? ' active' : '')}
        title="链接"
        onClick={handleLink}
      >
        <Link2 size={16} />
      </button>
      <span className="fm-sep" />
      <button
        type="button"
        className="fm-btn"
        title="转为标题 1"
        onClick={() => run(setBlockType(notionSchema.nodes.heading, { level: 1 }))}
      >
        <Heading1 size={16} />
      </button>
      <button
        type="button"
        className="fm-btn"
        title="转为标题 2"
        onClick={() => run(setBlockType(notionSchema.nodes.heading, { level: 2 }))}
      >
        <Heading2 size={16} />
      </button>
      <button
        type="button"
        className="fm-btn"
        title="转为引用"
        onClick={() => {
          const { wrapIn } = require('prosemirror-commands')
          run(wrapIn(notionSchema.nodes.blockquote))
        }}
      >
        <Quote size={16} />
      </button>
      <span className="fm-sep" />
      <div className="fm-ai-wrapper">
        <button
          type="button"
          className={'fm-btn fm-ai-trigger' + (showAIMenu ? ' active' : '')}
          title="AI 助手"
          disabled={aiLoading}
          onClick={() => setShowAIMenu(!showAIMenu)}
        >
          <Sparkles size={16} />
          {aiLoading ? '处理中…' : 'AI'}
        </button>
        {showAIMenu && (
          <div className="fm-ai-menu">
            {AI_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="fm-ai-item"
                onClick={() => handleAIAction(action)}
              >
                <action.icon size={14} />
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
