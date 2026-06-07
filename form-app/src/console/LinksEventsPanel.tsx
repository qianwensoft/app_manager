import { useState } from 'react'
import { Button, Select, Input, InputNumber, Table, Modal, Tabs, message } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from './api'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
  links: any[]
  eventRoutes: any[]
  reload: () => void
}

export default function LinksEventsPanel({ app, pages, links, eventRoutes, reload }: Props) {
  const [showAddLink, setShowAddLink] = useState(false)
  const [newLink, setNewLink] = useState({ from_page_key: '', to_page_key: '', trigger_type: 'button_click', param_mapping: '{}' })

  const [showAddRoute, setShowAddRoute] = useState(false)
  const [newRoute, setNewRoute] = useState({ event_type: 'barcode', matcher_type: 'prefix', matcher_value: '', target_page_key: '', priority: 100 })
  const [testData, setTestData] = useState({ event_type: 'barcode', event_data: '' })
  const [testResult, setTestResult] = useState<any>(null)

  const addLink = async () => {
    if (!newLink.from_page_key || !newLink.to_page_key) { message.warning('请选择源页面和目标页面'); return }
    try {
      await authed(`/api/form-app/infos/${app.id}/links`, 'POST', newLink)
      setShowAddLink(false)
      setNewLink({ from_page_key: '', to_page_key: '', trigger_type: 'button_click', param_mapping: '{}' })
      reload()
      message.success('跳转已创建')
    } catch (e: any) { message.error(e.message) }
  }
  const deleteLink = async (linkId: number) => {
    try { await authed(`/api/form-app/links/${linkId}`, 'DELETE'); reload(); message.success('已删除') } catch (e: any) { message.error(e.message) }
  }

  const addRoute = async () => {
    if (!newRoute.target_page_key) { message.warning('请选择目标页面'); return }
    try {
      await authed(`/api/form-app/infos/${app.id}/event-routes`, 'POST', newRoute)
      setShowAddRoute(false)
      setNewRoute({ event_type: 'barcode', matcher_type: 'prefix', matcher_value: '', target_page_key: '', priority: 100 })
      reload()
      message.success('路由已创建')
    } catch (e: any) { message.error(e.message) }
  }
  const deleteRoute = async (routeId: number) => {
    try { await authed(`/api/form-app/event-routes/${routeId}`, 'DELETE'); reload(); message.success('已删除') } catch (e: any) { message.error(e.message) }
  }
  const testEvent = async () => {
    try {
      const res = await authed(`/api/form-app/infos/${app.id}/test-event`, 'POST', testData)
      setTestResult(res)
    } catch (e: any) { message.error(e.message) }
  }

  const pageOptions = pages.map(p => <Select.Option key={p.page_key} value={p.page_key}>{p.title} ({p.page_key})</Select.Option>)

  return (
    <div>
      <Tabs defaultActiveKey="links">
        <Tabs.TabPane tab="页面跳转" key="links">
          <Button type="primary" onClick={() => setShowAddLink(true)} style={{ marginBottom: 16 }}>新增跳转</Button>
          <Table
            dataSource={links}
            rowKey="id"
            pagination={false}
            columns={[
              { title: '源页面', dataIndex: 'from_page_key' },
              { title: '目标页面', dataIndex: 'to_page_key' },
              { title: '触发类型', dataIndex: 'trigger_type' },
              { title: '参数映射', dataIndex: 'param_mapping', ellipsis: true },
              { title: '操作', render: (_: any, r: any) => <Button size="small" danger onClick={() => deleteLink(r.id)}>删除</Button> },
            ]}
          />
        </Tabs.TabPane>
        <Tabs.TabPane tab="事件路由（扫码分流）" key="events">
          <div style={{ marginBottom: 16, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
            <h4 style={{ marginTop: 0 }}>测试事件匹配</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <Select value={testData.event_type} onChange={v => setTestData({ ...testData, event_type: v })} style={{ width: 120 }}>
                <Select.Option value="barcode">条码</Select.Option>
                <Select.Option value="qrcode">二维码</Select.Option>
                <Select.Option value="nfc">NFC</Select.Option>
              </Select>
              <Input value={testData.event_data} onChange={e => setTestData({ ...testData, event_data: e.target.value })} placeholder="输入扫码内容" style={{ flex: 1 }} />
              <Button onClick={testEvent}>测试</Button>
            </div>
            {testResult && (
              <div style={{ marginTop: 8, padding: 8, background: testResult.matched ? '#d4edda' : '#f8d7da', borderRadius: 4 }}>
                {testResult.matched ? `✓ 匹配到: ${testResult.target_page_key}（优先级 ${testResult.priority}）` : '✗ 未匹配到任何路由'}
              </div>
            )}
          </div>
          <Button type="primary" onClick={() => setShowAddRoute(true)} style={{ marginBottom: 16 }}>新增路由</Button>
          <Table
            dataSource={eventRoutes}
            rowKey="id"
            pagination={false}
            columns={[
              { title: '事件类型', dataIndex: 'event_type' },
              { title: '匹配类型', dataIndex: 'matcher_type' },
              { title: '匹配值', dataIndex: 'matcher_value' },
              { title: '目标页面', dataIndex: 'target_page_key' },
              { title: '优先级', dataIndex: 'priority' },
              { title: '启用', dataIndex: 'enabled', render: (v: boolean) => (v ? '是' : '否') },
              { title: '操作', render: (_: any, r: any) => <Button size="small" danger onClick={() => deleteRoute(r.id)}>删除</Button> },
            ]}
          />
        </Tabs.TabPane>
      </Tabs>

      <Modal title="新增跳转" visible={showAddLink} onOk={addLink} onCancel={() => setShowAddLink(false)}>
        <div style={{ marginBottom: 12 }}>
          <label>源页面</label>
          <Select value={newLink.from_page_key} onChange={v => setNewLink({ ...newLink, from_page_key: v })} style={{ width: '100%' }}>{pageOptions}</Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>目标页面</label>
          <Select value={newLink.to_page_key} onChange={v => setNewLink({ ...newLink, to_page_key: v })} style={{ width: '100%' }}>{pageOptions}</Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>触发类型</label>
          <Select value={newLink.trigger_type} onChange={v => setNewLink({ ...newLink, trigger_type: v })} style={{ width: '100%' }}>
            <Select.Option value="button_click">按钮点击</Select.Option>
            <Select.Option value="row_click">行点击</Select.Option>
            <Select.Option value="auto_redirect">自动跳转</Select.Option>
          </Select>
        </div>
        <div>
          <label>参数映射 (JSON)</label>
          <Input.TextArea value={newLink.param_mapping} onChange={e => setNewLink({ ...newLink, param_mapping: e.target.value })} rows={3} placeholder='{"id":"$row.id"}' />
        </div>
      </Modal>

      <Modal title="新增事件路由" visible={showAddRoute} onOk={addRoute} onCancel={() => setShowAddRoute(false)}>
        <div style={{ marginBottom: 12 }}>
          <label>事件类型</label>
          <Select value={newRoute.event_type} onChange={v => setNewRoute({ ...newRoute, event_type: v })} style={{ width: '100%' }}>
            <Select.Option value="barcode">条码</Select.Option>
            <Select.Option value="qrcode">二维码</Select.Option>
            <Select.Option value="nfc">NFC</Select.Option>
            <Select.Option value="custom">自定义</Select.Option>
          </Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>匹配类型</label>
          <Select value={newRoute.matcher_type} onChange={v => setNewRoute({ ...newRoute, matcher_type: v })} style={{ width: '100%' }}>
            <Select.Option value="prefix">前缀匹配</Select.Option>
            <Select.Option value="exact">精确匹配</Select.Option>
            <Select.Option value="regex">正则匹配</Select.Option>
            <Select.Option value="all">全匹配</Select.Option>
          </Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>匹配值</label>
          <Input value={newRoute.matcher_value} onChange={e => setNewRoute({ ...newRoute, matcher_value: e.target.value })} placeholder="如: EQP-" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>目标页面</label>
          <Select value={newRoute.target_page_key} onChange={v => setNewRoute({ ...newRoute, target_page_key: v })} style={{ width: '100%' }}>{pageOptions}</Select>
        </div>
        <div>
          <label>优先级（数字越小越优先）</label>
          <InputNumber value={newRoute.priority} onChange={v => setNewRoute({ ...newRoute, priority: v || 100 })} style={{ width: '100%' }} min={1} max={999} />
        </div>
      </Modal>
    </div>
  )
}
