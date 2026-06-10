import { useEffect, useRef, useCallback } from 'react'
import type { CanvasElement, PointBinding, ValueFormatter } from '@/types'
import type { PointDataMap } from './useStompPointData'
import { resolveElementDisplayValue } from '@/runtime/bindingResolver'

interface Options {
  elements: CanvasElement[]
  onData: (data: PointDataMap) => void
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

/** Extract flat PointDataMap from a nested JSON response + field mappings */
function extractMappedData(payload: unknown, binding: PointBinding): PointDataMap {
  const result: PointDataMap = {}
  const mappings = binding.ifaceFieldMappings ?? []
  if (!mappings.length) return result

  const schema = binding.chartSeriesKeys

  for (const m of mappings) {
    if (!m.sourceField || !m.target) continue

    // Resolve sourceField path (dot-separated) from payload
    let val: unknown = payload
    for (const seg of m.sourceField.split('.')) {
      if (val && typeof val === 'object') {
        val = (val as Record<string, unknown>)[seg]
      } else {
        val = undefined
        break
      }
    }

    if (val === undefined) continue
    const num = Number(val)

    // Map to target key
    if (m.target === 'category') {
      // store as-is for category (string array)
      result[`__iface_category`] = num
    } else if (m.target.startsWith('series:')) {
      const idx = parseInt(m.target.slice(7), 10)
      // For arrays, expand to individual keys: series:0:0, series:0:1, ...
      if (Array.isArray(val)) {
        val.forEach((v, i) => {
          result[`__iface_series_${idx}_${i}`] = Number(v)
        })
      } else {
        result[`__iface_series_${idx}`] = num
      }
    } else {
      // Element property target (text, fill, value...)
      result[`__iface_${m.target}`] = num
    }
  }

  return result
}

/** Fetch interface data for a single binding and merge results */
async function fetchIfaceData(binding: PointBinding): Promise<PointDataMap> {
  if (binding.ifaceSourceType !== 'data_iface') return {}
  if (!binding.ifaceId) return {}

  try {
    const token = localStorage.getItem('token') ?? ''
    const url = `/api/data/interfaces/${binding.ifaceId}/invoke`
    const params = binding.ifaceParamValues ?? {}

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ param_values: params, limit: 500 }),
    })
    if (!res.ok) return {}
    const json = await res.json()
    // invoke endpoint returns { data: [...] } (objects) or { row: {...} }; tolerate legacy shapes too
    const payload = json.data ?? json.rows ?? json.row ?? json.result ?? json

    return extractMappedData(
      typeof payload === 'string' ? JSON.parse(payload) : payload,
      binding,
    )
  } catch {
    return {}
  }
}

/** Resolve static binding data to PointDataMap */
function resolveStaticData(binding: PointBinding): PointDataMap {
  const result: PointDataMap = {}
  const sd = binding.staticData ?? {}
  if (sd.value !== undefined) {
    const n = typeof sd.value === 'number' ? sd.value : parseFloat(String(sd.value))
    if (!isNaN(n)) result.__static_value = n
  }
  for (const [key, val] of Object.entries(sd)) {
    if (typeof val === 'number') {
      result[`__static_${key}`] = val
    } else if (typeof val === 'string') {
      const n = parseFloat(val)
      if (!isNaN(n)) result[`__static_${key}`] = n
    } else if (Array.isArray(val)) {
      ;(val as unknown[]).forEach((v, i) => {
        result[`__static_${key}_${i}`] = Number(v)
      })
    }
  }
  return result
}

/**
 * Polls interface-mode bindings across all elements and calls onData with resolved PointDataMap.
 * Static-mode data is resolved synchronously on mount/update.
 */
export function useInterfaceBindingData({ elements, onData }: Options) {
  const onDataRef = useRef(onData)
  onDataRef.current = onData
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

    // Interface mode: poll
    if (binding.mode === 'interface' && binding.ifaceSourceType === 'data_iface' && binding.ifaceId) {
      const intervalMs = binding.ifaceRefreshMs ?? 5000
      const poll = async () => {
        const data = await fetchIfaceData(binding)
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
