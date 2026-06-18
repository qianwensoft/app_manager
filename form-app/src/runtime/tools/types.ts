/**
 * 工具注册表（ToolRegistry）。
 *
 * 把事件动作从闭合 union + 大 switch，收敛为「工具」注册表：加工具只需新增一个
 * tools/xxx.ts + registerTool，不再改引擎 switch。动作对象的 type 即工具名，
 * 动作其余字段即该工具的 params（保留存储格式，存量零迁移）。
 *
 * 工具文件只 import 本模块（类型）与各自所需的 bridge（print/speak 等），
 * 通过 ToolExecCtx 上的 bound 辅助函数访问引擎能力（resolve/scopeFor/emit/runScript），
 * 避免与 eventEngine 形成运行时循环依赖。
 *
 * 降级配置（超时/重试）挂在 Tool.defaults 上，可被动作级配置覆盖（见 degrade.ts）。
 * 详见 docs/第3-4步-ToolRegistry与降级守卫落地设计.md。
 */
import type { StateScope } from '../pageState'
import type { EventContext, StateScopeKind } from '../eventTypes'
import type { EventEngineDeps } from '../eventEngine'

/** 重试配置 */
export interface RetryConfig {
  /** 最大尝试次数（含首次）；1 = 不重试 */
  maxAttempts: number
  backoff: 'fixed' | 'linear' | 'exponential'
  /** 初始间隔 ms */
  initialDelay: number
  /** 间隔上限 ms */
  maxDelay?: number
}

/** 工具执行上下文：携带快照、依赖与引擎注入的 bound 辅助函数 */
export interface ToolExecCtx {
  /** 本次事件触发的上下文（scan / form / app / event 快照） */
  ctx: EventContext
  /** 运行时依赖（pageState / appState / onScanInterface / doPrint / navigate / toast） */
  deps: EventEngineDeps
  /** 解析值来源表达式（$scan/$form.x/$app.x/$event.x/字面量），已绑定本次 ctx */
  resolve: (src?: string) => any
  /** 按作用域取状态容器（'app'→appState，'page'/缺省→pageState），已绑定 deps */
  scopeFor: (scope?: StateScopeKind) => StateScope
  /** 触发自定义事件（带环路守卫的 emit），已绑定本次触发的 EmitScope */
  emit: (eventName: string, data: string) => void
  /** 执行一段用户脚本（注入 ScriptApi 的 ctx），已绑定本次 ctx/deps */
  runScript: (scriptBody: string) => Promise<void>
}

export interface Tool {
  /** 工具名 = 动作 type，全局唯一 */
  name: string
  /** 默认降级配置（可被动作级 timeout/retry 覆盖） */
  defaults?: { timeout?: number; retry?: RetryConfig }
  /**
   * 执行。action = 动作对象本身（含其专属字段）。
   * 返回值进 $node.<id>（第 5 步 DAG 用）；线性阶段返回 void 即可。
   */
  execute(action: any, x: ToolExecCtx): Promise<Record<string, any> | void>
}

const registry = new Map<string, Tool>()

export function registerTool(t: Tool): void {
  registry.set(t.name, t)
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name)
}

/** 已注册的工具名列表（设计器动作下拉据此生成） */
export function toolNames(): string[] {
  return Array.from(registry.keys())
}
