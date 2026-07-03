/**
 * 布局设计器（formily）右侧属性区「事件」页签：节点级事件快捷绑定。
 *
 * 选中按钮类组件（ActionButton / EventButton / SubmitButton / PrintButton）时：
 * - 读/写该节点 x-component-props.buttonId（随布局保存进 design_schema）；
 * - 列出 config_json.events 中以该 buttonId 为源（source=button）的事件流；
 * - 提供「去事件编排」跳转（带 ?eventId 聚焦）与「新建以此按钮为源的事件流」。
 *
 * 事件数据通过 GET/PUT /api/form-app/pages/:pageId 直接读写 config_json.events，
 * 与顶栏「事件编排」Drawer 共用同一份数据。
 */
import { useEffect, useState } from 'react'
import { Button, Input, Empty, Tag, message, Space } from 'antd'
import { observer } from '@formily/reactive-react'
import { useCurrentNode } from '@designable/react'
import type { PageEvent } from '@/runtime/eventTypes'

const BUTTON_COMPONENTS = new Set([
  'ActionButton',
  'EventButton',
  'SubmitButton',
  'PrintButton',
  'NavigateButton',
  'FeedbackButton',
  'CustomButton',
  'ConfirmDialogButton',
])

async function authed(path: string, method: string, body?: any) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
  return data
}

function genButtonId(): string {
  return `btn_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }

function NodeEventBinderInner({ pageId }: { pageId?: string }) {
  const node: any = useCurrentNode()
  const [events, setEvents] = useState<PageEvent[]>([])
  const [loaded, setLoaded] = useState(false)

  const comp: string | undefined = node?.props?.['x-component']
  const isButton = !!comp && BUTTON_COMPONENTS.has(comp)
  const buttonId: string = node?.props?.['x-component-props']?.buttonId || ''

  // 拉取页面 events（用于展示与该按钮匹配的事件流）
  const loadEvents = async () => {
    if (!pageId) return
    try {
      const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
      const cfg = res.data?.config_json ? JSON.parse(res.data.config_json) : {}
      setEvents(Array.isArray(cfg.events) ? cfg.events : [])
    } catch { /* 静默 */ } finally {
      setLoaded(true)
    }
  }

  useEffect(() => { loadEvents() /* eslint-disable-next-line */ }, [pageId])

  if (!node) {
    return <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>请选择一个组件</div>
  }
  if (!isButton) {
    return (
      <div style={{ padding: 16 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              事件绑定仅支持按钮类组件
              <br />（动作按钮 / 事件按钮 / 提交按钮 / 打印按钮）
            </span>
          }
        />
      </div>
    )
  }

  const setButtonId = (id: string) => {
    const prev = node.props?.['x-component-props'] || {}
    node.setProps({ 'x-component-props': { ...prev, buttonId: id } })
  }

  const matched = events.filter(e => e.source?.kind === 'button' && (e.source as any).button_id === buttonId)

  const goDesigner = (eventId?: string) => {
    if (!pageId) return
    const url = `/page-events/${pageId}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`
    window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}${url}`, '_blank')
  }

  // 新建一条以该按钮为源的事件流并保存，然后打开事件编排页聚焦
  const createEventForButton = async () => {
    if (!pageId) { message.warning('页面未就绪'); return }
    let id = buttonId
    if (!id) { id = genButtonId(); setButtonId(id) }
    try {
      const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
      const cfg = res.data?.config_json ? JSON.parse(res.data.config_json) : {}
      const list: PageEvent[] = Array.isArray(cfg.events) ? cfg.events : []
      const evId = `ev_${Date.now().toString(36)}`
      const newEvent: PageEvent = {
        id: evId,
        name: `按钮事件 ${list.length + 1}`,
        source: { kind: 'button', button_id: id },
        actions: [],
      }
      const merged = { ...cfg, events: [...list, newEvent] }
      await authed(`/api/form-app/pages/${pageId}`, 'PUT', { config_json: JSON.stringify(merged) })
      setEvents(merged.events)
      message.success('已创建事件流，请在事件编排页继续配置动作')
      goDesigner(evId)
    } catch (e: any) {
      message.error(e.message)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <Tag color="blue" style={{ marginBottom: 12 }}>{comp}</Tag>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>按钮 ID（事件源标识）</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <Input
            size="small"
            value={buttonId}
            placeholder="用于事件源 source=button 匹配"
            onChange={e => setButtonId(e.target.value)}
          />
          <Button size="small" onClick={() => setButtonId(genButtonId())}>生成</Button>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          运行时点击该按钮将触发以此 ID 为源的事件流。修改后记得「保存布局」。
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>已绑定的事件流（{matched.length}）</label>
        {!loaded && <div style={{ fontSize: 12, color: '#94a3b8' }}>加载中…</div>}
        {loaded && matched.length === 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>暂无以该按钮为源的事件流</div>
        )}
        {matched.map(ev => (
          <div
            key={ev.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 8px', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 6, marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, color: '#374151' }}>
              {ev.name || ev.id}
              <span style={{ color: '#94a3b8', marginLeft: 6 }}>{(ev.actions || []).length} 个动作</span>
            </span>
            <Button size="small" type="link" onClick={() => goDesigner(ev.id)}>编辑</Button>
          </div>
        ))}
      </div>

      <Space>
        <Button size="small" type="primary" onClick={createEventForButton} disabled={!pageId}>
          + 新建事件流
        </Button>
        <Button size="small" onClick={() => goDesigner()} disabled={!pageId}>打开事件编排</Button>
        <Button size="small" onClick={loadEvents}>刷新</Button>
      </Space>
    </div>
  )
}

export const NodeEventBinder = observer(NodeEventBinderInner)
export default NodeEventBinder
