/**
 * 接口下拉数据的共用 hook：内部数据接口 / 第三方端点 / 连接器接口
 * 三类的下拉选项与返回 schema 一次性加载，供字段配置页、事件设计页、
 * 设计器属性区事件页签复用，避免在多处重复请求与解析逻辑。
 */
import { useEffect, useState } from 'react'

export interface IfaceOption {
  value: string
  label: string
}

export interface InterfaceOptionsData {
  interfaceOptions: IfaceOption[]
  thirdPartyEndpointOptions: IfaceOption[]
  connectorInterfaceOptions: IfaceOption[]
  interfaceSchemas: Record<string, string>
  thirdPartySchemas: Record<string, string>
  connectorSchemas: Record<string, string>
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

export function useInterfaceOptions(): InterfaceOptionsData {
  const [interfaceOptions, setInterfaceOptions] = useState<IfaceOption[]>([])
  const [thirdPartyEndpointOptions, setThirdPartyEndpointOptions] = useState<IfaceOption[]>([])
  const [connectorInterfaceOptions, setConnectorInterfaceOptions] = useState<IfaceOption[]>([])
  const [interfaceSchemas, setInterfaceSchemas] = useState<Record<string, string>>({})
  const [thirdPartySchemas, setThirdPartySchemas] = useState<Record<string, string>>({})
  const [connectorSchemas, setConnectorSchemas] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    const loadInterfaces = async () => {
      try {
        const res = await authed('/api/data/interfaces?page_size=500', 'GET')
        const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.list || [])
        if (cancelled) return
        setInterfaceOptions(list.map((it: any) => ({
          value: it.code,
          label: `${it.code}${it.name ? `（${it.name}）` : ''}`,
        })))
        const schemas: Record<string, string> = {}
        for (const it of list) {
          if (it.code && it.output_schema_json) schemas[it.code] = it.output_schema_json
        }
        setInterfaceSchemas(schemas)
      } catch { /* 静默 */ }
    }

    const loadThirdPartyEndpoints = async () => {
      try {
        const res = await authed('/api/outbound/endpoints?page_size=500', 'GET')
        const list: any[] = Array.isArray(res.data) ? res.data : []
        if (cancelled) return
        setThirdPartyEndpointOptions(list.map((it: any) => ({
          value: String(it.id),
          label: `${it.name}${it.app?.name ? ` [${it.app.name}]` : ''}`,
        })))
        const schemas: Record<string, string> = {}
        for (const it of list) {
          if (it.id && it.response_schema) schemas[String(it.id)] = it.response_schema
        }
        setThirdPartySchemas(schemas)
      } catch { /* 静默 */ }
    }

    const loadConnectorInterfaces = async () => {
      try {
        const res = await authed('/api/outbound/connector-interfaces', 'GET')
        const list: any[] = Array.isArray(res.data) ? res.data : []
        if (cancelled) return
        setConnectorInterfaceOptions(list.map((it: any) => ({
          value: it.interface_code,
          label: `${it.interface_code}${it.name ? ` - ${it.name}` : ''}`,
        })))
        const schemas: Record<string, string> = {}
        for (const it of list) {
          if (it.interface_code && it.output_schema_json) schemas[it.interface_code] = it.output_schema_json
        }
        setConnectorSchemas(schemas)
      } catch { /* 静默 */ }
    }

    loadInterfaces()
    loadThirdPartyEndpoints()
    loadConnectorInterfaces()

    return () => { cancelled = true }
  }, [])

  return {
    interfaceOptions,
    thirdPartyEndpointOptions,
    connectorInterfaceOptions,
    interfaceSchemas,
    thirdPartySchemas,
    connectorSchemas,
  }
}
