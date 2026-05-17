import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Steps, Button, Form, Input, Select, message } from 'antd'

const { Step } = Steps

export default function FormAppCreateWizard() {
  const [current, setCurrent] = useState(0)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [dataSources, setDataSources] = useState<any[]>([])
  const [tables, setTables] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/data/sources', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(d => setDataSources(d.data || []))
  }, [])

  const onDataSourceChange = async (id: number) => {
    const res = await fetch(`/api/data/sources/${id}/tables`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    const data = await res.json()
    setTables(data.data || [])
  }

  const nextStep = async () => {
    if (current === 0) {
      try {
        await form.validateFields(['code', 'name'])
        setCurrent(1)
      } catch {
        message.error('请填写必填项')
      }
    } else {
      setCurrent(current + 1)
    }
  }

  const onFinish = async () => {
    setLoading(true)
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      const payload: Record<string, unknown> = { code: values.code, name: values.name, mode: 'form' }
      if (values.data_source_id) payload.data_source_id = values.data_source_id
      const res = await fetch('/api/form-app/infos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payload)
      })
      const app = await res.json()
      if (!res.ok) throw new Error(app.error)

      if (values.table && values.data_source_id) {
        await fetch(`/api/form-app/infos/${app.data.id}/generate-pages-from-table`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ data_source_id: values.data_source_id, table: values.table, primary_key: 'id', pages: ['form', 'list', 'detail'] })
        })
      }

      message.success('创建成功')
      navigate(`/designer-v2/${app.data.id}`)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Steps current={current} style={{ marginBottom: 24 }}>
        <Step title="基本信息" />
        <Step title="数据源" />
        <Step title="完成" />
      </Steps>
      <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
        <div style={{ display: current === 0 ? 'block' : 'none' }}>
          <Form.Item label="应用编码" name="code" rules={[{ required: true }]}>
            <Input placeholder="my_app" />
          </Form.Item>
          <Form.Item label="应用名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="我的应用" />
          </Form.Item>
        </div>
        <div style={{ display: current === 1 ? 'block' : 'none' }}>
          <Form.Item label="数据源" name="data_source_id">
            <Select placeholder="选择数据源（可选）" allowClear onChange={onDataSourceChange}>
              {dataSources.map(ds => <Select.Option key={ds.id} value={ds.id}>{ds.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="数据表" name="table">
            <Select placeholder="选择表自动生成页面（可选）" allowClear disabled={!tables.length}>
              {tables.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            </Select>
          </Form.Item>
        </div>
        {current === 2 && <div>点击完成创建应用</div>}
      </Form>
      <div style={{ marginTop: 24 }}>
        {current > 0 && <Button onClick={() => setCurrent(current - 1)}>上一步</Button>}
        {current < 2 && <Button type="primary" onClick={nextStep} style={{ marginLeft: 8 }}>下一步</Button>}
        {current === 2 && <Button type="primary" onClick={onFinish} loading={loading} style={{ marginLeft: 8 }}>完成</Button>}
      </div>
    </div>
  )
}
