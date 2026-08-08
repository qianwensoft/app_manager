import { registerTool } from './types'
import type { CallInterfaceAction } from '@/types/workflow'
import { resolveNestedField } from '../resolveSrc'
import http from '@/api/http'

/**
 * 调数据接口或外部应用接口：param_map 组装入参 → 调用 → result_map 回填（按 result_scope，默认 workflow）。
 * 默认 15s 超时。返回 { result } 供 $node 引用。
 */
registerTool({
  name: 'call_interface',
  defaults: { timeout: 15000 },
  execute: async (action, { deps, resolve, scopeFor }) => {
    const a = action as CallInterfaceAction
    const params: Record<string, unknown> = {}
    for (const p of a.param_map || []) {
      if (!p.key) continue
      params[p.key] = resolve(p.src)
    }

    let res: unknown
    // 优先外部应用接口
    if (a.outboundAppId && a.outboundEndpointId) {
      const callRes: any = await http.post('/outbound/endpoints/debug', {
        endpoint_id: a.outboundEndpointId,
        sample_vars: Object.fromEntries(
          Object.entries(params).map(([k, v]) => [`{{${k}}}`, String(v ?? '')])
        ),
      })
      res = callRes.response_body ? JSON.parse(callRes.response_body) : {}
    } else if (deps.callInterface) {
      // 降级到数据接口
      res = await deps.callInterface({ ifaceId: a.ifaceId, ifaceCode: a.ifaceCode, params })
    } else {
      return
    }

    const scope = scopeFor(a.result_scope ?? 'workflow')
    for (const { response_field, context_key } of a.result_map || []) {
      if (!context_key) continue
      const val = resolveNestedField(res, response_field)
      if (val !== undefined && val !== null) scope.set(context_key, val)
    }
    return { result: res }
  },
})
