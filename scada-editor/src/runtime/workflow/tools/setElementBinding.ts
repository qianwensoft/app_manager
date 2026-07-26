import { registerTool } from './types'
import type { SetElementBindingAction } from '@/types/workflow'

/** 注入元素绑定值：写运行时 pointData 覆盖层，供 bindingResolver 读取（类 form-app set_field） */
registerTool({
  name: 'set_element_binding',
  execute: async (action, { elementScope, resolve }) => {
    const a = action as SetElementBindingAction
    if (!a.targetSel) return
    const value = resolve(a.value_src)
    elementScope.setBinding(a.targetSel, value)
    return { value }
  },
})
