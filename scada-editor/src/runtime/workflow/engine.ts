/**
 * 工作流引擎：注册触发源、执行动作链 / DAG、事件链环路守卫。
 *
 * setupWorkflows(workflows, deps) 返回：
 *  - cleanup()：清理所有订阅/定时器
 *  - triggerComponent(elementId, event)：组件 UI 事件触发（供 trigger-workflow 动作/事件执行器调用）
 *  - triggerLifecycle('canvas_enter'|'canvas_exit')：画布生命周期触发
 *  - notifyPointData(next)：pointData 变化时评估 point_change / condition 边沿
 *  - runWorkflowById(id, base)：按 id 触发（供 ElementEvent 的 trigger-workflow 动作）
 *
 * 触发源：point_change / condition / component / timer / canvas_enter|exit / custom_event / context_change。
 * 参考 form-app runtime/eventEngine.ts。
 */
import type {
  ScadaWorkflow,
  WorkflowAction,
  FlowNode,
  StateScopeKind,
  ConditionExpr,
} from '@/types/workflow'
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { WorkflowContext, WorkflowEngineDeps, ContextStore } from './types'
import { resolveSrc } from './resolveSrc'
import { evalCondition } from './condition'
import { getTool } from './tools'
import './tools' // 触发工具注册副作用
import { withTimeout, withRetry, resolveDegrade, type DegradeFields } from './degrade'
import { emitBus, makeGuardedEmit, rootEmitScope, type EmitScope } from './emitBus'
import { execScript } from './scriptApi'
import { runGraph } from './dag/scheduler'

export interface WorkflowRuntime {
  cleanup: () => void
  triggerComponent: (elementId: string, event: 'click' | 'dblclick' | 'hover') => void
  triggerLifecycle: (kind: 'canvas_enter' | 'canvas_exit') => void
  notifyPointData: (next: PointDataMap) => void
  runWorkflowById: (id: string, base?: Partial<WorkflowContext>) => void
}

const NULL_STORE: ContextStore = {
  getAll: () => ({}),
  get: () => undefined,
  set: () => {},
  subscribe: () => () => {},
}

export function setupWorkflows(workflows: ScadaWorkflow[], deps: WorkflowEngineDeps): WorkflowRuntime {
  const disposers: Array<() => void> = []
  const enabled = (workflows || []).filter((w) => w.enabled !== false)

  // ── 单次执行：构造 wfStore + makeCtx（每动作读活的 global/workflow 快照） ──
  const runWorkflow = async (wf: ScadaWorkflow, base: Partial<WorkflowContext>, scope: EmitScope) => {
    const wfStore = deps.makeWorkflowContext()

    const makeCtx = (extra: Partial<WorkflowContext> = {}): WorkflowContext => ({
      event: extra.event ?? base.event,
      pointKey: extra.pointKey ?? base.pointKey,
      point: deps.getPointData(),
      global: deps.globalContext.getAll(),
      workflow: wfStore.getAll(),
      nodeOutputs: extra.nodeOutputs ?? base.nodeOutputs,
    })

    // 触发前置条件
    if (wf.when && !evalCondition(wf.when, makeCtx())) return

    const scopeFor = (s: Exclude<StateScopeKind, 'element'>): ContextStore =>
      s === 'global' ? (deps.globalContext ?? NULL_STORE) : wfStore

    const guardedEmit = makeGuardedEmit(scope, deps.toast)

    // 执行单个动作：查表 → 套超时/重试 → execute
    const runAction = async (
      action: WorkflowAction,
      ctxOverride?: Partial<WorkflowContext>,
    ): Promise<Record<string, unknown> | void> => {
      const tool = getTool(action.type)
      if (!tool) { deps.toast?.(`未知工具：${action.type}`); return }
      const ctx = makeCtx(ctxOverride)
      const x = {
        ctx,
        deps,
        elementScope: deps.elementScope,
        resolve: (src?: string) => resolveSrc(src, ctx),
        scopeFor,
        emit: guardedEmit,
        runScript: (body: string) => execScript(body, ctx, deps, deps.elementScope, wfStore, guardedEmit),
      }
      const { timeout, retry } = resolveDegrade(action as DegradeFields, tool)
      return withRetry(() => withTimeout(Promise.resolve(tool.execute(action, x)), timeout), retry)
    }

    // DAG 路径：有节点时走拓扑调度
    if (wf.graph && wf.graph.nodes && wf.graph.nodes.length > 0) {
      const runNode = async (node: FlowNode, nodeCtx: WorkflowContext) => {
        if (node.kind === 'run_script') {
          return runAction({ type: 'run_script', script: node.script || '' } as WorkflowAction, { nodeOutputs: nodeCtx.nodeOutputs })
        }
        return runAction(node.action as WorkflowAction, { nodeOutputs: nodeCtx.nodeOutputs })
      }
      await runGraph(wf.graph, makeCtx(), runNode, deps.onTrace, deps.toast)
      return
    }

    // 线性动作链
    const actions = wf.actions || []
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      if (action.when && !evalCondition(action.when, makeCtx())) continue
      try {
        await runAction(action)
      } catch (e: unknown) {
        const strategy = action.onError ?? 'abort'
        deps.toast?.(`工作流「${wf.name || wf.id}」动作${i + 1}失败：${e instanceof Error ? e.message : e}`)
        if (strategy === 'continue') continue
        if (strategy === 'fallback' && action.fallbackActionIndex != null) {
          const fb = actions[action.fallbackActionIndex]
          if (fb) { try { await runAction(fb) } catch { /* 回退也失败则止于此 */ } }
          continue
        }
        break
      }
    }
  }

  const fire = (wf: ScadaWorkflow, base: Partial<WorkflowContext> = {}, scope: EmitScope = rootEmitScope()) => {
    void runWorkflow(wf, base, scope)
  }

  // ── custom_event：订阅事件总线 ──
  for (const wf of enabled) {
    if (wf.source.kind !== 'custom_event') continue
    const name = wf.source.eventName
    if (!name) continue
    const handler = (data: unknown, scope?: EmitScope) => fire(wf, { event: data }, scope ?? rootEmitScope())
    disposers.push(emitBus.on(name, handler))
  }

  // ── context_change：订阅 global / workflow 上下文变化 ──
  for (const wf of enabled) {
    if (wf.source.kind !== 'context_change') continue
    const { scope: ctxScope, key } = wf.source
    if (ctxScope !== 'global') continue // workflow 作用域为单次执行态，无跨执行订阅意义
    const unsub = deps.globalContext.subscribe((shortName, value) => {
      if (shortName !== key) return
      fire(wf, { event: value })
    })
    disposers.push(unsub)
  }

  // ── timer：定时器 ──
  for (const wf of enabled) {
    if (wf.source.kind !== 'timer') continue
    const { delay, interval, repeat } = wf.source
    let count = 0
    let intervalId: ReturnType<typeof setInterval> | undefined

    const execute = () => {
      fire(wf)
      count++
      if (repeat && count >= repeat && intervalId) clearInterval(intervalId)
    }

    if (interval) {
      const firstTimer = setTimeout(() => {
        execute()
        if (!repeat || count < repeat) {
          intervalId = setInterval(execute, interval)
          disposers.push(() => intervalId && clearInterval(intervalId))
        }
      }, delay)
      disposers.push(() => clearTimeout(firstTimer))
    } else {
      const timerId = setTimeout(execute, delay)
      disposers.push(() => clearTimeout(timerId))
    }
  }

  // ── point_change / condition：pointData 变化时评估边沿 ──
  const prevPoint: PointDataMap = { ...deps.getPointData() }
  const condEdgeState = new Map<string, boolean>() // 工作流 id → 上次 condition 结果（false→true 边沿）

  const notifyPointData = (next: PointDataMap) => {
    for (const wf of enabled) {
      if (wf.source.kind === 'point_change') {
        const key = wf.source.pointKey
        if (!key) continue
        if (!Object.is(prevPoint[key], next[key])) {
          fire(wf, { pointKey: key, event: next[key] })
        }
      } else if (wf.source.kind === 'condition') {
        const cond = parseConditionExpr(wf.source.expr)
        if (!cond) continue
        const ctx: WorkflowContext = {
          point: next,
          global: deps.globalContext.getAll(),
          workflow: {},
        }
        const now = evalCondition(cond, ctx)
        const was = condEdgeState.get(wf.id) ?? false
        condEdgeState.set(wf.id, now)
        if (now && !was) fire(wf, { event: next }) // false→true 边沿
      }
    }
    Object.assign(prevPoint, next)
  }

  // ── component：组件 UI 事件触发 ──
  const triggerComponent = (elementId: string, event: 'click' | 'dblclick' | 'hover') => {
    for (const wf of enabled) {
      if (wf.source.kind !== 'component') continue
      if (wf.source.elementId !== elementId || wf.source.event !== event) continue
      fire(wf, { event: { elementId, event } })
    }
  }

  // ── canvas_enter / canvas_exit：生命周期触发 ──
  const triggerLifecycle = (kind: 'canvas_enter' | 'canvas_exit') => {
    for (const wf of enabled) {
      if (wf.source.kind !== kind) continue
      fire(wf)
    }
  }

  // ── 按 id 触发（供 ElementEvent 的 trigger-workflow 动作） ──
  const runWorkflowById = (id: string, base: Partial<WorkflowContext> = {}) => {
    const wf = enabled.find((w) => w.id === id)
    if (wf) fire(wf, base)
  }

  return { cleanup: () => disposers.forEach((d) => d()), triggerComponent, triggerLifecycle, notifyPointData, runWorkflowById }
}

/**
 * 解析 condition 源的表达式串为 ConditionExpr。
 * 支持简写：`$point.temp gt 80`（左值 运算符 右值）；也接受 JSON。
 */
export function parseConditionExpr(expr: string): ConditionExpr | null {
  if (!expr || !expr.trim()) return null
  const t = expr.trim()
  if (t.startsWith('{')) {
    try { return JSON.parse(t) as ConditionExpr } catch { return null }
  }
  const m = t.match(/^(\S+)\s+(eq|neq|in|gt|lt|empty|not_empty)(?:\s+(.*))?$/)
  if (!m) return null
  return { left_src: m[1], operator: m[2] as ConditionExpr['operator'], value: m[3] }
}
