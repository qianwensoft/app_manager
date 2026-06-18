import { useEffect, useState } from 'react'
import { Button, Input, Select, message } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from './api'
import EventsConfigSection from '../pages/EventsConfigSection'
import { useInterfaceOptions } from '../pages/useInterfaceOptions'
import type { PageEvent } from '../runtime/eventTypes'
import type { PrinterTemplate } from '../runtime/printerTypes'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
  onSaved: () => void
}

/** 解析 global_config，返回 events / printers（缺省空） */
function parseGlobalConfig(raw: string | undefined): { events: PageEvent[]; printers: PrinterTemplate[]; rest: Record<string, any> } {
  let cfg: Record<string, any> = {}
  try { cfg = raw ? JSON.parse(raw) : {} } catch { cfg = {} }
  const { events, printers, ...rest } = cfg
  return {
    events: Array.isArray(events) ? events : [],
    printers: Array.isArray(printers) ? printers : [],
    rest,
  }
}

export default function BasicInfoPanel({ app, pages, onSaved }: Props) {
  const [name, setName] = useState(app.name || '')
  const [code, setCode] = useState(app.code || '')
  const [description, setDescription] = useState(app.description || '')
  const [dataSourceID, setDataSourceID] = useState<number | undefined>(app.data_source_id || undefined)
  const [entryPageKey, setEntryPageKey] = useState(app.entry_page_key || 'form')
  const [dataSources, setDataSources] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  // 应用级常驻事件（存于 global_config.events，运行时跨页面常驻）
  const [appEvents, setAppEvents] = useState<PageEvent[]>([])
  const [globalRest, setGlobalRest] = useState<Record<string, any>>({})
  const [globalPrinters, setGlobalPrinters] = useState<PrinterTemplate[]>([])
  const iface = useInterfaceOptions()

  useEffect(() => {
    setName(app.name || '')
    setCode(app.code || '')
    setDescription(app.description || '')
    setDataSourceID(app.data_source_id || undefined)
    setEntryPageKey(app.entry_page_key || 'form')
    const g = parseGlobalConfig(app.global_config)
    setAppEvents(g.events)
    setGlobalPrinters(g.printers)
    setGlobalRest(g.rest)
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
      // 应用级事件强制 scope:'app'（运行时据此常驻注册）
      const normalizedEvents = appEvents.map(e => ({ ...e, scope: 'app' as const }))
      const globalConfig = JSON.stringify({ ...globalRest, events: normalizedEvents, printers: globalPrinters })
      await authed(`/api/form-app/infos/${app.id}`, 'PUT', {
        ...app,
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        data_source_id: dataSourceID || 0,
        entry_page_key: entryPageKey,
        global_config: globalConfig,
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
          <label style={{ display: 'block', marginBottom: 4 }}>应用级事件（常驻，跨页面）</label>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 8px' }}>
            在应用加载后注册、跨页面存活。适合全局扫码、应用级状态({'$'}app)监听等。
            页面字段({'$'}form)在此不可用——跨页传值请写 {'$'}app，由目标页 page_enter 读取。
          </p>
          <EventsConfigSection
            events={appEvents}
            onChange={setAppEvents}
            fields={[]}
            printers={globalPrinters}
            interfaceOptions={iface.interfaceOptions}
            thirdPartyEndpointOptions={iface.thirdPartyEndpointOptions}
            connectorInterfaceOptions={iface.connectorInterfaceOptions}
            interfaceSchemas={iface.interfaceSchemas}
            thirdPartySchemas={iface.thirdPartySchemas}
            connectorSchemas={iface.connectorSchemas}
          />
        </div>
        <div>
          <Button type="primary" loading={saving} onClick={save}>保存基本信息</Button>
        </div>
      </div>
    </div>
  )
}
