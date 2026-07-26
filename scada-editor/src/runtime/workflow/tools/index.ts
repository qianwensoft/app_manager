/**
 * 工具注册入口：import 各工具触发 registerTool 副作用。
 * engine 顶部 import 一次即完成全部注册。
 */
import './setElementProp'
import './setElementBinding'
import './setContext'
import './callInterface'
import './switchCanvas'
import './modal'
import './toast'
import './emitEvent'
import './runScript'

export { getTool, toolNames, registerTool } from './types'
export type { Tool, ToolExecCtx, RetryConfig } from './types'
