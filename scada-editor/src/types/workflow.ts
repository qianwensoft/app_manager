/**
 * SCADA 工作流引擎数据模型。
 *
 * 镜像 form-app 的 `eventTypes.ts` + `dag/types.ts`，适配到 SCADA 画布语义：
 * - 事件源改为 SCADA 触发源（点位变化 / 组件 UI / 定时器 / 画布生命周期 / 自定义事件 / 上下文变化）
 * - 动作面向「元素属性 / 绑定 / 上下文 / 接口 / 画布 / 模态 / toast / 自定义事件 / 脚本」
 * - 状态作用域：element（画布元素）/ workflow（单次执行）/ global（跨画布常驻）
 *
 * 工作流定义随 `CanvasProject` JSON 存入 `ScadaInfo.canvas_data`，纯前端运行，无需 Go 后端改动。
 */

// ── 值来源解析 ──────────────────────────────────────────────────────
// 约定的取值前缀（见 runtime/workflow/resolveSrc.ts）：
//   $point.<key>          → 当前 pointData 里的点位/接口值（支持点路径）
//   $global.<path>        → 全局上下文（跨画布常驻）
//   $workflow.<path>      → 工作流上下文（单次执行 + DAG 节点产出别名）
//   $node.<id>.<path>     → DAG 上游节点产出
//   $event 或 $event.<p>  → 触发事件载荷
//   其他                   → 字面量（数字/布尔自动归一在 resolveSrc 里处理）
export type ValueSrc = string

/** 状态作用域：element=画布元素属性，workflow=单次执行，global=跨画布常驻 */
export type StateScopeKind = 'element' | 'workflow' | 'global'

/** 工作流生命周期作用域：canvas=随画布挂载/卸载，global=跨画布常驻 */
export type WorkflowScope = 'canvas' | 'global'

// ── 触发条件 ────────────────────────────────────────────────────────
export type ConditionOperator =
  | 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'empty' | 'not_empty'

export interface ConditionExpr {
  left_src: ValueSrc
  operator: ConditionOperator
  value?: string
}

// ── 元素选择器 ──────────────────────────────────────────────────────
/**
 * 定位画布元素：
 * - by='id'：ref 为元素 id；模板实例可加 instanceKey 定位 `groupBinding` 展开后的某个实例
 * - by='name'：ref 为名称或名称路径（`组合名.子元素名`），跨画布/组合模糊匹配
 */
export interface ElementSelector {
  by: 'id' | 'name'
  ref: string
  /** groupBinding 模板实例的 key 或索引；不填=命中所有实例 + 模板本身 */
  instanceKey?: string | number
}

// ── 动作降级基类 ────────────────────────────────────────────────────
export interface ActionRetryConfig {
  maxAttempts: number
  backoff: 'fixed' | 'linear' | 'exponential'
  initialDelay: number
  maxDelay?: number
}

/**
 * 所有动作共享的降级字段。
 * - when：单动作执行条件（不满足则跳过，继续后续动作）
 * - timeout/retry：可选降级（默认不填=不超时、不重试）
 * - onError：失败策略，默认 'abort'
 * - fallbackActionIndex：onError='fallback' 时回退到动作链中该索引的动作
 */
export interface ActionBase {
  when?: ConditionExpr
  timeout?: number
  retry?: ActionRetryConfig
  onError?: 'abort' | 'continue' | 'fallback'
  fallbackActionIndex?: number
}

// ── 动作定义 ────────────────────────────────────────────────────────

/** 设置元素任意属性（text/fill/x/width/visible/... 及 properties.* 点路径） */
export interface SetElementPropAction extends ActionBase {
  type: 'set_element_prop'
  targetSel: ElementSelector
  /** 属性名，支持点路径（如 `properties.chartConfig.title`） */
  prop: string
  value_src: ValueSrc
}

/** 注入元素绑定值：写入运行时 pointData 覆盖层，供 bindingResolver 读取（类 form-app set_field） */
export interface SetElementBindingAction extends ActionBase {
  type: 'set_element_binding'
  targetSel: ElementSelector
  value_src: ValueSrc
}

/** 写上下文（global / workflow） */
export interface SetContextAction extends ActionBase {
  type: 'set_context'
  scope: Exclude<StateScopeKind, 'element'>
  key: string
  value_src: ValueSrc
}

/** 调用数据接口 */
export interface CallInterfaceAction extends ActionBase {
  type: 'call_interface'
  ifaceId?: number
  ifaceCode?: string
  /** 外部应用 ID（outbound_apps 表）：优先级高于 ifaceId/ifaceCode */
  outboundAppId?: number
  /** 外部接口 ID（outbound_endpoints 表）：配合 outboundAppId 使用 */
  outboundEndpointId?: number
  /** 入参映射：param_key ← 值来源 */
  param_map?: Array<{ key: string; src: ValueSrc }>
  /** 结果回填：接口返回字段（点路径）→ 上下文 key（按 result_scope） */
  result_map?: Array<{ response_field: string; context_key: string }>
  result_scope?: Exclude<StateScopeKind, 'element'>
}

/** 切换画布 */
export interface SwitchCanvasAction extends ActionBase {
  type: 'switch_canvas'
  canvasId: number
}

/** 打开 / 关闭模态（target=模态元素 id） */
export interface OpenModalAction extends ActionBase {
  type: 'open_modal'
  target: string
}
export interface CloseModalAction extends ActionBase {
  type: 'close_modal'
  target: string
}

/** 顶部提示 */
export interface ToastAction extends ActionBase {
  type: 'toast'
  message_src: ValueSrc
}

/** 触发自定义事件（驱动 source.kind==='custom_event' 的其他工作流） */
export interface EmitEventAction extends ActionBase {
  type: 'emit_event'
  eventName: string
  data_src?: ValueSrc
}

/** 运行脚本：注入 ScriptApi 的 ctx 变量 */
export interface RunScriptAction extends ActionBase {
  type: 'run_script'
  script: string
}

export type WorkflowAction =
  | SetElementPropAction
  | SetElementBindingAction
  | SetContextAction
  | CallInterfaceAction
  | SwitchCanvasAction
  | OpenModalAction
  | CloseModalAction
  | ToastAction
  | EmitEventAction
  | RunScriptAction

export type WorkflowActionType = WorkflowAction['type']

// ── 触发源 ──────────────────────────────────────────────────────────
export type WorkflowSource =
  | { kind: 'point_change'; pointKey: string }
  | { kind: 'condition'; expr: string }
  | { kind: 'component'; elementId: string; event: 'click' | 'dblclick' | 'hover' }
  | { kind: 'timer'; delay: number; interval?: number; repeat?: number }
  | { kind: 'canvas_enter' }
  | { kind: 'canvas_exit' }
  | { kind: 'custom_event'; eventName: string }
  | { kind: 'context_change'; scope: Exclude<StateScopeKind, 'element'>; key: string }
  | { kind: 'agent_scan'; deviceId?: number; scanType?: 'qrcode' | 'barcode' | 'nfc' | 'any' }

export type WorkflowSourceKind = WorkflowSource['kind']

// ── DAG 图模型（沿用 form-app dag/types 结构） ──────────────────────
// start：起点（入口）节点。无副作用、无产出，仅作为图的显式起点，只有出边。
export type FlowNodeKind = 'start' | 'tool' | 'run_script' | 'parallel' | 'barrier' | 'condition'

export interface FlowNode {
  id: string
  kind: FlowNodeKind
  /** kind==='tool' → 内嵌动作 */
  action?: WorkflowAction
  /** kind==='run_script' → 脚本体 */
  script?: string
  label?: string
  /** onError==='fallback' 时回退到的节点 id */
  fallbackNodeId?: string
  /** 画布坐标，运行时忽略 */
  position?: { x: number; y: number }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  /** 边级条件：condition 节点据此选择放行的出边 */
  condition?: ConditionExpr
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/** 节点执行轨迹（可观测性） */
export interface NodeTrace {
  nodeId: string
  kind: FlowNodeKind
  label?: string
  status: 'ok' | 'failed' | 'skipped' | 'timeout'
  startedAt: number
  elapsedMs: number
  error?: string
  output?: unknown
}

/** 一次图执行的节点产出表：$node.<id>.<key> 的来源 */
export type NodeOutputs = Record<string, unknown>

// ── 工作流定义 ──────────────────────────────────────────────────────
export interface ScadaWorkflow {
  id: string
  name?: string
  /** 生命周期作用域，默认 canvas */
  scope?: WorkflowScope
  /** canvas 作用域所属画布 id（用于按画布过滤注册） */
  canvasId?: number
  source: WorkflowSource
  /** 触发前置条件 */
  when?: ConditionExpr
  /** 线性动作链（graph 为空时走这里） */
  actions: WorkflowAction[]
  /** DAG：有节点时优先走拓扑调度 */
  graph?: FlowGraph
  /** 默认 true；false=禁用不注册 */
  enabled?: boolean
}

// ── 外部库清单 ──────────────────────────────────────────────────────
/**
 * 脚本可用的外部库注册项：
 * - source='url'：直接注入远程/相对 URL 的 `<script>`
 * - source='upload'：上传到 `/api/scada/resource` 后得到的 URL
 * globalVar 为库挂到 window 上的全局变量名；加载后镜像到 `ctx.libs[name]`。
 */
export interface WorkflowLib {
  name: string
  source: 'url' | 'upload'
  url: string
  /** 库在 window 上暴露的全局变量名（UMD）；不填则尝试用 name */
  globalVar?: string
}
