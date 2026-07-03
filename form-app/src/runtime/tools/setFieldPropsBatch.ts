import { registerTool } from './types'

/** 批量设置字段展示属性：一次性设置多个字段的 visible/disabled/readOnly/background/color/title */
registerTool({
  name: 'set_field_props_batch',
  execute: async (a, { resolve, scopeFor }) => {
    if (!Array.isArray(a.mappings) || a.mappings.length === 0) return
    const scope = scopeFor(a.scope)
    for (const { field, prop, value_src } of a.mappings) {
      if (!field || !prop) continue
      const val = resolve(value_src)
      scope.setProp(field, prop as any, val)
    }
  },
})
