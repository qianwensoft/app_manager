import { registerTool } from './types'

/** 打印：data_map 解析为额外占位数据，走 deps.doPrint（AndroidBridge） */
registerTool({
  name: 'print',
  execute: async (a, { deps, resolve }) => {
    if (!deps.doPrint || !a.printer_template_id) return
    const extra: Record<string, any> = {}
    for (const d of a.data_map || []) {
      if (!d.placeholder) continue
      extra[d.placeholder] = resolve(d.src)
    }
    await deps.doPrint(a.printer_template_id, deps.pageState.getValues(), extra)
  },
})
