import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Select, Input, Table, Modal, message } from 'antd'

type Link = {
  id: number
  from_page_key: string
  to_page_key: string
  trigger_type: string
  param_mapping: string
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

export default function PageLinkEditorPage() {
  const { id } = useParams()
  const [links, setLinks] = useState<Link[]>([])
  const [pages, setPages] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newLink, setNewLink] = useState({
    from_page_key: '',
    to_page_key: '',
    trigger_type: 'button_click',
    param_mapping: '{}',
  })

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      const [linksRes, pagesRes] = await Promise.all([
        authed(`/api/form-app/infos/${id}/links`, 'GET'),
        authed(`/api/form-app/infos/${id}/pages`, 'GET'),
      ])
      setLinks(linksRes.data || [])
      setPages(pagesRes.data || [])
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const addLink = async () => {
    try {
      await authed(`/api/form-app/infos/${id}/links`, 'POST', newLink)
      setShowAdd(false)
      setNewLink({ from_page_key: '', to_page_key: '', trigger_type: 'button_click', param_mapping: '{}' })
      loadData()
      message.success('跳转已创建')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const deleteLink = async (linkId: number) => {
    try {
      await authed(`/api/form-app/links/${linkId}`, 'DELETE')
      loadData()
      message.success('跳转已删除')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>页面跳转配置</h2>
      <Button type="primary" onClick={() => setShowAdd(true)} style={{ marginBottom: 16 }}>
        新增跳转
      </Button>
      <Table
        dataSource={links}
        rowKey="id"
        columns={[
          { title: '源页面', dataIndex: 'from_page_key' },
          { title: '目标页面', dataIndex: 'to_page_key' },
          { title: '触发类型', dataIndex: 'trigger_type' },
          { title: '参数映射', dataIndex: 'param_mapping', ellipsis: true },
          {
            title: '操作',
            render: (_, record) => (
              <Button size="small" danger onClick={() => deleteLink(record.id)}>
                删除
              </Button>
            ),
          },
        ]}
      />

      <Modal title="新增跳转" visible={showAdd} onOk={addLink} onCancel={() => setShowAdd(false)}>
        <div style={{ marginBottom: 12 }}>
          <label>源页面</label>
          <Select
            value={newLink.from_page_key}
            onChange={v => setNewLink({ ...newLink, from_page_key: v })}
            style={{ width: '100%' }}
          >
            {pages.map(p => (
              <Select.Option key={p.page_key} value={p.page_key}>
                {p.title} ({p.page_key})
              </Select.Option>
            ))}
          </Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>目标页面</label>
          <Select
            value={newLink.to_page_key}
            onChange={v => setNewLink({ ...newLink, to_page_key: v })}
            style={{ width: '100%' }}
          >
            {pages.map(p => (
              <Select.Option key={p.page_key} value={p.page_key}>
                {p.title} ({p.page_key})
              </Select.Option>
            ))}
          </Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>触发类型</label>
          <Select
            value={newLink.trigger_type}
            onChange={v => setNewLink({ ...newLink, trigger_type: v })}
            style={{ width: '100%' }}
          >
            <Select.Option value="button_click">按钮点击</Select.Option>
            <Select.Option value="row_click">行点击</Select.Option>
            <Select.Option value="auto_redirect">自动跳转</Select.Option>
          </Select>
        </div>
        <div>
          <label>参数映射 (JSON)</label>
          <Input.TextArea
            value={newLink.param_mapping}
            onChange={e => setNewLink({ ...newLink, param_mapping: e.target.value })}
            rows={3}
            placeholder='{"id":"$row.id"}'
          />
        </div>
      </Modal>
    </div>
  )
}
