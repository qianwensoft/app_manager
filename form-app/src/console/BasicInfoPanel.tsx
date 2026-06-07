import { useEffect, useState } from 'react'
import { Button, Input, Select, message } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from './api'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
  onSaved: () => void
}

export default function BasicInfoPanel({ app, pages, onSaved }: Props) {
  const [name, setName] = useState(app.name || '')
  const [code, setCode] = useState(app.code || '')
  const [description, setDescription] = useState(app.description || '')
  const [dataSourceID, setDataSourceID] = useState<number | undefined>(app.data_source_id || undefined)
  const [entryPageKey, setEntryPageKey] = useState(app.entry_page_key || 'form')
  const [dataSources, setDataSources] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(app.name || '')
    setCode(app.code || '')
    setDescription(app.description || '')
    setDataSourceID(app.data_source_id || undefined)
    setEntryPageKey(app.entry_page_key || 'form')
  }, [app])

  useEffect(() => {
    authed('/api/data/sources', 'GET')
      .then(res => setDataSources(res?.data || []))
      .catch(() => {})
  }, [])

  const save = async () => {
    if (!name.trim() || !code.trim()) {
      message.warning('名称和编码不能为空')
      return
    }
    setSaving(true)
    try {
      await authed(`/api/form-app/infos/${app.id}`, 'PUT', {
        ...app,
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        data_source_id: dataSourceID || 0,
        entry_page_key: entryPageKey,
      })
      message.success('已保存')
      onSaved()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2>基本信息</h2>
      <p style={{ color: '#64748b' }}>定义应用的名称、唯一编码、绑定数据源与默认入口页面。</p>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>应用名称</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="我的表单应用" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>应用编码（唯一）</label>
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="my_app" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>描述</label>
          <Input.TextArea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>默认数据源</label>
          <Select
            style={{ width: '100%' }}
            allowClear
            value={dataSourceID}
            onChange={v => setDataSourceID(v)}
            placeholder="选择数据源（可选）"
          >
            {dataSources.map((s: any) => (
              <Select.Option key={s.id} value={s.id}>{s.name} ({s.code})</Select.Option>
            ))}
          </Select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>入口页面</label>
          <Select style={{ width: '100%' }} value={entryPageKey} onChange={setEntryPageKey}>
            {pages.map(p => (
              <Select.Option key={p.page_key} value={p.page_key}>{p.title} ({p.page_key})</Select.Option>
            ))}
            {pages.length === 0 && <Select.Option value="form">form</Select.Option>}
          </Select>
        </div>
        <div>
          <Button type="primary" loading={saving} onClick={save}>保存基本信息</Button>
        </div>
      </div>
    </div>
  )
}
