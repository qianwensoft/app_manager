/**
 * 窄 DAG 数据模型（自研精简 schema，非 workflow-engine）。
 *
 * 只 5 类节点（真实场景：并行调多接口 → barrier → run_script 决策 → condition 分支）：
 *   tool        执行一个现有 EventAction（内嵌，零改动复用 9 工具 + 降级字段）
 *   run_script  决策节点（脚本，可读 $node 上游产出、写状态、返回值供下游/分支）
 *   parallel    fan-out：出边天然并发（纯控制，无副作用）
 *   barrier     汇合：等所有入边节点完成（纯控制）
 *   condition   分支：按各出边 edge.condition 选择放行（纯控制）
 *
 * 详见 docs/第5步-窄DAG调度器落地设计.md。
 */
import type { EventAction, ConditionExpr } from '../eventTypes'

export type FlowNodeKind = 'tool' | 'run_script' | 'parallel' | 'barrier' | 'condition'

export interface FlowNode {
  id: string
  kind: FlowNodeKind
  /** kind==='tool' → 内嵌动作（含 type/params/timeout/retry/onError 等降级字段） */
  action?: EventAction
  /** kind==='run_script' → 脚本体（注入 ScriptApi 的 ctx；含 ctx.node 读上游产出） */
  script?: string
  /** 展示名（诊断/画布） */
  label?: string
  /** onError==='fallback' 时回退到的节点 id（DAG 版，替代线性的 fallbackActionIndex） */
  fallbackNodeId?: string
  /** 画布坐标，运行时忽略 */
  position?: { x: number; y: number }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  /** 边级条件：condition 节点据此选择放行的出边；普通边留空=无条件放行 */
  condition?: ConditionExpr
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/** 节点执行轨迹（可观测性；不依赖画布，运行时即产出） */
export interface NodeTrace {
  nodeId: string
  kind: FlowNodeKind
  label?: string
  status: 'ok' | 'failed' | 'skipped' | 'timeout'
  startedAt: number
  elapsedMs: number
  error?: string
  /** 产出预览（截断） */
  output?: any
}

/** 一次图执行的节点产出表：$node.<id>.<key> 的来源 */
export type NodeOutputs = Record<string, any>
