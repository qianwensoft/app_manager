/**
 * 工具注册入口：import 各工具触发 registerTool 副作用。
 * eventEngine 顶部 import 一次即完成全部注册。
 */
import './setField'
import './setFieldsBatch'
import './clearFields'
import './callInterface'
import './print'
import './navigate'
import './toast'
import './setFieldProp'
import './setFieldPropsBatch'
import './speak'
import './emitEvent'
import './runScript'
import './emitCrossApp'

export { getTool, toolNames, registerTool } from './types'
export type { Tool, ToolExecCtx, RetryConfig } from './types'
