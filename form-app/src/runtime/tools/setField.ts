import { registerTool } from './types'

/** 写字段值：按 scope（默认 page）写入对应状态容器 */
registerTool({
  name: 'set_field',
  execute: async (a, { ctx, resolve, scopeFor }) => {
    if (!a.field) return
    const val = resolve(a.value_src)
    if (val !== undefined) scopeFor(a.scope).set(a.field, val)
  },
})
