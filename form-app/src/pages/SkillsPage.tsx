import { useEffect, useState } from 'react'
import {
  Button, Table, Drawer, Form, Input, Switch, InputNumber,
  Space, Tag, Modal, message,
} from 'antd'
import { authed } from '@/console/api'

const { TextArea } = Input

export type AISkill = {
  id: number
  name: string
  description: string
  category: string
  system_prompt: string
  field_snippet_json: string
  enabled: boolean
  sort_order: number
}

export default function SkillsPage() {
  const [list, setList] = useState<AISkill[]>([])
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<AISkill | null>(null)
  const [form] = Form.useForm()

  const loadList = async () => {
    setLoading(true)
    try {
      const res = await authed('/api/form-app/skills', 'GET')
      setList(res.data || [])
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadList() }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ enabled: true, sort_order: 0 })
    setDrawerOpen(true)
  }

  const openEdit = (row: AISkill) => {
    setEditing(row)
    form.setFieldsValue(row)
    setDrawerOpen(true)
  }

  const onSave = async () => {
    let values: any
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    // 校验 field_snippet_json 是合法 JSON（允许空）
    if (values.field_snippet_json && values.field_snippet_json.trim()) {
      try {
        JSON.parse(values.field_snippet_json)
      } catch {
        message.error('字段片段不是合法的 JSON')
        return
      }
    }
    try {
      if (editing) {
        await authed(`/api/form-app/skills/${editing.id}`, 'PUT', values)
        message.success('已更新')
      } else {
        await authed('/api/form-app/skills', 'POST', values)
        message.success('已创建')
      }
      setDrawerOpen(false)
      loadList()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const onDelete = (row: AISkill) => {
    Modal.confirm({
      title: '删除技能',
      content: `确认删除技能「${row.name}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await authed(`/api/form-app/skills/${row.id}`, 'DELETE')
          message.success('已删除')
          loadList()
        } catch (e: any) {
          message.error(e.message)
        }
      },
    })
  }

  const columns = [
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '分类', dataIndex: 'category', width: 120, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '状态', dataIndex: 'enabled', width: 90,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
    },
    { title: '排序', dataIndex: 'sort_order', width: 80 },
    {
      title: '操作', width: 140, fixed: 'right' as const,
      render: (_: any, row: AISkill) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
          <Button size="small" danger onClick={() => onDelete(row)}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>AI 技能管理</h2>
        <Button type="primary" onClick={openCreate}>新建技能</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={list}
        columns={columns}
        scroll={{ x: 900 }}
        pagination={false}
      />

      <Drawer
        title={editing ? '编辑技能' : '新建技能'}
        width={560}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={onSave}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：标准入职表单" />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input placeholder="例如：人事 / 巡检 / 仓储" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="简要说明该技能的用途" />
          </Form.Item>
          <Form.Item
            name="system_prompt"
            label="系统指令（注入 Claude system）"
            rules={[{ required: true, message: '请输入系统指令' }]}
          >
            <TextArea rows={6} placeholder="例如：生成表单时字段标签使用简体中文，必填项需标注……" />
          </Form.Item>
          <Form.Item
            name="field_snippet_json"
            label="参考字段片段（FieldDef[] JSON，可选）"
            tooltip="可粘贴一段 FieldDef[] 作为示例，供 AI 参考"
          >
            <TextArea rows={5} placeholder='[ { "field": "name", "label": "姓名", "component": "Input" } ]' />
          </Form.Item>
          <Space size="large">
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="sort_order" label="排序">
              <InputNumber min={0} />
            </Form.Item>
          </Space>
        </Form>
      </Drawer>
    </div>
  )
}
