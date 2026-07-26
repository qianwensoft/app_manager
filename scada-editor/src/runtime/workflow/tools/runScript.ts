import { registerTool } from './types'
import type { RunScriptAction } from '@/types/workflow'

/** 运行脚本：ctx.runScript 已绑定本次 ctx/deps（注入 ScriptApi 的 ctx 变量）。脚本返回值进 $node */
registerTool({
  name: 'run_script',
  execute: async (action, { runScript }) => {
    const a = action as RunScriptAction
    if (!a.script || !a.script.trim()) return
    const out = await runScript(a.script)
    return (out && typeof out === 'object') ? (out as Record<string, unknown>) : { result: out }
  },
})
