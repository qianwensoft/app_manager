/**
 * 脚本运行时 API：构造注入用户脚本的 `ctx` 变量。
 *
 * 用户脚本体是 async 函数体，通过 `ctx.xxx` 访问运行时能力：
 *  - 元素读写：ctx.getProp / setProp / setBinding
 *  - 上下文：ctx.globalGet/globalSet、ctx.wfGet/wfSet
 *  - 数据接口：ctx.callInterface
 *  - 画布/模态/提示：ctx.switchCanvas / openModal / closeModal / toast
 *  - 事件：ctx.emit
 *  - DAG 节点产出：ctx.node
 *  - 工具库：ctx.utils（time/math/string/array + lodash-es `_`）
 *  - 外部库：ctx.libs.<name>（由 libLoader 注入）
 *
 * 设计器 ScriptEditor 的补全项须与本文件的 ctx 形状保持同步（见 buildCtxCompletions）。
 */
import * as _ from 'lodash-es'
import type { ElementSelector } from '@/types/workflow'
import type { WorkflowContext, WorkflowEngineDeps, ContextStore, ElementScope } from './types'
import { resolveNestedField } from './resolveSrc'
import { formatDate, parseAnyToDate } from '@/runtime/dateTimeFormat'
import { getLoadedLibs } from './libLoader'

/** ctx.utils.time —— 复用 dateTimeFormat 的解析/格式化 */
const timeUtils = {
  /** 当前毫秒时间戳 */
  now: () => Date.now(),
  /** 格式化：format(value?, pattern?, locale?)；value 缺省=当前时间 */
  format: (value?: unknown, pattern = 'YYYY-MM-DD HH:mm:ss', locale: 'zh' | 'en' = 'zh') => {
    const d = value === undefined ? new Date() : parseAnyToDate(value, 'auto')
    return d ? formatDate(d, pattern, locale) : ''
  },
  /** 解析任意值为 Date（时间戳/字符串自动兼容） */
  parse: (value: unknown) => parseAnyToDate(value, 'auto'),
  /** 加 N 天，返回新 Date */
  addDays: (value: unknown, days: number) => {
    const d = value === undefined ? new Date() : parseAnyToDate(value, 'auto')
    if (!d) return null
    const r = new Date(d.getTime())
    r.setDate(r.getDate() + days)
    return r
  },
  /** 两时间差（毫秒，a-b） */
  diff: (a: unknown, b: unknown) => {
    const da = parseAnyToDate(a, 'auto')
    const db = parseAnyToDate(b, 'auto')
    if (!da || !db) return NaN
    return da.getTime() - db.getTime()
  },
}

const mathUtils = {
  clamp: (n: number, min: number, max: number) => Math.min(max, Math.max(min, n)),
  round: (n: number, digits = 0) => {
    const f = 10 ** digits
    return Math.round(n * f) / f
  },
  sum: (arr: number[]) => arr.reduce((s, x) => s + (Number(x) || 0), 0),
  avg: (arr: number[]) => (arr.length ? mathUtils.sum(arr) / arr.length : 0),
  random: (min = 0, max = 1) => min + Math.random() * (max - min),
}

const stringUtils = {
  pad: (s: unknown, len: number, ch = '0') => String(s).padStart(len, ch),
  template: (tpl: string, data: Record<string, unknown>) =>
    tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => {
      const v = resolveNestedField(data, String(k))
      return v === undefined || v === null ? '' : String(v)
    }),
  toNumber: (s: unknown) => {
    const n = parseFloat(String(s))
    return Number.isFinite(n) ? n : 0
  },
}

const arrayUtils = {
  uniq: <T,>(arr: T[]) => Array.from(new Set(arr)),
  groupBy: <T,>(arr: T[], key: string) => _.groupBy(arr, key),
  sortBy: <T,>(arr: T[], key: string) => _.sortBy(arr, key),
  sum: (arr: number[]) => mathUtils.sum(arr),
}

/** ctx.utils 聚合 */
export const scriptUtils = {
  time: timeUtils,
  math: mathUtils,
  string: stringUtils,
  array: arrayUtils,
  _,
}

/** 脚本可访问的 ctx 形状 */
export interface ScriptApi {
  /** 触发事件载荷 */
  event?: unknown
  /** 触发点位键（point_change/condition 源） */
  pointKey?: string
  /** 点位数据快照（只读副本） */
  point: Record<string, unknown>
  /** 读元素属性：getProp(sel, 'text') */
  getProp: (sel: ElementSelector, prop: string) => unknown
  /** 写元素属性：setProp(sel, 'fill', '#f00') */
  setProp: (sel: ElementSelector, prop: string, value: unknown) => void
  /** 注入元素绑定值（写 pointData 覆盖层） */
  setBinding: (sel: ElementSelector, value: unknown) => void
  /** 读全局上下文 */
  globalGet: (path: string) => unknown
  /** 写全局上下文 */
  globalSet: (path: string, value: unknown) => void
  /** 读工作流上下文 */
  wfGet: (path: string) => unknown
  /** 写工作流上下文 */
  wfSet: (path: string, value: unknown) => void
  /** 调数据接口：callInterface({ ifaceCode, params }) */
  callInterface: (opts: { ifaceId?: number; ifaceCode?: string; params?: Record<string, unknown> }) => Promise<unknown>
  /** 切换画布 */
  switchCanvas: (canvasId: number) => void
  /** 打开模态 */
  openModal: (target: string) => void
  /** 关闭模态 */
  closeModal: (target: string) => void
  /** 顶部提示 */
  toast: (msg: string) => void
  /** 触发自定义事件 */
  emit: (eventName: string, data?: unknown) => void
  /** 读上游节点产出：node('n1') 或 node('n1', 'data.id') */
  node: (nodeId: string, path?: string) => unknown
  /** 内置工具库 */
  utils: typeof scriptUtils
  /** 外部库（由 libLoader 注入） */
  libs: Record<string, unknown>
}

/** ScriptEditor 自动补全的单一来源：ctx.* 顶层成员 + ctx.utils.* */
export interface CtxCompletion {
  label: string
  detail: string
  type: 'method' | 'property' | 'variable'
}

export const ctxCompletions: CtxCompletion[] = [
  { label: 'ctx.point', detail: '点位数据快照（只读）', type: 'property' },
  { label: 'ctx.event', detail: '触发事件载荷', type: 'property' },
  { label: 'ctx.pointKey', detail: '触发点位键', type: 'property' },
  { label: 'ctx.getProp(sel, prop)', detail: '读元素属性', type: 'method' },
  { label: 'ctx.setProp(sel, prop, value)', detail: '写元素属性', type: 'method' },
  { label: 'ctx.setBinding(sel, value)', detail: '注入元素绑定值', type: 'method' },
  { label: 'ctx.globalGet(path)', detail: '读全局上下文', type: 'method' },
  { label: 'ctx.globalSet(path, value)', detail: '写全局上下文', type: 'method' },
  { label: 'ctx.wfGet(path)', detail: '读工作流上下文', type: 'method' },
  { label: 'ctx.wfSet(path, value)', detail: '写工作流上下文', type: 'method' },
  { label: 'ctx.callInterface({ ifaceCode, params })', detail: '调用数据接口', type: 'method' },
  { label: 'ctx.switchCanvas(canvasId)', detail: '切换画布', type: 'method' },
  { label: 'ctx.openModal(target)', detail: '打开模态', type: 'method' },
  { label: 'ctx.closeModal(target)', detail: '关闭模态', type: 'method' },
  { label: 'ctx.toast(msg)', detail: '顶部提示', type: 'method' },
  { label: 'ctx.emit(eventName, data)', detail: '触发自定义事件', type: 'method' },
  { label: 'ctx.node(nodeId, path?)', detail: '读上游节点产出', type: 'method' },
  { label: 'ctx.utils.time.now()', detail: '当前毫秒时间戳', type: 'method' },
  { label: 'ctx.utils.time.format(v, pattern)', detail: '格式化时间', type: 'method' },
  { label: 'ctx.utils.time.parse(v)', detail: '解析为 Date', type: 'method' },
  { label: 'ctx.utils.time.addDays(v, n)', detail: '加 N 天', type: 'method' },
  { label: 'ctx.utils.time.diff(a, b)', detail: '时间差(ms)', type: 'method' },
  { label: 'ctx.utils.math.clamp(n, min, max)', detail: '数值钳制', type: 'method' },
  { label: 'ctx.utils.math.round(n, digits)', detail: '四舍五入', type: 'method' },
  { label: 'ctx.utils.math.sum(arr)', detail: '求和', type: 'method' },
  { label: 'ctx.utils.math.avg(arr)', detail: '求平均', type: 'method' },
  { label: 'ctx.utils.math.random(min, max)', detail: '随机数', type: 'method' },
  { label: 'ctx.utils.string.pad(s, len, ch)', detail: '左填充', type: 'method' },
  { label: 'ctx.utils.string.template(tpl, data)', detail: '模板替换 {{k}}', type: 'method' },
  { label: 'ctx.utils.string.toNumber(s)', detail: '转数字', type: 'method' },
  { label: 'ctx.utils.array.uniq(arr)', detail: '去重', type: 'method' },
  { label: 'ctx.utils.array.groupBy(arr, key)', detail: '分组', type: 'method' },
  { label: 'ctx.utils.array.sortBy(arr, key)', detail: '排序', type: 'method' },
  { label: 'ctx.utils._', detail: 'lodash-es', type: 'property' },
  { label: 'ctx.libs', detail: '外部库命名空间', type: 'property' },
]

/** 用运行时依赖与上下文构造脚本 ctx。guardedEmit 为带环路守卫的 emit。 */
export function buildScriptApi(
  ctx: WorkflowContext,
  deps: WorkflowEngineDeps,
  elementScope: ElementScope,
  wfStore: ContextStore,
  guardedEmit: (eventName: string, data: unknown) => void,
): ScriptApi {
  return {
    event: ctx.event,
    pointKey: ctx.pointKey,
    point: { ...ctx.point },
    getProp: (sel, prop) => elementScope.getProp(sel, prop),
    setProp: (sel, prop, value) => elementScope.setProp(sel, prop, value),
    setBinding: (sel, value) => elementScope.setBinding(sel, value),
    globalGet: (path) => deps.globalContext.get(path),
    globalSet: (path, value) => { if (path) deps.globalContext.set(path, value) },
    wfGet: (path) => wfStore.get(path),
    wfSet: (path, value) => { if (path) wfStore.set(path, value) },
    callInterface: async (opts) => {
      if (!deps.callInterface) return undefined
      return deps.callInterface({ ifaceId: opts.ifaceId, ifaceCode: opts.ifaceCode, params: opts.params ?? {} })
    },
    switchCanvas: (canvasId) => deps.switchCanvas?.(canvasId),
    openModal: (target) => deps.openModal?.(target),
    closeModal: (target) => deps.closeModal?.(target),
    toast: (msg) => { if (msg != null) deps.toast?.(String(msg)) },
    emit: (eventName, data) => { if (eventName) guardedEmit(eventName, data) },
    node: (nodeId, path) => {
      const out = ctx.nodeOutputs?.[nodeId]
      return path ? resolveNestedField(out, path) : out
    },
    utils: scriptUtils,
    libs: getLoadedLibs(),
  }
}

/** 执行一段用户脚本（async 函数体，注入 ScriptApi 的 ctx 变量），返回脚本 return 值 */
export async function execScript(
  scriptBody: string,
  ctx: WorkflowContext,
  deps: WorkflowEngineDeps,
  elementScope: ElementScope,
  wfStore: ContextStore,
  guardedEmit: (eventName: string, data: unknown) => void,
): Promise<unknown> {
  const api = buildScriptApi(ctx, deps, elementScope, wfStore, guardedEmit)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as
    new (...args: string[]) => (...a: unknown[]) => Promise<unknown>
  const fn = new AsyncFunction('ctx', scriptBody)
  return fn(api)
}
