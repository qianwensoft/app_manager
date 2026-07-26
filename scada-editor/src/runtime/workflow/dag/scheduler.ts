/**
 * 窄 DAG 调度器（拓扑 BFS + Promise.all）。
 *
 * - parallel：出边天然并发（ready 队列 Promise.all）
 * - barrier：入度=上游分支数，等所有入边完成才执行（拓扑自然语义）
 * - condition：执行时对每条出边求值 edge.condition，只放行满足的出边，其余分支剪枝
 * - tool / run_script：调注入的 runNode（复用查表 + 降级 + 环路守卫），产出存入 outputs[id]
 *
 * 节点间数据：下游节点经 resolveSrc 的 $node.<id>.<key> 读上游产出；
 * 调度器把 outputs 注入 ctx.nodeOutputs。
 * 参考 form-app runtime/dag/scheduler.ts。
 */
import type { FlowGraph, FlowNode, NodeTrace, NodeOutputs } from '@/types/workflow'
import type { WorkflowContext } from '../types'
import { evalCondition } from '../condition'
import { validateGraph } from './validate'

export interface RunGraphResult {
  outputs: NodeOutputs
  traces: NodeTrace[]
}

/** 节点执行器：由 engine 注入，内部复用 runWorkflowAction（查表+降级+守卫）。返回节点产出。 */
export type RunNode = (node: FlowNode, nodeCtx: WorkflowContext) => Promise<Record<string, unknown> | void>

/** 纯控制节点（无副作用、无产出）：起点/并行/汇聚/条件 */
const CONTROL_KINDS = new Set(['start', 'parallel', 'barrier', 'condition'])

/** 执行一张窄 DAG。clock 注入用于可测的时间戳。 */
export async function runGraph(
  graph: FlowGraph,
  ctx: WorkflowContext,
  runNode: RunNode,
  onTrace?: (traces: NodeTrace[]) => void,
  toast?: (msg: string) => void,
  clock: () => number = () => Date.now(),
): Promise<RunGraphResult> {
  const outputs: NodeOutputs = {}
  const traces: NodeTrace[] = []

  const v = validateGraph(graph)
  if (!v.ok) {
    toast?.(`工作流图非法：${v.errors[0]}`)
    return { outputs, traces }
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const outEdges = new Map<string, typeof graph.edges>()
  const indeg = new Map<string, number>()
  for (const n of graph.nodes) { outEdges.set(n.id, []); indeg.set(n.id, 0) }
  for (const e of graph.edges) {
    outEdges.get(e.source)?.push(e)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }

  const skipped = new Set<string>()
  const done = new Set<string>()

  const execNode = async (node: FlowNode): Promise<void> => {
    const startedAt = clock()
    const baseTrace = { nodeId: node.id, kind: node.kind, label: node.label, startedAt }
    if (CONTROL_KINDS.has(node.kind)) {
      traces.push({ ...baseTrace, status: 'ok', elapsedMs: 0 })
      return
    }
    const nodeCtx: WorkflowContext = { ...ctx, nodeOutputs: outputs }
    try {
      const out = await runNode(node, nodeCtx)
      outputs[node.id] = out ?? {}
      traces.push({ ...baseTrace, status: 'ok', elapsedMs: clock() - startedAt, output: preview(out) })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      traces.push({ ...baseTrace, status: /超时/.test(msg) ? 'timeout' : 'failed', elapsedMs: clock() - startedAt, error: msg })
      const action = node.action
      if (node.kind === 'tool' && action?.onError === 'fallback' && node.fallbackNodeId) {
        const fb = nodeById.get(node.fallbackNodeId)
        if (fb) { try { await execNode(fb) } catch { /* 回退失败止于此 */ } }
      } else if (action?.onError === 'continue') {
        // 吞掉错误，继续调度
      } else {
        throw e
      }
    }
  }

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

  const releaseEdges = (nodeId: string) => {
    const node = nodeById.get(nodeId)!
    for (const e of outEdges.get(nodeId) || []) {
      if (node.kind === 'condition' && e.condition) {
        const ctxForEdge: WorkflowContext = { ...ctx, nodeOutputs: outputs }
        if (!evalCondition(e.condition, ctxForEdge)) {
          pruneFrom(e.target)
          continue
        }
      }
      indeg.set(e.target, (indeg.get(e.target) || 0) - 1)
    }
  }

  let ready = graph.nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id)

  try {
    while (ready.length > 0) {
      const batch = ready.filter((id) => !done.has(id) && !skipped.has(id))
      if (batch.length === 0) break
      await Promise.all(batch.map(async (id) => {
        await execNode(nodeById.get(id)!)
        done.add(id)
        releaseEdges(id)
      }))
      ready = graph.nodes
        .filter((n) => !done.has(n.id) && !skipped.has(n.id) && (indeg.get(n.id) || 0) <= 0)
        .map((n) => n.id)
    }
  } catch (e: unknown) {
    toast?.(`工作流执行中断：${e instanceof Error ? e.message : String(e)}`)
  }

  onTrace?.(traces)
  return { outputs, traces }
}

function preview(out: unknown): unknown {
  if (out == null) return undefined
  try {
    const s = JSON.stringify(out)
    return s.length > 500 ? s.slice(0, 500) + '…' : out
  } catch {
    return undefined
  }
}
