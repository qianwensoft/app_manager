import { registerTool } from './types'

/**
 * 触发自定义事件：经带环路守卫的 emit 派发（ctx.emit 已绑定本次 EmitScope）。
 * 载荷：对象/数组序列化为 JSON 字符串，与监听端（custom_event 源）JSON.parse 还原约定一致。
 */
registerTool({
  name: 'emit_event',
  execute: async (a, { resolve, emit }) => {
    if (!a.event_name) return
    let data = ''
    if (a.data_src !== undefined && a.data_src !== '') {
      const raw = resolve(a.data_src)
      data = raw == null ? '' : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw))
    }
    emit(a.event_name, data)
  },
})
