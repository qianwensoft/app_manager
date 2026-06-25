/**
 * 窄 DAG 调度器（自研，拓扑 BFS + Promise.all）。
 *
 * - parallel：出边天然并发（ready 队列 Promise.all）
 * - barrier：入度=上游分支数，等所有入边完成才执行（拓扑自然语义）
 * - condition：执行时对每条出边求值 edge.condition，只放行满足的出边，其余分支剪枝
 * - tool / run_script：调 runEventAction（复用查表 + 降级 + 环路守卫），产出存入 outputs[id]
 *
 * 节点间数据：下游节点（tool 的 action 参数）经 resolveSrc 的 $node.<id>.<key> 读上游产出，
 * 调度器把 outputs 注入 ctx.nodeOutputs（见 eventEngine.resolveSrc）。
 *
 * 详见 docs/第5步-窄DAG调度器落地设计.md。
 */
import type { EventContext } from '../eventTypes'
import type { EventEngineDeps } from '../eventEngine'
import { runEventAction, evalCondition } from '../eventEngine'
import { rootEmitScope, type EmitScope } from '../emitScope'
import type { FlowGraph, FlowNode, NodeTrace, NodeOutputs } from './types'
import { validateGraph } from './validate'

export interface RunGraphResult {
  outputs: NodeOutputs
  traces: NodeTrace[]
}

/** 纯控制节点（无副作用、无产出） */
const CONTROL_KINDS = new Set(['parallel', 'barrier', 'condition'])

/**
 * 执行一张窄 DAG。clock 注入用于可测的时间戳（脚本环境禁用 Date.now）。
 */
export async function runGraph(
  graph: FlowGraph,
  ctx: EventContext,
  deps: EventEngineDeps,
  emitScope: EmitScope = rootEmitScope(),
  clock: () => number = () => 0,
): Promise<RunGraphResult> {
  const outputs: NodeOutputs = {}
  const traces: NodeTrace[] = []

  // 运行前兜底校验：有环/坏结构则不执行，避免死循环
  const v = validateGraph(graph)
  if (!v.ok) {
    deps.toast?.(`事件流图非法：${v.errors[0]}`)
    return { outputs, traces }
  }

  const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
  // 出边 / 入边
  const outEdges = new Map<string, typeof graph.edges>()
  const indeg = new Map<string, number>()
  for (const n of graph.nodes) { outEdges.set(n.id, []); indeg.set(n.id, 0) }
  for (const e of graph.edges) {
    outEdges.get(e.source)?.push(e)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }

  // 被剪枝（condition 未放行）的节点：其入度永不归零，自然不执行；
  // 但需显式标记跳过以产 trace，并把剪枝沿下游传播。
  const skipped = new Set<string>()

  // 每个节点带 $node 视图执行：把当前 outputs 注入 ctx.nodeOutputs
  const execNode = async (node: FlowNode): Promise<void> => {
    const startedAt = clock()
    const baseTrace = { nodeId: node.id, kind: node.kind, label: node.label, startedAt }
    if (CONTROL_KINDS.has(node.kind)) {
      // 控制节点无副作用，仅记轨迹
      traces.push({ ...baseTrace, status: 'ok', elapsedMs: 0 })
      return
    }
    const nodeCtx: EventContext = { ...ctx, nodeOutputs: outputs }
    try {
      let out: any
      if (node.kind === 'run_script') {
        out = await runEventAction({ type: 'run_script', script: node.script || '' } as any, nodeCtx, deps, emitScope)
      } else {
        // tool：内嵌 action
        out = await runEventAction(node.action as any, nodeCtx, deps, emitScope)
      }
      outputs[node.id] = out ?? {}
      traces.push({ ...baseTrace, status: 'ok', elapsedMs: clock() - startedAt, output: preview(out) })
    } catch (e: any) {
      const msg = String(e?.message || e)
      traces.push({ ...baseTrace, status: /超时/.test(msg) ? 'timeout' : 'failed', elapsedMs: clock() - startedAt, error: msg })
      // 节点级 onError=fallback（tool 节点）：执行回退节点
      const action: any = node.action
      if (node.kind === 'tool' && action?.onError === 'fallback' && node.fallbackNodeId) {
        const fb = nodeById.get(node.fallbackNodeId)
        if (fb) { try { await execNode(fb) } catch { /* 回退失败止于此 */ } }
      } else if (action?.onError === 'continue') {
        // 吞掉错误，继续调度
      } else {
        throw e // abort：中断整图
      }
    }
  }

  // 拓扑 BFS：每轮取入度为 0 且未执行/未跳过的节点并发执行
  const done = new Set<string>()
  // 队列初始：入度 0
  let ready = graph.nodes.filter(n => (indeg.get(n.id) || 0) === 0).map(n => n.id)

  const releaseEdges = (nodeId: string) => {
    const node = nodeById.get(nodeId)!
    const edges = outEdges.get(nodeId) || []
    for (const e of edges) {
      // condition 节点：仅放行满足 edge.condition 的出边；不满足则剪枝目标（及其独占下游）
      if (node.kind === 'condition' && e.condition) {
        const ctxForEdge: EventContext = { ...ctx, nodeOutputs: outputs }
        if (!evalCondition(e.condition, ctxForEdge)) {
          pruneFrom(e.target)
          continue
        }
      }
      indeg.set(e.target, (indeg.get(e.target) || 0) - 1)
    }
  }

  // 剪枝：标记目标跳过，并对其出边递减入度；若下游因此再无其它来源也被跳过
  const pruneFrom = (nodeId: string) => {
    if (skipped.has(nodeId) || done.has(nodeId)) return
    skipped.add(nodeId)
    const node = nodeById.get(nodeId)
    if (node) traces.push({ nodeId, kind: node.kind, label: node.label, status: 'skipped', startedAt: clock(), elapsedMs: 0 })
    for (const e of outEdges.get(nodeId) || []) {
      indeg.set(e.target, (indeg.get(e.target) || 0) - 1)
      if ((indeg.get(e.target) || 0) <= 0 && !done.has(e.target)) pruneFrom(e.target)
    }
  }

  try {
    while (ready.length > 0) {
      const batch = ready.filter(id => !done.has(id) && !skipped.has(id))
      if (batch.length === 0) break
      await Promise.all(batch.map(async id => {
        await execNode(nodeById.get(id)!)
        done.add(id)
        releaseEdges(id)
      }))
      // 下一批：入度归零、未执行、未跳过
      ready = graph.nodes
        .filter(n => !done.has(n.id) && !skipped.has(n.id) && (indeg.get(n.id) || 0) <= 0)
        .map(n => n.id)
    }
  } catch (e: any) {
    deps.toast?.(`事件流执行中断：${e?.message || e}`)
  }

  // 可观测性回调（不阻断）
  deps.onTrace?.(traces)
  return { outputs, traces }
}

function preview(out: any): any {
  if (out == null) return undefined
  try {
    const s = JSON.stringify(out)
    return s.length > 500 ? s.slice(0, 500) + '…' : out
  } catch {
    return undefined
  }
}
