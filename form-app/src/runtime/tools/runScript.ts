import { registerTool } from './types'

/** 运行脚本：ctx.runScript 已绑定本次 ctx/deps（注入 ScriptApi 的 ctx 变量） */
registerTool({
  name: 'run_script',
  execute: async (a, { runScript }) => {
    if (!a.script || !a.script.trim()) return
    await runScript(a.script)
  },
})
