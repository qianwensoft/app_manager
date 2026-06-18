import { registerTool } from './types'

/**
 * 设字段展示属性：truthy/visible→display/background/color→style 等语义已下沉到
 * PageState 适配器；按 scope（默认 page）取容器（app 作用域 setProp 为 no-op）。
 */
registerTool({
  name: 'set_field_prop',
  execute: async (a, { resolve, scopeFor }) => {
    if (!a.field || !a.prop) return
    const raw = resolve(a.value_src)
    scopeFor(a.scope).setProp(a.field, a.prop, raw)
  },
})
