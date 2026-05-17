import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Input, Select, message, Card, Table, Modal, Form, Checkbox } from 'antd'

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

export default function PageEditorPage() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [interfaceCode, setInterfaceCode] = useState('')
  const [pageType, setPageType] = useState('')
  const [fields, setFields] = useState<any[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingField, setEditingField] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadPage()
  }, [pageId])

  const loadPage = async () => {
    try {
      const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
      setPage(res.data)
      setTitle(res.data.title)
      setInterfaceCode(res.data.interface_code || '')
      setPageType(res.data.page_type)
      const config = res.data.config_json ? JSON.parse(res.data.config_json) : {}
      setFields(config.field_definitions || [])
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const save = async () => {
    try {
      const config = { field_definitions: fields }
      await authed(`/api/form-app/pages/${pageId}`, 'PUT', {
        title,
        interface_code: interfaceCode,
        page_type: pageType,
        config_json: JSON.stringify(config)
      })
      message.success('保存成功')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const addField = () => {
    setEditingField(null)
    form.resetFields()
    setModalVisible(true)
  }

  const editField = (field: any, index: number) => {
    setEditingField({ ...field, index })
    form.setFieldsValue(field)
    setModalVisible(true)
  }

  const saveField = () => {
    const values = form.getFieldsValue()
    if (editingField?.index !== undefined) {
      const newFields = [...fields]
      newFields[editingField.index] = values
      setFields(newFields)
    } else {
      setFields([...fields, values])
    }
    setModalVisible(false)
  }

  const deleteField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  if (!page) return <div>加载中...</div>

  return (
    <div style={{ padding: 24 }}>
      <Card title={`编辑页面: ${page.page_key}`}>
        <div style={{ marginBottom: 16 }}>
          <label>页面标题</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>页面类型</label>
          <Select value={pageType} onChange={setPageType} style={{ width: '100%' }}>
            <Select.Option value="form">表单</Select.Option>
            <Select.Option value="list">列表</Select.Option>
            <Select.Option value="detail">详情</Select.Option>
          </Select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>接口编码</label>
          <Input value={interfaceCode} onChange={e => setInterfaceCode(e.target.value)} />
        </div>

        <h3 style={{ marginTop: 24 }}>字段定义</h3>
        <Button onClick={addField} style={{ marginBottom: 16 }}>添加字段</Button>
        <Table
          size="small"
          dataSource={fields}
          rowKey="field"
          columns={[
            { title: '字段名', dataIndex: 'field' },
            { title: '标签', dataIndex: 'label' },
            { title: '组件', dataIndex: 'component' },
            { title: '必填', dataIndex: 'required', render: v => v ? '是' : '否' },
            {
              title: '操作',
              render: (_, r, i) => (
                <>
                  <Button size="small" onClick={() => editField(r, i)}>编辑</Button>
                  <Button size="small" danger onClick={() => deleteField(i)} style={{ marginLeft: 8 }}>删除</Button>
                </>
              )
            }
          ]}
          pagination={false}
        />

        <div style={{ marginTop: 24 }}>
          <Button type="primary" onClick={save}>保存</Button>
          <Button onClick={() => navigate(-1)} style={{ marginLeft: 8 }}>返回</Button>
        </div>
      </Card>

      <Modal title="字段配置" visible={modalVisible} onOk={saveField} onCancel={() => setModalVisible(false)}>
        <Form form={form} layout="vertical">
          <Form.Item label="字段名" name="field" rules={[{ required: true }]}>
            <Input placeholder="name" />
          </Form.Item>
          <Form.Item label="标签" name="label" rules={[{ required: true }]}>
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item label="组件" name="component" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="Input">Input</Select.Option>
              <Select.Option value="InputNumber">InputNumber</Select.Option>
              <Select.Option value="Select">Select</Select.Option>
              <Select.Option value="DatePicker">DatePicker</Select.Option>
              <Select.Option value="Switch">Switch</Select.Option>
              <Select.Option value="Rate">Rate</Select.Option>
              <Select.Option value="Slider">Slider</Select.Option>
              <Select.Option value="Checkbox">Checkbox</Select.Option>
              <Select.Option value="Radio">Radio</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="必填" name="required" valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item label="占位符" name="placeholder">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
