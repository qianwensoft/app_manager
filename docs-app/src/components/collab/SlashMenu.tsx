import { useEffect, useState, useRef } from 'react'
import { EditorView } from 'prosemirror-view'
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Minus, Table, ChevronRight, Info, AlertTriangle,
  AlertCircle, CheckCircle, PanelsTopLeft, MonitorPlay, type LucideIcon
} from 'lucide-react'
import { notionSchema } from '../../schema/notionSchema'
import { setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { api } from '../../api/client'
import type { SlashMenuState } from '../../plugins/slashMenuPlugin'

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
  pluginState: SlashMenuState
  onClose: () => void
  documentContext?: { globalContext?: Record<string, any>; pageContext?: Record<string, any> }
}

type EmbedDraft = {
  kind: 'form-app' | 'scada'
  formCode: string
  pageKey: string
  shareToken: string
  params: string
  globalContext: string
  pageContext: string
}

function EmbedModal({ initialKind, onClose, onInsert }: { initialKind: 'form-app' | 'scada'; onClose: () => void; onInsert: (kind: string, config: Record<string, any>) => void }) {
  const [apps, setApps] = useState<any[]>([])
  const [scadas, setScadas] = useState<any[]>([])
  const [pages, setPages] = useState<any[]>([])
  const [draft, setDraft] = useState<EmbedDraft>({ kind: initialKind, formCode: '', pageKey: '', shareToken: '', params: '{}', globalContext: '{}', pageContext: '{}' })
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/form-app/infos').then(r => setApps(r.data?.data || [])).catch(() => setApps([]))
    api.get('/scada/infos').then(r => setScadas((r.data?.data || []).filter((s: any) => s.publish_status === 1 && s.share_token))).catch(() => setScadas([]))
  }, [])
  useEffect(() => {
    const app = apps.find(a => a.code === draft.formCode)
    if (!app?.id) { setPages([]); return }
    api.get(`/form-app/infos/${app.id}/pages`).then(r => setPages(r.data?.data || [])).catch(() => setPages([]))
  }, [apps, draft.formCode])

  const update = (key: keyof EmbedDraft, value: string) => setDraft(d => ({ ...d, [key]: value }))
  function submit() {
    try {
      const params = JSON.parse(draft.params || '{}')
      const globalContext = JSON.parse(draft.globalContext || '{}')
      const pageContext = JSON.parse(draft.pageContext || '{}')
      if (!draft.kind || (draft.kind === 'form-app' && !draft.formCode.trim()) || (draft.kind === 'scada' && !draft.shareToken.trim())) throw new Error('请填写嵌入目标')
      onInsert(draft.kind, { formCode: draft.formCode.trim(), pageKey: draft.pageKey.trim(), shareToken: draft.shareToken.trim(), params, globalContext, pageContext })
    } catch (e: any) { setError(e.message || '参数 JSON 格式不正确') }
  }
  return <div className="doc-embed-modal-backdrop" onMouseDown={onClose}>
    <div className="doc-embed-modal" onMouseDown={e => e.stopPropagation()}>
      <h3>插入嵌入内容</h3>
      <label>类型<select value={draft.kind} onChange={e => update('kind', e.target.value)}><option value="form-app">form-app 页面</option><option value="scada">已发布组态</option></select></label>
      {draft.kind === 'form-app' ? <>
        <label>form-app<select value={draft.formCode} onChange={e => update('formCode', e.target.value)}><option value="">请选择</option>{apps.map(a => <option key={a.id} value={a.code}>{a.name || a.code}（{a.code}）</option>)}</select></label>
        <label>页面<select value={draft.pageKey} onChange={e => update('pageKey', e.target.value)}><option value="">默认入口页</option>{pages.map(p => <option key={p.id} value={p.page_key}>{p.name || p.page_key}（{p.page_key}）</option>)}</select></label>
      </> : <>
        <label>已发布组态<select value={draft.shareToken} onChange={e => update('shareToken', e.target.value)}><option value="">请选择</option>{scadas.map(s => <option key={s.id} value={s.share_token}>{s.scada_name || s.scada_code}</option>)}</select></label>
        <label>分享 Token（无列表时可直接填写）<input value={draft.shareToken} onChange={e => update('shareToken', e.target.value)} placeholder="已发布组态的 share_token" /></label>
      </>}
      <label>页面参数 JSON<textarea value={draft.params} onChange={e => update('params', e.target.value)} rows={3} placeholder='{"id": "${page.id}"}' /></label>
      <label>文档全局参数 JSON<textarea value={draft.globalContext} onChange={e => update('globalContext', e.target.value)} rows={2} placeholder='{"projectCode": "A01"}' /></label>
      <label>单页面上下文 JSON<textarea value={draft.pageContext} onChange={e => update('pageContext', e.target.value)} rows={2} placeholder='{"recordId": "${doc.id}"}' /></label>
      {error && <div className="doc-embed-error">{error}</div>}
      <div className="doc-embed-modal-actions"><button type="button" className="btn" onClick={onClose}>取消</button><button type="button" className="btn primary" onClick={submit}>插入</button></div>
    </div>
  </div>
}

export default function SlashMenu({ view, pluginState, onClose, documentContext }: SlashMenuProps) {
  const { active, pos, query } = pluginState
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [embedKind, setEmbedKind] = useState<'form-app' | 'scada'>('form-app')

  const insertEmbed = (kind: string, config: Record<string, any>) => {
    const { state, dispatch } = view
    const node = notionSchema.nodes.doc_embed.create({ kind, config: JSON.stringify({ ...config, documentContext }) })
    dispatch(state.tr.replaceSelectionWith(node))
    view.focus()
    setEmbedOpen(false)
    onClose()
  }
  const allItems: MenuItem[] = [
    { id: 'paragraph', title: '正文', description: '普通段落文本', icon: ChevronRight, keywords: ['text', 'paragraph', 'p', '正文', '段落'], action: v => setBlockType(notionSchema.nodes.paragraph)(v.state, v.dispatch) },
    { id: 'h1', title: '标题 1', description: '大号标题', icon: Heading1, keywords: ['heading', 'h1', 'title', '标题', '一级'], action: v => setBlockType(notionSchema.nodes.heading, { level: 1 })(v.state, v.dispatch) },
    { id: 'h2', title: '标题 2', description: '中号标题', icon: Heading2, keywords: ['heading', 'h2', '标题', '二级'], action: v => setBlockType(notionSchema.nodes.heading, { level: 2 })(v.state, v.dispatch) },
    { id: 'h3', title: '标题 3', description: '小号标题', icon: Heading3, keywords: ['heading', 'h3', '标题', '三级'], action: v => setBlockType(notionSchema.nodes.heading, { level: 3 })(v.state, v.dispatch) },
    { id: 'bullet', title: '无序列表', description: '创建简单的项目符号列表', icon: List, keywords: ['bullet', 'list', '列表', '无序'], action: v => wrapInList(notionSchema.nodes.bullet_list)(v.state, v.dispatch) },
    { id: 'ordered', title: '有序列表', description: '创建编号列表', icon: ListOrdered, keywords: ['ordered', 'numbered', 'list', '列表', '有序'], action: v => wrapInList(notionSchema.nodes.ordered_list)(v.state, v.dispatch) },
    { id: 'task', title: '任务列表', description: '可勾选的待办事项', icon: CheckSquare, keywords: ['todo', 'task', '任务', '待办'], action: v => { const n = notionSchema.nodes.task_list.create(null, notionSchema.nodes.task_item.create({ checked: false }, notionSchema.nodes.paragraph.create())); v.dispatch(v.state.tr.replaceSelectionWith(n)); return true } },
    { id: 'quote', title: '引用', description: '创建引用块', icon: Info, keywords: ['quote', '引用'], action: v => wrapIn(notionSchema.nodes.blockquote)(v.state, v.dispatch) },
    { id: 'code', title: '代码块', description: '插入代码片段', icon: MonitorPlay, keywords: ['code', '代码'], action: v => setBlockType(notionSchema.nodes.code_block)(v.state, v.dispatch) },
    { id: 'divider', title: '分割线', description: '插入水平分割线', icon: Minus, keywords: ['divider', '分割'], action: v => { v.dispatch(v.state.tr.replaceSelectionWith(notionSchema.nodes.horizontal_rule.create())); return true } },
    { id: 'table', title: '表格', description: '插入 3x3 表格', icon: Table, keywords: ['table', '表格'], action: v => { const cells = Array.from({ length: 3 }, () => notionSchema.nodes.table_cell.create(null, notionSchema.nodes.paragraph.create())); const rows = Array.from({ length: 3 }, () => notionSchema.nodes.table_row.create(null, cells)); v.dispatch(v.state.tr.replaceSelectionWith(notionSchema.nodes.table.create(null, rows))); return true } },
    { id: 'embed-form', title: '嵌入 form-app', description: '选择表单应用页面并配置参数', icon: PanelsTopLeft, keywords: ['form', 'form-app', 'embed', '嵌入', '表单'], action: () => { setEmbedKind('form-app'); setEmbedOpen(true); return true } },
    { id: 'embed-scada', title: '嵌入已发布组态', description: '通过 share token 嵌入已发布组态', icon: MonitorPlay, keywords: ['scada', 'embed', '组态', '嵌入'], action: () => { setEmbedKind('scada'); setEmbedOpen(true); return true } },
    { id: 'info', title: '信息提示', description: '蓝色信息框', icon: Info, keywords: ['info', '提示'], action: v => { v.dispatch(v.state.tr.replaceSelectionWith(notionSchema.nodes.callout.create({ type: 'info' }, notionSchema.nodes.paragraph.create()))); return true } },
    { id: 'warning', title: '警告提示', description: '黄色警告框', icon: AlertTriangle, keywords: ['warning', '警告'], action: v => { v.dispatch(v.state.tr.replaceSelectionWith(notionSchema.nodes.callout.create({ type: 'warning' }, notionSchema.nodes.paragraph.create()))); return true } },
    { id: 'error', title: '错误提示', description: '红色错误框', icon: AlertCircle, keywords: ['error', '错误'], action: v => { v.dispatch(v.state.tr.replaceSelectionWith(notionSchema.nodes.callout.create({ type: 'error' }, notionSchema.nodes.paragraph.create()))); return true } },
    { id: 'success', title: '成功提示', description: '绿色成功框', icon: CheckCircle, keywords: ['success', '成功'], action: v => { v.dispatch(v.state.tr.replaceSelectionWith(notionSchema.nodes.callout.create({ type: 'success' }, notionSchema.nodes.paragraph.create()))); return true } },
  ]
  const filteredItems = query ? allItems.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || i.description.toLowerCase().includes(query.toLowerCase()) || i.keywords.some(k => k.includes(query.toLowerCase()))) : allItems
  useEffect(() => { const c = view.coordsAtPos(pos); setCoords({ top: c.bottom + 4, left: c.left }) }, [view, pos])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (!filteredItems.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => (i + 1) % filteredItems.length) } else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => (i - 1 + filteredItems.length) % filteredItems.length) } else if (e.key === 'Enter') { e.preventDefault(); selectItem(filteredItems[selectedIndex]) } else if (e.key === 'Escape') { e.preventDefault(); onClose() } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [selectedIndex, filteredItems])
  useEffect(() => setSelectedIndex(0), [query])
  const selectItem = (item: MenuItem) => {
    const { state, dispatch } = view
    dispatch(state.tr.delete(pos - query.length - 1, pos))
    // 嵌入项会打开 EmbedModal（非命令式渲染），所以保留组件挂载，
    // 不在这里调用 onClose()。其余项命令式插入 block 后立即关闭菜单。
    item.action(view)
    view.focus()
    if (!item.id.startsWith('embed-')) onClose()
  }
  if (!coords) return null
  // 既没有激活 slash 菜单，也没有打开嵌入选择框 → 不渲染。
  if (!active && !embedOpen) return null
  return <>
    {active && filteredItems.length > 0 && (
      <div className="slash-menu" ref={menuRef} style={{ position: 'fixed', top: coords.top, left: coords.left }}>
        {filteredItems.map((item, i) => {
          const Icon = item.icon
          return (
            <div
              key={item.id}
              className={'slash-menu-item' + (i === selectedIndex ? ' selected' : '')}
              onClick={() => selectItem(item)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="slash-menu-icon"><Icon size={18} /></div>
              <div className="slash-menu-text">
                <div className="slash-menu-title">{item.title}</div>
                <div className="slash-menu-desc">{item.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    )}
    {embedOpen && <EmbedModal initialKind={embedKind} onClose={() => { setEmbedOpen(false); onClose() }} onInsert={insertEmbed} />}
  </>
}
