import { useRef, useState } from 'react'
import { Send, X, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getToken } from '../api/client'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

interface AIPanelProps {
  docTitle?: string
  docText?: string
  selection?: string
  onClose: () => void
}

const QUICK_PROMPTS = [
  { label: '总结全文', text: '请对当前文档进行简洁的总结。' },
  { label: '润色选区', text: '请润色我选中的文本，使其更专业流畅。' },
  { label: '生成测试用例', text: '请基于当前文档内容生成测试用例（Markdown 表格）。' },
]

export default function AIPanel({ docTitle, docText, selection, onClose }: AIPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setInput('')
    setBusy(true)
    scrollToBottom()

    // 追加空 assistant 占位，流式填充。
    setMessages((m) => [...m, { role: 'assistant', content: '' }])

    try {
      const resp = await fetch('/api/docs/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          doc_title: docTitle,
          doc_text: docText,
          selection,
        }),
      })
      if (!resp.ok || !resp.body) {
        throw new Error('AI 请求失败（' + resp.status + '）')
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n')
          let event = 'message'
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          try {
            const parsed = JSON.parse(data)
            if (event === 'delta' && parsed.text) {
              setMessages((m) => {
                const copy = [...m]
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: copy[copy.length - 1].content + parsed.text,
                }
                return copy
              })
              scrollToBottom()
            } else if (event === 'error') {
              throw new Error(parsed.message || 'AI 出错')
            }
          } catch {
            /* 单段解析失败忽略 */
          }
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'assistant', content: '⚠️ ' + (e as Error).message }
        return copy
      })
    } finally {
      setBusy(false)
      scrollToBottom()
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} /> AI 助手
        </span>
        <button className="btn icon" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUICK_PROMPTS.map((q) => (
          <button key={q.label} className="btn" style={{ fontSize: 12 }} disabled={busy} onClick={() => send(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-hint" style={{ marginTop: 20, fontSize: 13 }}>
            向 AI 提问，或使用上方快捷指令。
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'ai-msg ' + m.role}>
            {m.role === 'assistant' ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || '思考中…'}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
          </div>
        ))}
      </div>
      <div className="ai-input">
        <textarea
          rows={2}
          value={input}
          placeholder="输入问题，Enter 发送"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <button className="btn primary" disabled={busy} onClick={() => send(input)}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
