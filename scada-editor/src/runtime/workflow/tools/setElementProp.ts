import { registerTool } from './types'
import type { SetElementPropAction } from '@/types/workflow'

/** 设置元素任意属性（支持 properties.* 点路径）到匹配的所有元素/模板实例 */
registerTool({
  name: 'set_element_prop',
  execute: async (action, { elementScope, resolve }) => {
    const a = action as SetElementPropAction
    if (!a.targetSel || !a.prop) return
    const value = resolve(a.value_src)
    elementScope.setProp(a.targetSel, a.prop, value)
    return { value }
  },
})
