/**
 * 工作流引擎运行时类型：执行上下文 + 引擎依赖。
 *
 * 引擎不直接依赖 React / zustand，全部能力经 `WorkflowEngineDeps` 注入，
 * 便于在编辑器「试跑」、运行时（preview/发布/分享）与单测里复用同一套逻辑。
 */
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { ElementSelector, NodeOutputs } from '@/types/workflow'

/** 一次工作流触发的执行上下文（含各来源快照） */
export interface WorkflowContext {
  /** 触发事件载荷（组件事件/自定义事件/定时器等） */
  event?: unknown
  /** 触发点位键（point_change / condition 源） */
  pointKey?: string
  /** 点位/接口数据快照（含运行时绑定覆盖层） */
  point: PointDataMap
  /** 全局上下文快照 */
  global: Record<string, unknown>
  /** 工作流上下文快照（单次执行） */
  workflow: Record<string, unknown>
  /** DAG 节点产出（$node.<id>.<path>） */
  nodeOutputs?: NodeOutputs
}

/** 元素读写作用域适配层（把选择器解析到运行时元素/store 变更） */
export interface ElementScope {
  /** 解析选择器为运行时元素列表（含模板实例展开） */
  resolve(sel: ElementSelector): CanvasElement[]
  /** 读元素属性（点路径） */
  getProp(sel: ElementSelector, prop: string): unknown
  /** 写元素属性（点路径）到匹配的所有元素 */
  setProp(sel: ElementSelector, prop: string, value: unknown): void
  /** 注入元素绑定覆盖值（写运行时 pointData 覆盖层，供 bindingResolver 读取） */
  setBinding(sel: ElementSelector, value: unknown): void
}

/** 双向上下文容器（global / workflow 共用同一接口） */
export interface ContextStore {
  getAll(): Record<string, unknown>
  get(path: string): unknown
  set(path: string, value: unknown): void
  subscribe(cb: (shortName: string, value: unknown) => void): () => void
}

/** 引擎依赖：由运行时/编辑器注入 */
export interface WorkflowEngineDeps {
  /** 当前画布元素（运行时元素集合；用于选择器解析） */
  getElements: () => CanvasElement[]
  /** 当前 pointData 快照（含绑定覆盖层） */
  getPointData: () => PointDataMap
  /** 元素读写适配层 */
  elementScope: ElementScope
  /** 全局上下文（跨画布常驻） */
  globalContext: ContextStore
  /** 工作流上下文（单次执行；每次触发新建） */
  makeWorkflowContext: () => ContextStore
  /** 调数据接口：ifaceCode/ifaceId + 参数 → 结果对象 */
  callInterface?: (opts: { ifaceId?: number; ifaceCode?: string; params: Record<string, unknown> }) => Promise<unknown>
  /** 切换画布 */
  switchCanvas?: (canvasId: number) => void
  /** 打开模态 */
  openModal?: (target: string) => void
  /** 关闭模态 */
  closeModal?: (target: string) => void
  /** 顶部提示 */
  toast?: (msg: string) => void
  /** DAG 执行轨迹回调（可观测性） */
  onTrace?: (traces: import('@/types/workflow').NodeTrace[]) => void
}
