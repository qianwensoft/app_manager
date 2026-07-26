/**
 * 工作流动作工具注册表（ToolRegistry）。
 *
 * 每个动作类型对应一个「工具」：新增动作 = 新增 tools/xxx.ts + registerTool，
 * 引擎无需改 switch。动作对象的 type 即工具名，其余字段即该工具的 params。
 *
 * 降级配置（超时/重试）挂在 Tool.defaults，可被动作级 timeout/retry 覆盖（见 ../degrade.ts）。
 * 参考 form-app runtime/tools/types.ts。
 */
import type { WorkflowAction, StateScopeKind } from '@/types/workflow'
import type { WorkflowContext, WorkflowEngineDeps, ContextStore, ElementScope } from '../types'

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
  /** 本次触发的执行上下文（point/global/workflow/event/node 快照） */
  ctx: WorkflowContext
  /** 运行时依赖 */
  deps: WorkflowEngineDeps
  /** 元素读写适配层 */
  elementScope: ElementScope
  /** 解析值来源表达式（$point/$global/$workflow/$node/$event/字面量），已绑定本次 ctx */
  resolve: (src?: string) => unknown
  /** 按作用域取上下文容器（'global'→globalContext，'workflow'→本次执行上下文） */
  scopeFor: (scope: Exclude<StateScopeKind, 'element'>) => ContextStore
  /** 触发自定义事件（带环路守卫的 emit），已绑定本次触发链 */
  emit: (eventName: string, data: unknown) => void
  /** 执行一段用户脚本（注入 ScriptApi 的 ctx），已绑定本次 ctx/deps */
  runScript: (scriptBody: string) => Promise<unknown>
}

export interface Tool {
  /** 工具名 = 动作 type，全局唯一 */
  name: string
  /** 默认降级配置（可被动作级 timeout/retry 覆盖） */
  defaults?: { timeout?: number; retry?: RetryConfig }
  /**
   * 执行。action = 动作对象本身（含其专属字段）。
   * 返回值进 $node.<id>（DAG 用）；线性阶段返回 void 即可。
   */
  execute(action: WorkflowAction, x: ToolExecCtx): Promise<Record<string, unknown> | void>
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
