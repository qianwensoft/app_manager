import { useEffect, useRef, useCallback } from 'react'
import type { CanvasElement, PointBinding, ValueFormatter } from '@/types'
import { resolveInterfaceParams, type InterfaceParamContext } from '@/runtime/interfaceParams'
import type { PointDataMap } from './useStompPointData'
import { resolveElementDisplayValue } from '@/runtime/bindingResolver'
import { flattenBindingValue, getPath, ifaceKeyPrefix, parseBindingValue } from '@/runtime/bindingData'

interface Options {
  elements: CanvasElement[]
  onData: (data: PointDataMap) => void
  scadaCode?: string
  pointData?: PointDataMap
  objectContexts?: Record<string, Record<string, unknown>>
  /** 免登分享 token：走 /api/scada/share/interfaces/:id/invoke，不带 JWT */
  shareToken?: string
}

function applyTransform(raw: number, transform?: string): number {
  if (!transform) return raw
  try {
    // eslint-disable-next-line no-new-func
    return Number(new Function('v', `return (${transform})`)(raw))
  } catch {
    return raw
  }
}

/** 格式化最终显示值 */
export function applyFormatter(value: number | string, fmt?: ValueFormatter): string {
  if (!fmt) return String(value)

  let result: string

  // rangeMap 优先：数字原值按范围映射为文字
  if (fmt.rangeMap && fmt.rangeMap.length > 0 && typeof value === 'number') {
    const matched = fmt.rangeMap.find(r => value >= r.min && value <= r.max)
    if (matched) {
      result = matched.label
      return fmt.prefix ? fmt.prefix + result : result
    }
  }

  // 数字精度处理
  if (typeof value === 'number') {
    result = fmt.precision !== undefined && fmt.precision >= 0
      ? value.toFixed(fmt.precision)
      : String(value)
  } else {
    result = String(value)
  }

  // 字符串替换（在精度处理后，对文字结果逐条替换）
  if (fmt.strReplace && fmt.strReplace.length > 0) {
    for (const { from, to } of fmt.strReplace) {
      if (from) result = result.split(from).join(to)
    }
  }

  // 模板优先于前缀/后缀
  if (fmt.template) {
    return fmt.template.replace(/\$\{v\}/g, result)
  }

  // 前缀 + 值 + 后缀
  if (fmt.prefix) result = fmt.prefix + result
  if (fmt.unit) result = result + ' ' + fmt.unit

  return result
}

/**
 * Extract flat PointDataMap from a nested JSON response + field mappings.
 * 键使用元件专属前缀（elId），避免多个绑定同一接口的元件互相覆盖。
 */
function extractMappedData(payload: unknown, binding: PointBinding, elId?: string): PointDataMap {
  const result: PointDataMap = {}
  const mappings = binding.ifaceFieldMappings ?? []
  if (!mappings.length) return result

  const prefix = ifaceKeyPrefix(elId)

  for (const m of mappings) {
    if (!m.sourceField || !m.target) continue

    const val = getPath(payload, m.sourceField)
    if (val === undefined) continue

    if (m.target === 'category') {
      result[`${prefix}category`] = Array.isArray(val) ? val.map(String) : [String(val)]
    } else if (m.target.startsWith('series:')) {
      const idx = parseInt(m.target.slice(7), 10)
      if (Array.isArray(val)) {
        val.forEach((item, itemIndex) => {
          result[`${prefix}series_${idx}_${itemIndex}`] = item
        })
      } else {
        result[`${prefix}series_${idx}`] = val
      }
    } else {
      flattenBindingValue(`${prefix}${m.target}`, val, result)
    }
  }

  return result
}

/** Fetch interface data for a single binding and merge results */
async function fetchIfaceData(binding: PointBinding, context: InterfaceParamContext, elId?: string, shareToken?: string): Promise<PointDataMap> {
  if (!binding.ifaceId) return {}
  const sourceType = binding.ifaceSourceType ?? 'data_iface'

  // 分享态：外部开放接口/Webhook 无免登代理路径，安全起见跳过（避免走 JWT 路径导致 401 噪声）。
  if (shareToken && sourceType !== 'data_iface') return {}

  try {
    const token = localStorage.getItem('token') ?? ''
    const params = resolveInterfaceParams(binding, [], context)

    // 分享态：受限只读，token 走 body，服务端按画布引用白名单校验。
    const url = shareToken
      ? `/api/scada/share/interfaces/${binding.ifaceId}/invoke`
      : sourceType === 'open_api'
        // 外部应用开放接口：走出站代理 /api/outbound/endpoints/:id/call
        ? `/api/outbound/endpoints/${binding.ifaceId}/call`
        : `/api/data/interfaces/${binding.ifaceId}/invoke`

    const body = shareToken
      ? JSON.stringify({ share_token: shareToken, param_values: params, limit: 500 })
      : sourceType === 'open_api'
        ? JSON.stringify({ param_values: params })
        : JSON.stringify({ param_values: params, limit: 500 })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 分享态不携带 JWT（后端为免登路由）
        ...(!shareToken && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    })
    if (!res.ok) return {}
    const json = await res.json()
    // open_api 代理返回 { success, data, status_code }，失败时不合并数据
    if (sourceType === 'open_api' && json.success === false) return {}
    // Invoke responses are normalized but historic endpoints vary in nesting.
    const payload = json.data ?? json.rows ?? json.row ?? json.result ?? json
    const parsed = typeof payload === 'string' ? parseBindingValue(payload) : payload
    if (parsed === undefined) return {}
    return extractMappedData(parsed, binding, elId)
  } catch {
    return {}
  }
}

/** Resolve static binding data to PointDataMap */
function resolveStaticData(binding: PointBinding): PointDataMap {
  const result: PointDataMap = {}
  const sd = binding.staticData ?? {}
  for (const [key, raw] of Object.entries(sd)) {
    const value = parseBindingValue(raw)
    if (value === undefined) continue
    flattenBindingValue(`__static_${key}`, value, result)
  }
  return result
}

/**
 * Polls interface-mode bindings across all elements and calls onData with resolved PointDataMap.
 * Static-mode data is resolved synchronously on mount/update.
 */
export function useInterfaceBindingData({ elements, onData, scadaCode = '', pointData = {}, objectContexts = {}, shareToken }: Options) {
  const onDataRef = useRef(onData)
  onDataRef.current = onData
  const contextRef = useRef({ elements, scadaCode, pointData, objectContexts, shareToken })
  contextRef.current = { elements, scadaCode, pointData, objectContexts, shareToken }
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const setupElement = useCallback((el: CanvasElement) => {
    const binding = el.pointBinding
    if (!binding) return

    // Static mode: resolve once
    if (binding.mode === 'static') {
      const data = resolveStaticData(binding)
      if (Object.keys(data).length) onDataRef.current(data)
      return
    }

    // Interface mode: poll (平台数据接口 data_iface 或外部应用开放接口 open_api)
    const ifaceSource = binding.ifaceSourceType ?? 'data_iface'
    if (binding.mode === 'interface' && (ifaceSource === 'data_iface' || ifaceSource === 'open_api') && binding.ifaceId && binding.ifaceTransport !== 'stomp') {
      const intervalMs = binding.ifaceRefreshMs ?? 5000
      const poll = async () => {
        const current = contextRef.current
        const data = await fetchIfaceData(binding, {
          scadaCode: current.scadaCode,
          elements: current.elements,
          pointData: current.pointData,
          objectContext: current.objectContexts[el.id],
        }, el.id, current.shareToken)
        if (Object.keys(data).length) onDataRef.current(data)
      }
      poll()
      if (intervalMs > 0) {
        const timer = setInterval(poll, intervalMs)
        timersRef.current.set(el.id, timer)
      }
    }
  }, [])

  useEffect(() => {
    // Clear old timers
    timersRef.current.forEach((t) => clearInterval(t))
    timersRef.current.clear()

    for (const el of elements) {
      setupElement(el)
    }

    return () => {
      timersRef.current.forEach((t) => clearInterval(t))
      timersRef.current.clear()
    }
  }, [elements, setupElement])
}

/**
 * Resolve a single element's display value from the merged pointData map,
 * supporting all 4 binding modes.
 */
export function resolveElementValue(el: CanvasElement, pointData: PointDataMap): string | undefined {
  return resolveElementDisplayValue(el, pointData)
}
