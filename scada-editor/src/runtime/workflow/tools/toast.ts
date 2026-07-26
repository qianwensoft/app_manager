import { registerTool } from './types'
import type { ToastAction } from '@/types/workflow'

/** 顶部提示 */
registerTool({
  name: 'toast',
  execute: async (action, { deps, resolve }) => {
    const a = action as ToastAction
    const msg = resolve(a.message_src)
    if (msg != null) deps.toast?.(String(msg))
  },
})
