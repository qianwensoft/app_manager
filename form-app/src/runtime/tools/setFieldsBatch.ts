import { registerTool } from './types'

/** 批量设置字段值：按 scope（默认 page）批量写入多个字段 */
registerTool({
  name: 'set_fields_batch',
  execute: async (a, { resolve, scopeFor }) => {
    if (!Array.isArray(a.mappings) || a.mappings.length === 0) return
    const scope = scopeFor(a.scope)
    for (const { field, value_src } of a.mappings) {
      if (!field) continue
      const val = resolve(value_src)
      if (val !== undefined) scope.set(field, val)
    }
  },
})
