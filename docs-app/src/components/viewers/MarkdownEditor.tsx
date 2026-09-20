import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { Users } from 'lucide-react'
import ProseMirrorEditor from '../collab/ProseMirrorEditor'
import { useYjsCollab } from '../../hooks/useYjsCollab'
import { fetchContent, saveContent, fetchSharedContent, initialsOf, fetchNodes } from '../../api/documents'

// MarkdownEditor：文档 Markdown 协同编辑器。
// 底座为 prosemirror-markdown + y-prosemirror 绑定 Y.XmlFragment，外加与后端的 Markdown 拉取/保存链路。
// 块结构由 Puck 改为单块直接渲染——文档管理面向 Markdown 富文本而非多组件布局，
// 单块足以承载整篇内容，且与 Markdown 原子性更匹配（保存时整篇序列化）。
interface MarkdownEditorProps {
  nodeId: number
  canEdit: boolean
  onSelectionChange?: (text: string) => void
  /** 免登录分享模式：跳过协同编辑，渲染只读 Markdown */
  shareMode?: boolean
  shareToken?: string
  projectCode?: string
}

const DEFAULT_FRAGMENT_KEY = 'pm-primary'

export default function MarkdownEditor({ nodeId, canEdit, onSelectionChange, shareMode, shareToken, projectCode }: MarkdownEditorProps) {
  // 分享模式：跳过 Yjs 协同，直接渲染只读 Markdown。
  if (shareMode && shareToken && projectCode) {
    return <SharedMarkdownView nodeId={nodeId} projectCode={projectCode} shareToken={shareToken} />
  }

  const { ydoc, provider, connected } = useYjsCollab(nodeId)
  const [saving, setSaving] = useState(false)
  const [participants, setParticipants] = useState<Array<{ id: number; name: string; color: string }>>([])
  const latestMdRef = useRef<string>('')

  // 拉取后端已保存内容作为种子（协同为空时注入）。
  const { data: initialMarkdown = '', isLoading } = useQuery({
    queryKey: ['doc-content', nodeId],
    queryFn: () => fetchContent(nodeId),
    enabled: !!ydoc && !!provider,
  })

  // 拉取文档树用于链接选择器
  const { data: docNodes = [] } = useQuery({
    queryKey: ['doc-nodes'],
    queryFn: fetchNodes,
  })

  // 节点切换或卸载时清空最新 Markdown 缓存，避免错位。
  useEffect(() => {
    latestMdRef.current = ''
    setParticipants([])
  }, [nodeId])

  // 订阅 awareness 变化：列出当前所有协同者（含自己），按 clientID 聚合。
  // 颜色取 awareness.user.color（与光标同色），名字缩写显示在头像里。
  useEffect(() => {
    if (!provider) return
    const aw = provider.awareness
    const refresh = () => {
      const states = aw.getStates() as Map<number, any>
      const seen = new Set<string>()
      const out: Array<{ id: number; name: string; color: string }> = []
      states.forEach((state, clientId) => {
        const u = state?.user
        if (!u || !u.name) return
        const key = String(u.name)
        // 同一用户名（同一用户多端登录）只保留首个 client。
        if (seen.has(key)) return
        seen.add(key)
        out.push({
          id: clientId,
          name: String(u.name),
          color: typeof u.color === 'string' ? u.color : '#888',
        })
      })
      setParticipants(out)
    }
    refresh()
    aw.on('change', refresh)
    return () => {
      aw.off('change', refresh)
    }
  }, [provider])

  async function handlePublish() {
    if (!canEdit) return
    const md = latestMdRef.current
    if (!md.trim()) return
    setSaving(true)
    try {
      await saveContent(nodeId, md, '协同保存')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !ydoc || !provider) {
    return <div className="md-editor-loading">加载文档中…</div>
  }

  return (
    <div className="md-editor">
      <div className="md-editor-status">
        <span className={'collab-dot' + (connected ? ' on' : '')} />
        <Users size={14} />
        <span>{connected ? '协同已连接' : '连接中…'}</span>
        {connected && participants.length > 0 && (
          <>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              ({participants.length} 人)
            </span>
            <div className="md-editor-participants" aria-label="当前协同成员">
              {participants.map((p) => (
                <span
                  key={p.id}
                  className="md-editor-avatar"
                  style={{ background: p.color }}
                  title={p.name}
                >
                  {initialsOf(p.name)}
                </span>
              ))}
            </div>
          </>
        )}
        {canEdit && (
          <button
            type="button"
            className="md-editor-publish"
            disabled={saving}
            onClick={handlePublish}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        )}
      </div>
      <div className="md-editor-body">
        <ProseMirrorEditor
          ydoc={ydoc}
          provider={provider}
          fragmentKey={DEFAULT_FRAGMENT_KEY}
          canEdit={canEdit}
          initialMarkdown={initialMarkdown}
          docNodes={docNodes}
          onMarkdownChange={(_key, md) => {
            latestMdRef.current = md
          }}
          onSelectionChange={onSelectionChange}
        />
      </div>
    </div>
  )
}

// SharedMarkdownView：分享模式下的只读 Markdown 视图。
// 不进入 Yjs 协同，直接拉取已发布的 Markdown 内容并渲染。
function SharedMarkdownView({ nodeId, projectCode, shareToken }: { nodeId: number; projectCode: string; shareToken: string }) {
  const { data: md = '', isLoading } = useQuery({
    queryKey: ['doc-shared-content', nodeId, shareToken],
    queryFn: () => fetchSharedContent(nodeId, projectCode, shareToken),
  })

  if (isLoading) return <div className="md-editor-loading">加载文档中…</div>

  return (
    <div className="md-editor md-editor-shared">
      <div className="md-editor-body" style={{ padding: '16px 20px' }}>
        {md.trim() ? (
          <ReactMarkdown>{md}</ReactMarkdown>
        ) : (
          <div className="empty-hint">该文档暂无内容</div>
        )}
      </div>
    </div>
  )
}