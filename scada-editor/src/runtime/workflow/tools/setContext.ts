import { registerTool } from './types'
import type { SetContextAction } from '@/types/workflow'

/** 写上下文（global / workflow） */
registerTool({
  name: 'set_context',
  execute: async (action, { scopeFor, resolve }) => {
    const a = action as SetContextAction
    if (!a.key) return
    const value = resolve(a.value_src)
    scopeFor(a.scope).set(a.key, value)
    return { value }
  },
})
