import { registerTool } from './types'

/** 顶部提示 */
registerTool({
  name: 'toast',
  execute: async (a, { deps, resolve }) => {
    const msg = resolve(a.message_src)
    if (deps.toast && msg !== undefined && msg !== null) deps.toast(String(msg))
  },
})
