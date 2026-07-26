import { registerTool } from './types'
import type { EmitEventAction } from '@/types/workflow'

/** 触发自定义事件（驱动 source.kind==='custom_event' 的其它工作流），带环路守卫 */
registerTool({
  name: 'emit_event',
  execute: async (action, { emit, resolve }) => {
    const a = action as EmitEventAction
    if (!a.eventName) return
    const data = a.data_src !== undefined ? resolve(a.data_src) : undefined
    emit(a.eventName, data)
  },
})
