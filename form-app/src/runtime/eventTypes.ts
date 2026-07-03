/**
 * 页面级统一事件系统类型定义。
 *
 * 取代/包裹旧的 ScannerConfig：用 events[] 统一描述「事件源 → 触发条件 → 动作链」。
 * 旧的 scanner 配置经 migrateScannerToEvents 适配为等价 events，存量页面零迁移。
 */

// ── 值来源解析 ──────────────────────────────────────────────────────
// 约定的取值前缀：
//   $scan       → 触发本次事件的扫码/事件原始值
//   $form.字段   → 当前表单字段值（支持点路径，如 $form.a.b）
//   $event.字段  → 事件载荷对象中的字段（自定义事件携带结构化数据时）
//   其他         → 字面量
export type ValueSrc = string

export interface EventContext {
  /** 触发值（扫码值 / 事件 data 字符串） */
  scan?: string
  /** 当前页面值快照（页面作用域 PageState） */
  form: Record<string, any>
  /** 应用级状态快照（AppState）。供 $app.x 取值；无 AppState 时为空对象 */
  app?: Record<string, any>
  /** 事件载荷（自定义事件可携带对象） */
  event?: any
  /** DAG 执行时的节点产出表，供 $node.<id>.<key> 取值（仅 DAG 路径注入） */
  nodeOutputs?: Record<string, any>
  /** 跨设备事件的 hop（内部字段，emit_cross_app 读取以传递 parentHop） */
  _crossDeviceHop?: number
}

/** 状态作用域：page=当前页面状态，app=应用级共享状态 */
export type StateScopeKind = 'page' | 'app'

// ── 触发条件 ────────────────────────────────────────────────────────
export type ConditionOperator =
  | 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'empty' | 'not_empty'

export interface ConditionExpr {
  left_src: ValueSrc
  operator: ConditionOperator
  value?: string
}

// ── 动作 ────────────────────────────────────────────────────────────
export type InterfaceType = 'internal' | 'third_party' | 'connector'

/** 重试配置（与 runtime/degrade.ts 的 RetryConfig 一致） */
export interface ActionRetryConfig {
  maxAttempts: number
  backoff: 'fixed' | 'linear' | 'exponential'
  initialDelay: number
  maxDelay?: number
}

/**
 * 所有动作共享。
 * - when：可选的单动作执行条件（不满足则跳过该动作，继续后续动作）
 * - timeout/retry：可选降级配置（默认不填 = 不超时、不重试，行为同改造前）
 * - onError：失败策略，默认 'abort'（中断后续，等价原 break）
 * - fallbackActionIndex：onError='fallback' 时回退到动作链中该索引的动作
 */
export interface ActionBase {
  when?: ConditionExpr
  timeout?: number
  retry?: ActionRetryConfig
  onError?: 'abort' | 'continue' | 'fallback'
  fallbackActionIndex?: number
}

export interface SetFieldAction extends ActionBase {
  type: 'set_field'
  field: string
  value_src: ValueSrc
  /** 写入的作用域，默认 'page'（存量零变化）；'app' 写应用级状态 */
  scope?: StateScopeKind
}

export interface CallInterfaceAction extends ActionBase {
  type: 'call_interface'
  interface_type?: InterfaceType
  interface_code?: string
  third_party_endpoint_id?: number
  connector_interface_code?: string
  /** 入参映射：param_key ← 值来源 */
  param_map?: Array<{ key: string; src: ValueSrc }>
  /** 结果回填：接口返回字段（点路径）→ 表单字段 */
  result_map?: Array<{ response_field: string; form_field: string }>
  /** 结果回填的目标作用域，默认 'page' */
  result_scope?: StateScopeKind
}

export interface PrintAction extends ActionBase {
  type: 'print'
  printer_template_id: string
  /** 占位符额外数据映射：placeholder ← 值来源（默认用 form 值） */
  data_map?: Array<{ placeholder: string; src: ValueSrc }>
}

export interface NavigateAction extends ActionBase {
  type: 'navigate'
  to_page_key: string
  param_map?: Array<{ key: string; src: ValueSrc }>
}

export interface ToastAction extends ActionBase {
  type: 'toast'
  message_src: ValueSrc
}

/** 修改绑定表单字段的展示属性：背景/文字颜色/显示隐藏/禁用/只读等 */
export type FieldPropName =
  | 'visible' | 'disabled' | 'readOnly'
  | 'background' | 'color' | 'title'
export interface SetFieldPropAction extends ActionBase {
  type: 'set_field_prop'
  /** 目标字段（field key） */
  field: string
  /** 要修改的属性 */
  prop: FieldPropName
  /** 属性值来源：visible/disabled/readOnly 取真假（true/1/yes/$form...），其余取字符串 */
  value_src: ValueSrc
  /** 目标作用域，默认 'page'；'app' 因 AppState 无 UI 字段而被忽略 */
  scope?: StateScopeKind
}

/** 批量设置多个字段的展示属性 */
export interface SetFieldPropsBatchAction extends ActionBase {
  type: 'set_field_props_batch'
  /** 字段属性映射列表：每项指定目标字段、属性名和值来源 */
  mappings: Array<{ field: string; prop: FieldPropName; value_src: ValueSrc }>
  /** 目标作用域，默认 'page' */
  scope?: StateScopeKind
}

/** 语音播报：把文本（支持 $scan/$form.x/$event.x/字面量）念出来 */
export interface SpeakAction extends ActionBase {
  type: 'speak'
  text_src: ValueSrc
}

/** 触发自定义事件：向事件总线 emit 一个事件名，可携带数据，驱动以该名为源（custom_event）的其他事件流 */
export interface EmitEventAction extends ActionBase {
  type: 'emit_event'
  /** 目标自定义事件名（与 source.kind==='custom_event' 的 event_name 对应） */
  event_name: string
  /** 事件载荷来源：解析 $scan/$form.x/$event.x/字面量；对象会 JSON 序列化后传递 */
  data_src?: ValueSrc
}

/**
 * 运行脚本：执行一段用户 JavaScript。脚本体内可用 `ctx` 对象访问运行时能力
 * （读写字段、设属性、调接口、打印、跳页、提示、语音、触发事件、scan/form/event 上下文）。
 * 脚本以 async 方式执行，可 await ctx.callInterface 等异步能力。
 */
export interface RunScriptAction extends ActionBase {
  type: 'run_script'
  /** 用户脚本源码（函数体，作用域内有 ctx 变量） */
  script: string
}

/** 批量设置多个字段：一次性设置多个字段值 */
export interface SetFieldsBatchAction extends ActionBase {
  type: 'set_fields_batch'
  /** 字段映射列表：每项指定目标字段和值来源 */
  mappings: Array<{ field: string; value_src: ValueSrc }>
  /** 写入的作用域，默认 'page' */
  scope?: StateScopeKind
}

/** 清空字段：将多个字段重置为默认值（空字符串/null/undefined） */
export interface ClearFieldsAction extends ActionBase {
  type: 'clear_fields'
  /** 要清空的字段列表 */
  fields: string[]
  /** 目标作用域，默认 'page' */
  scope?: StateScopeKind
  /** 清空值，默认为空字符串 '' */
  clear_value?: any
}

export type EventAction =
  | SetFieldAction
  | SetFieldsBatchAction
  | ClearFieldsAction
  | CallInterfaceAction
  | PrintAction
  | NavigateAction
  | ToastAction
  | SetFieldPropAction
  | SetFieldPropsBatchAction
  | SpeakAction
  | EmitEventAction
  | RunScriptAction

// ── 事件源 ──────────────────────────────────────────────────────────
export type EventSource =
  | { kind: 'scan'; scan_type?: 'barcode' | 'qrcode' | 'nfc' | 'any' }
  | { kind: 'custom_event'; event_name: string }
  | { kind: 'button'; button_id: string }
  | { kind: 'field_change'; field: string }
  | { kind: 'state_change'; scope: StateScopeKind; field: string }
  | { kind: 'page_enter' }
  | { kind: 'page_exit' }
  | { kind: 'timer'; delay: number; interval?: number; repeat?: number }

// ── 页面事件 ────────────────────────────────────────────────────────
export interface PageEvent {
  id: string
  name?: string
  /**
   * 事件流作用域，默认 'page'（页面级，随页面挂载/卸载）。
   * 'app' = 应用级常驻事件，在 MultiPageRuntime 挂载时注册、跨页面存活。
   */
  scope?: StateScopeKind
  source: EventSource
  /** 前置过滤（针对扫码值的长度/前缀/正则等，沿用旧 scanner.filters 语义） */
  filters?: ScanFilter
  /** 触发条件（基于 $scan / $form.字段 / $app.字段 / $event） */
  when?: ConditionExpr
  /** 顺序执行的动作链 */
  actions: EventAction[]
  /**
   * 窄 DAG 编排（可选）。存在且有节点时，运行时走 runGraph（拓扑调度）而非线性 actions。
   * 结构见 runtime/dag/types.ts。存量事件无此字段，仍走 actions 线性路径。
   */
  graph?: import('./dag/types').FlowGraph
}

// ── 兼容旧 scanner 配置 ──────────────────────────────────────────────
export interface ScanFilter {
  min_length?: number
  max_length?: number
  prefix?: string
  contains?: string
  not_contains?: string
  regex?: string
}
