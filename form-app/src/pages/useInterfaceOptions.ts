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
  interfaceParamSchemas: Record<string, string> // 新增：参数契约
  thirdPartyParamSchemas: Record<string, string>
  connectorParamSchemas: Record<string, string>
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
  const [interfaceParamSchemas, setInterfaceParamSchemas] = useState<Record<string, string>>({})
  const [thirdPartyParamSchemas, setThirdPartyParamSchemas] = useState<Record<string, string>>({})
  const [connectorParamSchemas, setConnectorParamSchemas] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    const loadInterfaces = async () => {
      try {
        const res = await authed('/api/data/interfaces?page_size=500', 'GET')
        const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.list || [])
        if (cancelled) return
        setInterfaceOptions(
          list
            .filter((it: any) => it.code != null && it.code !== '')
            .map((it: any) => ({
              value: it.code,
              label: `${it.code}${it.name ? `（${it.name}）` : ''}`,
            }))
            .filter((opt: any) => opt.value != null) // 二次过滤确保没有 null
        )
        const schemas: Record<string, string> = {}
        const paramSchemas: Record<string, string> = {}
        for (const it of list) {
          if (it.code && it.output_schema_json) schemas[it.code] = it.output_schema_json
          if (it.code && it.param_contract_json) paramSchemas[it.code] = it.param_contract_json
        }
        setInterfaceSchemas(schemas)
        setInterfaceParamSchemas(paramSchemas)
      } catch { /* 静默 */ }
    }

    const loadThirdPartyEndpoints = async () => {
      try {
        const res = await authed('/api/outbound/endpoints?page_size=500', 'GET')
        const list: any[] = Array.isArray(res.data) ? res.data : []
        if (cancelled) return
        setThirdPartyEndpointOptions(
          list
            .filter((it: any) => it.id != null)
            .map((it: any) => ({
              value: String(it.id),
              label: `${it.name}${it.app?.name ? ` [${it.app.name}]` : ''}`,
            }))
            .filter((opt: any) => opt.value != null && opt.value !== 'null') // 二次过滤确保没有 null
        )
        const schemas: Record<string, string> = {}
        const paramSchemas: Record<string, string> = {}
        for (const it of list) {
          if (it.id && it.response_schema) schemas[String(it.id)] = it.response_schema
          if (it.id && it.request_schema) paramSchemas[String(it.id)] = it.request_schema
        }
        setThirdPartySchemas(schemas)
        setThirdPartyParamSchemas(paramSchemas)
      } catch { /* 静默 */ }
    }

    const loadConnectorInterfaces = async () => {
      try {
        const res = await authed('/api/outbound/connector-interfaces', 'GET')
        const list: any[] = Array.isArray(res.data) ? res.data : []
        if (cancelled) return
        setConnectorInterfaceOptions(
          list
            .filter((it: any) => it.interface_code != null && it.interface_code !== '')
            .map((it: any) => ({
              value: it.interface_code,
              label: `${it.interface_code}${it.name ? ` - ${it.name}` : ''}`,
            }))
            .filter((opt: any) => opt.value != null) // 二次过滤确保没有 null
        )
        const schemas: Record<string, string> = {}
        const paramSchemas: Record<string, string> = {}
        for (const it of list) {
          if (it.interface_code && it.output_schema_json) schemas[it.interface_code] = it.output_schema_json
          if (it.interface_code && it.param_contract_json) paramSchemas[it.interface_code] = it.param_contract_json
        }
        setConnectorSchemas(schemas)
        setConnectorParamSchemas(paramSchemas)
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
    interfaceParamSchemas,
    thirdPartyParamSchemas,
    connectorParamSchemas,
  }
}
