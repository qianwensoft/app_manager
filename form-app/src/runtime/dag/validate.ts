/**
 * 窄 DAG 静态校验：环检测（DFS 三色标记）+ 基本结构校验。
 * 保存期 + 运行前各跑一次，防止坏数据导致调度死循环。
 *
 * 详见 docs/第5步-窄DAG调度器落地设计.md。
 */
import type { FlowGraph } from './types'

export interface ValidateResult {
  ok: boolean
  errors: string[]
  /** 检出的环路径（节点 id 链），用于诊断 */
  cycle?: string[]
}

/**
 * DFS 三色标记检测有向图环。
 * white=未访问 / gray=在当前 DFS 栈上 / black=已完成。
 * 遇到指向 gray 节点的边即为环。
 */
export function detectCycle(graph: FlowGraph): string[] | null {
  const adj = new Map<string, string[]>()
  for (const n of graph.nodes) adj.set(n.id, [])
  for (const e of graph.edges) {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target)
  }
  const color = new Map<string, 0 | 1 | 2>() // 0 white,1 gray,2 black
  for (const n of graph.nodes) color.set(n.id, 0)
  const stack: string[] = []

  const dfs = (u: string): string[] | null => {
    color.set(u, 1)
    stack.push(u)
    for (const v of adj.get(u) || []) {
      if (!color.has(v)) continue // 边指向不存在的节点，结构校验另行报告
      if (color.get(v) === 1) {
        // 命中环：截取 stack 中 v..u 段 + v 闭合
        const i = stack.indexOf(v)
        return [...stack.slice(i), v]
      }
      if (color.get(v) === 0) {
        const c = dfs(v)
        if (c) return c
      }
    }
    color.set(u, 2)
    stack.pop()
    return null
  }

  for (const n of graph.nodes) {
    if (color.get(n.id) === 0) {
      const c = dfs(n.id)
      if (c) return c
    }
  }
  return null
}

/** 校验图：环 + 边引用的节点存在性。 */
export function validateGraph(graph: FlowGraph): ValidateResult {
  const errors: string[] = []
  const ids = new Set(graph.nodes.map(n => n.id))
  for (const e of graph.edges) {
    if (!ids.has(e.source)) errors.push(`边 ${e.id} 的 source「${e.source}」不存在`)
    if (!ids.has(e.target)) errors.push(`边 ${e.id} 的 target「${e.target}」不存在`)
  }
  const cycle = detectCycle(graph)
  if (cycle) errors.push(`存在环路：${cycle.join('→')}`)
  return { ok: errors.length === 0, errors, cycle: cycle || undefined }
}
