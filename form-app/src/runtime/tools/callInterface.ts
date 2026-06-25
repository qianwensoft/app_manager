import { registerTool } from './types'
import { resolveNestedField } from '../eventEngine'

/**
 * 调接口：internal / third_party / connector 分发；result_map 回填（按 result_scope，默认 page）。
 * 默认带 15s 超时（接口调用最该有超时）。返回 { result } 供 $node 引用。
 */
registerTool({
  name: 'call_interface',
  defaults: { timeout: 15000 },
  execute: async (a, { ctx, deps, resolve, scopeFor }) => {
    if (!deps.onScanInterface) return
    const type: string = a.interface_type || 'internal'
    const paramValues: Record<string, any> = {}
    for (const p of a.param_map || []) {
      if (!p.key) continue
      paramValues[p.key] = resolve(p.src)
    }
    let res: any
    if (type === 'connector' && a.connector_interface_code) {
      res = await deps.onScanInterface(a.connector_interface_code, paramValues, 'connector')
    } else if (type === 'third_party' && a.third_party_endpoint_id) {
      res = await deps.onScanInterface('', paramValues, 'third_party', a.third_party_endpoint_id)
    } else if (a.interface_code) {
      res = await deps.onScanInterface(a.interface_code, paramValues, 'internal')
    } else {
      return
    }
    for (const { response_field, form_field } of a.result_map || []) {
      if (!form_field) continue
      const val = resolveNestedField(res, response_field)
      if (val !== undefined && val !== null) scopeFor(a.result_scope).set(form_field, val)
    }
    return { result: res }
  },
})
