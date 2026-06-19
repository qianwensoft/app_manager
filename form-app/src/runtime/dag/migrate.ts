/**
 * 线性动作链 → 单链 DAG 的迁移。
 * 存量事件的 actions[] 转成 n 个 tool 节点首尾相连的 graph，
 * 经 runGraph 执行结果与旧 runActions 逐一致（存量零行为变化）。
 *
 * run_script 动作转为 run_script 节点；其余动作转为 tool 节点（内嵌该动作）。
 */
import type { EventAction } from '../eventTypes'
import type { FlowGraph, FlowNode, FlowEdge } from './types'

export function migrateActionsToGraph(actions: EventAction[] = []): FlowGraph {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  actions.forEach((action, i) => {
    const id = `n${i}`
    if (action.type === 'run_script') {
      nodes.push({ id, kind: 'run_script', script: (action as any).script, label: 'run_script' })
    } else {
      nodes.push({ id, kind: 'tool', action, label: action.type })
    }
    if (i > 0) edges.push({ id: `e${i}`, source: `n${i - 1}`, target: id })
  })
  return { nodes, edges }
}
