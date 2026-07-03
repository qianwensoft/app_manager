/**
 * 独立全屏「事件编排」设计页。
 *
 * 承载一个页面的全部事件流（config_json.events[]）：多条事件流、多种触发源
 * （扫码 / 自定义事件 / 按钮 / 字段变更）、触发条件、顺序动作链。
 * 复用 EventsConfigSection（受控 events + onChange）做实际编排，
 * 接口下拉/返回 schema 复用 useInterfaceOptions hook。
 *
 * 路由：/page-events/:pageId
 * 数据：GET/PUT /api/form-app/pages/:pageId 的 config_json.events，
 *      保存时合并回 config，保留 field_definitions/scanner/printers 等其他键。
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Tag, message, Spin } from 'antd'
import type { FieldDef } from '@/runtime/types'
import type { PrinterTemplate } from '@/runtime/printerTypes'
import type { PageEvent } from '@/runtime/eventTypes'
import EventsConfigSection from './EventsConfigSection'
import { useInterfaceOptions } from './useInterfaceOptions'

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

export default function PageEventsDesignerPage() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusEventId = searchParams.get('eventId') || ''

  const [page, setPage] = useState<any>(null)
  const [fields, setFields] = useState<FieldDef[]>([])
  const [printers, setPrinters] = useState<PrinterTemplate[]>([])
  const [events, setEvents] = useState<PageEvent[]>([])
  const [config, setConfig] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const {
    interfaceOptions,
    thirdPartyEndpointOptions,
    connectorInterfaceOptions,
    interfaceSchemas,
    thirdPartySchemas,
    connectorSchemas,
  } = useInterfaceOptions()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
        if (cancelled) return
        const d = res.data
        setPage(d)
        const cfg = d.config_json ? JSON.parse(d.config_json) : {}
        setConfig(cfg)
        setFields(cfg.field_definitions || [])
        setPrinters(Array.isArray(cfg.printers) ? cfg.printers : [])
        setEvents(Array.isArray(cfg.events) ? cfg.events : [])
      } catch (e: any) {
        message.error(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [pageId])

  const save = async () => {
    setSaving(true)
    try {
      // 先拉最新 config，避免覆盖其他端在此期间的改动；仅替换 events
      const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
      const latest = res.data?.config_json ? JSON.parse(res.data.config_json) : config
      const merged = { ...latest, events }
      await authed(`/api/form-app/pages/${pageId}`, 'PUT', {
        config_json: JSON.stringify(merged),
      })
      setConfig(merged)
      message.success('事件已保存')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spin size="large" /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f6fa' }}>
      {/* 顶栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
      }}>
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          事件编排：<code style={{ background: '#f0f4ff', padding: '1px 6px', borderRadius: 4 }}>{page?.page_key}</code>
        </span>
        {page?.title && <Tag color="blue">{page.title}</Tag>}
        <Tag>{events.length} 条事件流</Tag>
        <span style={{ flex: 1 }} />
        <Button type="primary" loading={saving} onClick={save}>保存</Button>
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}>
            为本页配置多条事件流。每条事件流 = 触发源（扫码 / 自定义事件 / 按钮 / 字段变更）→ 触发条件 → 顺序动作链（设字段 / 调接口 / 打印 / 跳页 / 语音播报 / 提示）。
            {focusEventId && <span style={{ marginLeft: 8, color: '#1677ff' }}>聚焦事件：{focusEventId}</span>}
          </div>
          <EventsConfigSection
            events={events}
            onChange={setEvents}
            fields={fields}
            printers={printers}
            buttons={fields
              .filter(f => f.component === 'PrintButton' || f.button_id)
              .map(f => ({
                buttonId: f.button_id || f.field,
                text: f.button_text || f.label || f.field,
                component: f.component,
              }))}
            interfaceOptions={interfaceOptions}
            thirdPartyEndpointOptions={thirdPartyEndpointOptions}
            connectorInterfaceOptions={connectorInterfaceOptions}
            interfaceSchemas={interfaceSchemas}
            thirdPartySchemas={thirdPartySchemas}
            connectorSchemas={connectorSchemas}
          />
        </div>
      </div>
    </div>
  )
}
