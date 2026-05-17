import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Select, Input, Table, Modal, message, InputNumber } from 'antd'

type EventRoute = {
  id: number
  event_type: string
  matcher_type: string
  matcher_value: string
  target_page_key: string
  priority: number
  enabled: boolean
}

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

export default function EventRouteEditorPage() {
  const { id } = useParams()
  const [routes, setRoutes] = useState<EventRoute[]>([])
  const [pages, setPages] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [testData, setTestData] = useState({ event_type: 'barcode', event_data: '' })
  const [testResult, setTestResult] = useState<any>(null)
  const [newRoute, setNewRoute] = useState({
    event_type: 'barcode',
    matcher_type: 'prefix',
    matcher_value: '',
    target_page_key: '',
    priority: 100,
  })

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      const [routesRes, pagesRes] = await Promise.all([
        authed(`/api/form-app/infos/${id}/event-routes`, 'GET'),
        authed(`/api/form-app/infos/${id}/pages`, 'GET'),
      ])
      setRoutes(routesRes.data || [])
      setPages(pagesRes.data || [])
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const addRoute = async () => {
    try {
      await authed(`/api/form-app/infos/${id}/event-routes`, 'POST', newRoute)
      setShowAdd(false)
      setNewRoute({ event_type: 'barcode', matcher_type: 'prefix', matcher_value: '', target_page_key: '', priority: 100 })
      loadData()
      message.success('路由已创建')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const deleteRoute = async (routeId: number) => {
    try {
      await authed(`/api/form-app/event-routes/${routeId}`, 'DELETE')
      loadData()
      message.success('路由已删除')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const testEvent = async () => {
    try {
      const res = await authed(`/api/form-app/infos/${id}/test-event`, 'POST', testData)
      setTestResult(res)
      if (res.matched) {
        message.success(`匹配成功: ${res.target_page_key}`)
      } else {
        message.warning('未匹配到任何路由')
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>事件路由配置</h2>
      <Button type="primary" onClick={() => setShowAdd(true)} style={{ marginBottom: 16 }}>
        新增路由
      </Button>

      <div style={{ marginBottom: 24, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
        <h3>测试事件</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Select value={testData.event_type} onChange={v => setTestData({ ...testData, event_type: v })} style={{ width: 120 }}>
            <Select.Option value="barcode">条码</Select.Option>
            <Select.Option value="qrcode">二维码</Select.Option>
            <Select.Option value="nfc">NFC</Select.Option>
          </Select>
          <Input
            value={testData.event_data}
            onChange={e => setTestData({ ...testData, event_data: e.target.value })}
            placeholder="输入事件数据"
            style={{ flex: 1 }}
          />
          <Button onClick={testEvent}>测试</Button>
        </div>
        {testResult && (
          <div style={{ marginTop: 8, padding: 8, background: testResult.matched ? '#d4edda' : '#f8d7da', borderRadius: 4 }}>
            {testResult.matched ? `✓ 匹配到: ${testResult.target_page_key} (优先级: ${testResult.priority})` : '✗ 未匹配'}
          </div>
        )}
      </div>

      <Table
        dataSource={routes}
        rowKey="id"
        columns={[
          { title: '事件类型', dataIndex: 'event_type' },
          { title: '匹配类型', dataIndex: 'matcher_type' },
          { title: '匹配值', dataIndex: 'matcher_value' },
          { title: '目标页面', dataIndex: 'target_page_key' },
          { title: '优先级', dataIndex: 'priority', sorter: (a, b) => a.priority - b.priority },
          { title: '启用', dataIndex: 'enabled', render: v => (v ? '是' : '否') },
          {
            title: '操作',
            render: (_, record) => (
              <Button size="small" danger onClick={() => deleteRoute(record.id)}>
                删除
              </Button>
            ),
          },
        ]}
      />

      <Modal title="新增事件路由" visible={showAdd} onOk={addRoute} onCancel={() => setShowAdd(false)}>
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
          <Input
            value={newRoute.matcher_value}
            onChange={e => setNewRoute({ ...newRoute, matcher_value: e.target.value })}
            placeholder="如: EQP-"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>目标页面</label>
          <Select value={newRoute.target_page_key} onChange={v => setNewRoute({ ...newRoute, target_page_key: v })} style={{ width: '100%' }}>
            {pages.map(p => (
              <Select.Option key={p.page_key} value={p.page_key}>
                {p.title} ({p.page_key})
              </Select.Option>
            ))}
          </Select>
        </div>
        <div>
          <label>优先级 (数字越小越优先)</label>
          <InputNumber
            value={newRoute.priority}
            onChange={v => setNewRoute({ ...newRoute, priority: v || 100 })}
            style={{ width: '100%' }}
            min={1}
            max={999}
          />
        </div>
      </Modal>
    </div>
  )
}
