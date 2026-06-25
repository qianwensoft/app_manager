import { registerTool } from './types'

/** 跳页：param_map 解析为跳转参数 */
registerTool({
  name: 'navigate',
  execute: async (a, { deps, resolve }) => {
    if (!deps.navigate || !a.to_page_key) return
    const params: Record<string, any> = {}
    for (const p of a.param_map || []) {
      if (!p.key) continue
      params[p.key] = resolve(p.src)
    }
    deps.navigate(a.to_page_key, params)
  },
})
