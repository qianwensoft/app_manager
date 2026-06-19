/**
 * 页面级统一事件系统运行时执行器。
 *
 * - resolveSrc：解析 $scan / $form.x / $event.x / 字面量
 * - evalCondition：复用 fieldLogic 的 operator 语义
 * - runEventAction：按 type 执行单个动作（调接口 / 设字段 / 打印 / 跳页 / toast）
 * - setupPageEvents：为每个事件源注册监听，返回清理函数
 * - migrateScannerToEvents：把旧 ScannerConfig 适配成等价 PageEvent[]，保证存量页面零迁移
 */
import type { StateScope } from './pageState'
import { eventManager } from './EventHandler'
import { navigationManager } from './NavigationManager'
import { speak } from './speakBridge'
import { getTool } from './tools'
import { withTimeout, withRetry, resolveDegrade } from './degrade'
import { rootEmitScope, makeGuardedEmit, type EmitScope } from './emitScope'
import type { ScannerConfig } from '@/pages/PageEditorPage'
import type {
  PageEvent,
  EventAction,
  EventContext,
  ConditionExpr,
  ScanFilter,
  InterfaceType,
  StateScopeKind,
} from './eventTypes'

// 点路径取值，如 data.employee.name
export function resolveNestedField(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').reduce((cur, key) => (cur == null ? cur : cur[key]), obj)
}

/** 解析值来源表达式 */
export function resolveSrc(src: string | undefined, ctx: EventContext): any {
  if (src === undefined || src === null) return undefined
  const s = String(src)
  if (s === '$scan') return ctx.scan
  if (s.startsWith('$node.')) return resolveNestedField(ctx.nodeOutputs, s.slice(6))
  if (s.startsWith('$app.')) return resolveNestedField(ctx.app, s.slice(5))
  if (s.startsWith('$form.')) return resolveNestedField(ctx.form, s.slice(6))
  if (s.startsWith('$event.')) return resolveNestedField(ctx.event, s.slice(7))
  if (s === '$event') return ctx.event
  return s // 字面量
}

/** 前置过滤（沿用旧 scanner.filters 语义） */
export function passScanFilter(value: string, filters: ScanFilter = {}): boolean {
  if (filters.min_length && value.length < filters.min_length) return false
  if (filters.max_length && value.length > filters.max_length) return false
  if (filters.prefix && !value.startsWith(filters.prefix)) return false
  if (filters.contains && !value.includes(filters.contains)) return false
  if (filters.not_contains && value.includes(filters.not_contains)) return false
  if (filters.regex) {
    try { if (!new RegExp(filters.regex).test(value)) return false } catch { return false }
  }
  return true
}

/** 触发条件判定 */
export function evalCondition(cond: ConditionExpr | undefined, ctx: EventContext): boolean {
  if (!cond || !cond.left_src) return true
  const raw = resolveSrc(cond.left_src, ctx)
  const val = cond.value
  switch (cond.operator) {
    case 'not_empty': return raw !== undefined && raw !== null && String(raw).trim() !== ''
    case 'empty':     return raw === undefined || raw === null || String(raw).trim() === ''
    case 'eq':        return String(raw) === String(val)
    case 'neq':       return String(raw) !== String(val)
    case 'in': {
      const list = String(val ?? '').split(',').map(s => s.trim())
      return list.includes(String(raw))
    }
    case 'gt': return Number(raw) > Number(val)
    case 'lt': return Number(raw) < Number(val)
    default:   return true
  }
}

// ── 执行器依赖（由渲染器注入） ──────────────────────────────────────
export interface EventEngineDeps {
  /**
   * 页面状态容器（页面作用域）。表单页=FormilyPageState；
   * app 级常驻事件传入一个指向「当前活动页」的代理（无页面挂载时 page 作用域写入 no-op）。
   */
  pageState: StateScope
  /** 应用级状态容器（AppState）。无 AppState 环境（如旧入口）时可缺省。 */
  appState?: StateScope
  onScanInterface?: (
    interfaceCode: string,
    paramValues: Record<string, any>,
    type?: InterfaceType,
    endpointId?: number,
  ) => Promise<any>
  /** 触发打印（阶段4 实现，走 AndroidBridge） */
  doPrint?: (templateId: string, values: Record<string, any>, extra?: Record<string, any>) => Promise<void>
  /** 跳页 */
  navigate?: (pageKey: string, params: Record<string, any>) => void
  /** 提示 */
  toast?: (msg: string) => void
  /** DAG 执行轨迹回调（可观测性；线性路径不触发） */
  onTrace?: (traces: import('./dag/types').NodeTrace[]) => void
}

/** 空状态容器：app 作用域被请求但无 AppState 时的安全兜底（全部 no-op）。 */
const NULL_SCOPE: StateScope = {
  getValues: () => ({}),
  get: () => undefined,
  set: () => {},
  setProp: () => {},
  subscribe: () => () => {},
}

/** 按作用域取状态容器：'app' → appState，'page'（默认）→ pageState。 */
function scopeOf(deps: EventEngineDeps, scope?: StateScopeKind): StateScope {
  if (scope === 'app') return deps.appState ?? NULL_SCOPE
  return deps.pageState
}

/** 构造一次事件触发的上下文（含 page/app 双快照）。 */
function makeCtx(deps: EventEngineDeps, base: Partial<EventContext>): EventContext {
  return {
    scan: base.scan,
    form: deps.pageState.getValues(),
    app: deps.appState?.getValues(),
    event: base.event,
  }
}

/**
 * 脚本动作可用的 ctx API。用户脚本体内通过 `ctx.xxx` 访问。
 * 设计器侧的自动补全项需与此保持同步（见 designer ScriptEditor 的 ctx 补全树）。
 */
export interface ScriptApi {
  /** 触发值（扫码/事件原始值） */
  scan?: string
  /** 事件载荷（自定义事件携带的对象/字符串） */
  event?: any
  /** 当前表单值快照（只读副本） */
  values: Record<string, any>
  /** 读取字段值 */
  get: (field: string) => any
  /** 写入字段值 */
  set: (field: string, value: any) => void
  /** 设置字段展示属性：visible/disabled/readOnly(boolean) 或 background/color/title(string) */
  setProp: (field: string, prop: string, value: any) => void
  /** 调接口：type 默认 internal；third_party 用 endpointId */
  callInterface: (
    interfaceCode: string,
    params?: Record<string, any>,
    type?: InterfaceType,
    endpointId?: number,
  ) => Promise<any>
  /** 触发打印模板 */
  print: (templateId: string, extra?: Record<string, any>) => Promise<void>
  /** 跳转页面 */
  navigate: (pageKey: string, params?: Record<string, any>) => void
  /** 顶部提示 */
  toast: (msg: string) => void
  /** 语音播报 */
  speak: (text: string) => void
  /** 触发自定义事件 */
  emit: (eventName: string, data?: any) => void
  /** 读取应用级状态字段（AppState） */
  appGet: (field: string) => any
  /** 写入应用级状态字段（AppState） */
  appSet: (field: string, value: any) => void
  /** 读取上游节点产出（DAG 路径）：node('q') 取整个产出，node('q','data.id') 取点路径 */
  node: (nodeId: string, path?: string) => any
}

/** 用运行时依赖与上下文构造脚本 API。guardedEmit 为带环路守卫的 emit。 */
function buildScriptApi(
  ctx: EventContext,
  deps: EventEngineDeps,
  guardedEmit: (eventName: string, data: string) => void,
): ScriptApi {
  const appScope = deps.appState ?? NULL_SCOPE
  return {
    scan: ctx.scan,
    event: ctx.event,
    values: { ...deps.pageState.getValues() },
    get: (field) => resolveNestedField(deps.pageState.getValues(), field),
    set: (field, value) => { if (field) deps.pageState.set(field, value) },
    setProp: (field, prop, value) => {
      if (!field || !prop) return
      deps.pageState.setProp(field, prop as any, value)
    },
    callInterface: async (interfaceCode, params = {}, type = 'internal', endpointId) => {
      if (!deps.onScanInterface) return undefined
      return deps.onScanInterface(interfaceCode, params, type, endpointId)
    },
    print: async (templateId, extra) => {
      if (deps.doPrint && templateId) await deps.doPrint(templateId, deps.pageState.getValues(), extra)
    },
    navigate: (pageKey, params = {}) => { if (deps.navigate && pageKey) deps.navigate(pageKey, params) },
    toast: (msg) => { if (deps.toast && msg != null) deps.toast(String(msg)) },
    speak: (text) => { if (text != null && String(text).trim() !== '') speak(String(text)) },
    emit: (eventName, data) => {
      if (!eventName) return
      const payload = data == null ? '' : (typeof data === 'object' ? JSON.stringify(data) : String(data))
      guardedEmit(eventName, payload)
    },
    appGet: (field) => appScope.get(field),
    appSet: (field, value) => { if (field) appScope.set(field, value) },
    node: (nodeId, path) => {
      const out = ctx.nodeOutputs?.[nodeId]
      return path ? resolveNestedField(out, path) : out
    },
  }
}

/** 执行一段用户脚本（async 函数体，注入 ScriptApi 的 ctx 变量） */
async function execScript(
  scriptBody: string,
  ctx: EventContext,
  deps: EventEngineDeps,
  guardedEmit: (eventName: string, data: string) => void,
): Promise<void> {
  const api = buildScriptApi(ctx, deps, guardedEmit)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as
    new (...args: string[]) => (...a: any[]) => Promise<any>
  const fn = new AsyncFunction('ctx', scriptBody)
  await fn(api)
}

/**
 * 执行单个动作：查工具注册表 → 套超时/重试 → execute。
 * scope 为本次触发的事件链环路守卫上下文（供 emit_event / run_script 内的 emit 使用）。
 */
export async function runEventAction(
  action: EventAction,
  ctx: EventContext,
  deps: EventEngineDeps,
  emitScope: EmitScope = rootEmitScope(),
): Promise<Record<string, any> | void> {
  const tool = getTool(action.type)
  if (!tool) { deps.toast?.(`未知工具：${(action as any).type}`); return }

  const guardedEmit = makeGuardedEmit(emitScope, deps.toast)
  const x = {
    ctx,
    deps,
    resolve: (src?: string) => resolveSrc(src, ctx),
    scopeFor: (scope?: StateScopeKind) => scopeOf(deps, scope),
    emit: guardedEmit,
    runScript: (body: string) => execScript(body, ctx, deps, guardedEmit),
  }
  const { timeout, retry } = resolveDegrade(action as any, tool)
  return withRetry(() => withTimeout(Promise.resolve(tool.execute(action, x)), timeout), retry)
}

/** 顺序执行动作链 */
async function runActions(
  ev: PageEvent,
  ctx: EventContext,
  deps: EventEngineDeps,
  emitScope: EmitScope = rootEmitScope(),
): Promise<void> {
  // 窄 DAG 路径：事件配了 graph 且有节点时走拓扑调度；否则走线性 actions（存量）
  if (ev.graph && ev.graph.nodes && ev.graph.nodes.length > 0) {
    const { runGraph } = await import('./dag/scheduler')
    await runGraph(ev.graph, ctx, deps, emitScope)
    return
  }
  const actions = ev.actions || []
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    // 单动作执行条件：不满足则跳过该动作（不中断后续动作）
    if (action.when && !evalCondition(action.when, ctx)) continue
    try {
      await runEventAction(action, ctx, deps, emitScope)
    } catch (e: any) {
      const strategy = action.onError ?? 'abort'
      deps.toast?.(`事件「${ev.name || ev.id}」动作${i + 1}失败：${e?.message || e}`)
      if (strategy === 'continue') continue
      if (strategy === 'fallback' && action.fallbackActionIndex != null) {
        const fb = actions[action.fallbackActionIndex]
        if (fb) {
          try { await runEventAction(fb, ctx, deps, emitScope) } catch { /* 回退也失败则止于此 */ }
        }
        continue
      }
      // 'abort'（默认）：中断后续动作（避免基于失败结果继续），与改造前行为一致
      break
    }
  }
}

/** 触发名为 buttonId 的按钮事件（供 PrintButton 等字段组件调用） */
export type ButtonTrigger = (buttonId: string) => void

/** 触发页面生命周期事件（page_enter / page_exit） */
export type LifecycleTrigger = (kind: 'page_enter' | 'page_exit') => void

/**
 * 注册页面所有事件源监听。返回清理函数。
 * 同时返回 triggerButton 供字段级按钮组件触发 source.kind === 'button' 的事件，
 * 以及 triggerLifecycle 供渲染器在进入/退出页面时触发生命周期事件。
 */
export function setupPageEvents(
  events: PageEvent[],
  deps: EventEngineDeps,
): { cleanup: () => void; triggerButton: ButtonTrigger; triggerLifecycle: LifecycleTrigger } {
  const disposers: Array<() => void> = []

  // scan / custom_event：监听事件总线
  const scanTypeToEventNames = (st?: string): string[] => {
    if (!st || st === 'any') return ['barcode', 'qrcode', 'nfc']
    return [st]
  }

  for (const ev of events) {
    if (ev.source.kind === 'scan' || ev.source.kind === 'custom_event') {
      const names = ev.source.kind === 'scan'
        ? scanTypeToEventNames(ev.source.scan_type)
        : [ev.source.event_name]
      const handler = (eventData: string, scope?: EmitScope) => {
        // 自定义事件可能携带 JSON 对象
        let parsed: any = eventData
        try { parsed = JSON.parse(eventData) } catch { /* 保持字符串 */ }
        const ctx = makeCtx(deps, {
          scan: typeof eventData === 'string' ? eventData : String(eventData),
          event: parsed,
        })
        if (!passScanFilter(ctx.scan || '', ev.filters)) return
        if (!evalCondition(ev.when, ctx)) return
        // scope 由 makeGuardedEmit 透传（custom_event 链）；外部源（扫码）缺省 → root
        void runActions(ev, ctx, deps, scope ?? rootEmitScope())
      }
      for (const name of names) {
        if (!name) continue
        eventManager.on(name, handler)
        disposers.push(() => eventManager.off(name, handler))
      }
    }
  }

  // field_change / state_change：通过 StateScope 订阅字段变化（不再直接依赖 Formily effects）
  // - field_change：监听页面作用域（等价 state_change{scope:'page'}，保留作存量兼容）
  // - state_change：按 source.scope 监听 page 或 app 作用域
  type ChangeWatch = { field: string; scope: StateScopeKind; ev: PageEvent }
  const changeWatches: ChangeWatch[] = []
  for (const ev of events) {
    if (ev.source.kind === 'field_change') {
      changeWatches.push({ field: ev.source.field, scope: 'page', ev })
    } else if (ev.source.kind === 'state_change') {
      changeWatches.push({ field: ev.source.field, scope: ev.source.scope, ev })
    }
  }
  if (changeWatches.length > 0) {
    const subscribeScope = (scope: StateScopeKind) => {
      const watches = changeWatches.filter(w => w.scope === scope)
      if (watches.length === 0) return
      const target = scopeOf(deps, scope)
      const unsub = target.subscribe((shortName: string, value: any) => {
        for (const w of watches) {
          if (w.field !== shortName) continue
          const ctx = makeCtx(deps, { event: value })
          if (!evalCondition(w.ev.when, ctx)) continue
          void runActions(w.ev, ctx, deps)
        }
      })
      disposers.push(unsub)
    }
    subscribeScope('page')
    subscribeScope('app')
  }

  // button：暴露触发器
  const triggerButton: ButtonTrigger = (buttonId: string) => {
    for (const ev of events) {
      if (ev.source.kind !== 'button') continue
      if (ev.source.button_id !== buttonId) continue
      const ctx = makeCtx(deps, {})
      if (!evalCondition(ev.when, ctx)) continue
      void runActions(ev, ctx, deps)
    }
  }

  // page_enter / page_exit：暴露生命周期触发器
  const triggerLifecycle: LifecycleTrigger = (kind) => {
    for (const ev of events) {
      if (ev.source.kind !== kind) continue
      const ctx = makeCtx(deps, {})
      if (!evalCondition(ev.when, ctx)) continue
      void runActions(ev, ctx, deps)
    }
  }

  return {
    cleanup: () => { disposers.forEach(d => d()) },
    triggerButton,
    triggerLifecycle,
  }
}

/**
 * 把旧 ScannerConfig 适配为等价 PageEvent[]。
 * 旧语义：扫码(barcode/qrcode) → 过滤 → 填字段 → 调接口 → 结果回填。
 */
export function migrateScannerToEvents(scanner?: ScannerConfig): PageEvent[] {
  if (!scanner?.enabled) return []
  const actions: EventAction[] = []

  if (scanner.fill_field) {
    actions.push({ type: 'set_field', field: scanner.fill_field, value_src: '$scan' })
  }

  const a = scanner.action
  const hasIface = a && (a.interface_code || a.third_party_endpoint_id || a.connector_interface_code)
  if (a && hasIface) {
    const scanParam = a.scan_param || 'code'
    const param_map: Array<{ key: string; src: string }> = [{ key: scanParam, src: '$scan' }]
    for (const ep of a.extra_params || []) {
      if (!ep.param_key) continue
      // 旧 src 语义：$scan / $form.字段 / 字面量 —— 与新 resolveSrc 完全一致
      param_map.push({ key: ep.param_key, src: ep.src })
    }
    actions.push({
      type: 'call_interface',
      interface_type: a.interface_type || 'internal',
      interface_code: a.interface_code,
      third_party_endpoint_id: a.third_party_endpoint_id,
      connector_interface_code: a.connector_interface_code,
      param_map,
      result_map: a.result_map || [],
    })
  }

  if (actions.length === 0) return []

  return [{
    id: 'legacy-scanner',
    name: '扫码（兼容）',
    source: { kind: 'scan', scan_type: 'any' },
    filters: scanner.filters,
    actions,
  }]
}

/**
 * 解析页面配置得到最终生效的事件列表：
 * 优先用显式 events[]；同时把旧 scanner 也合并进来（两者可共存）。
 */
export function resolvePageEvents(config: { events?: PageEvent[]; scanner?: ScannerConfig }): PageEvent[] {
  const explicit = Array.isArray(config.events) ? config.events : []
  const legacy = migrateScannerToEvents(config.scanner)
  return [...explicit, ...legacy]
}
