import { registerTool } from './types'

/** 清空字段：将多个字段重置为默认值 */
registerTool({
  name: 'clear_fields',
  execute: async (a, { scopeFor }) => {
    if (!Array.isArray(a.fields) || a.fields.length === 0) return
    const scope = scopeFor(a.scope)
    const clearValue = a.clear_value !== undefined ? a.clear_value : ''
    for (const field of a.fields) {
      if (!field) continue
      scope.set(field, clearValue)
    }
  },
})
