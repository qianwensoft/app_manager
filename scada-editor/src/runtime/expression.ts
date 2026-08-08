/**
 * 接口参数表达式运行时。
 *
 * 用于「接口数据」绑定的参数值支持轻量表达式（JS 子集，通过 new Function 求值），
 * 作用域内注入：
 *   - 全局参数：params（对象）、P('key')（取值函数）
 *   - 点位数据：point（对象）、V('path')（点分隔取值）
 *   - 组件值：  el('名称或ID', '属性?')（读取其它元件属性）
 *   - URL 参数：url('name')
 *   - SCADA 上下文：ctx（{ scadaCode }）、组合对象：obj
 *   - 常用时间函数：now/nowMs/today/formatDate/addDays/... （见 buildTimeApi）
 *   - 通用工具：pad/round/num/int/str/bool/upper/lower/trim/json/coalesce
 *   - 自定义函数：项目级 CustomFunctionDef 按名注入
 *
 * 设计目标：给非专业用户「填空即用」的时间/参数能力，同时给高级用户完整 JS 表达式。
 * 失败（语法/运行时错误）时返回 undefined，绝不抛出，避免打断轮询。
 */
import type { CanvasElement, CustomFunctionDef, GlobalParam } from '@/types'
import { formatDate, parseAnyToDate } from './dateTimeFormat'
import { getPath, parseBindingValue, resolveExtDataReference } from './bindingData'
import type { PointDataMap } from '@/hooks/useStompPointData'

export interface ExpressionScope {
  /** 已解析的全局参数值 */
  params?: Record<string, unknown>
  /** 点位数据快照 */
  point?: PointDataMap
  /** 画布元件（用于 el() 组件值读取） */
  elements?: CanvasElement[]
  /** 组合对象上下文（组内实例） */
  obj?: Record<string, unknown>
  /** SCADA 上下文 */
  scadaCode?: string
  /** URL 查询串（默认 window.location.search） */
  urlSearch?: string
  /** 自定义函数定义 */
  customFunctions?: CustomFunctionDef[]
  /** 全局上下文快照（$global / global.*，与工作流全局上下文一致） */
  global?: Record<string, unknown>
  /** 组件快照映射（components.<名称|id>.*，含 params/ext/value/chart） */
  components?: Record<string, unknown>
  /** 额外注入作用域的变量（如转换表达式的原始值 v） */
  extra?: Record<string, unknown>
}

/**
 * 按 pattern 输出：
 * - pattern === 'x' → 毫秒时间戳（number）
 * - pattern === 'X' → 秒级时间戳（number）
 * - 其它 → 走 formatDate 返回字符串
 * 这样任意时间函数传入 'x'/'X' 即可直接拿时间戳，无需再包 toTimestamp()。
 */
function fmt(d: Date, pattern: string, locale: 'zh' | 'en' = 'zh'): string | number {
  if (pattern === 'x') return d.getTime()
  if (pattern === 'X') return Math.floor(d.getTime() / 1000)
  return formatDate(d, pattern, locale)
}

/** el() 嵌套解析最大递归深度（防止 extData 相互引用形成环导致栈溢出） */
const MAX_EL_DEPTH = 8

const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
const endOf = (d: Date) => { d.setHours(23, 59, 59, 999); return d }

/** 内置时间函数：复用 dateTimeFormat 的解析/格式化，保持与文本时钟组件一致 */
function buildTimeApi() {
  const toDate = (v?: unknown) => (v === undefined || v === null || v === '' ? new Date() : parseAnyToDate(v, 'auto') ?? new Date())
  return {
    /** 当前时间毫秒时间戳 */
    nowMs: () => Date.now(),
    /** 当前时间秒级时间戳 */
    nowSec: () => Math.floor(Date.now() / 1000),
    /** 当前时间，按格式返回字符串（默认 YYYY-MM-DD HH:mm:ss）；传 'x'/'X' 返回时间戳 */
    now: (pattern = 'YYYY-MM-DD HH:mm:ss') => fmt(new Date(), pattern),
    /** 今天日期字符串（默认 YYYY-MM-DD）；传 'x'/'X' 返回时间戳 */
    today: (pattern = 'YYYY-MM-DD') => fmt(new Date(), pattern),
    /** 昨天日期字符串；传 'x'/'X' 返回时间戳 */
    yesterday: (pattern = 'YYYY-MM-DD') => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d, pattern) },
    /** 明天日期字符串；传 'x'/'X' 返回时间戳 */
    tomorrow: (pattern = 'YYYY-MM-DD') => { const d = new Date(); d.setDate(d.getDate() + 1); return fmt(d, pattern) },
    /** 格式化任意时间值（时间戳/字符串/Date），缺省用当前时间；传 'x'/'X' 返回时间戳 */
    formatDate: (v?: unknown, pattern = 'YYYY-MM-DD HH:mm:ss', locale: 'zh' | 'en' = 'zh') => fmt(toDate(v), pattern, locale),
    /** 解析任意值为毫秒时间戳（失败返回 NaN） */
    toTimestamp: (v?: unknown) => { const d = parseAnyToDate(v ?? new Date(), 'auto'); return d ? d.getTime() : NaN },
    /** 解析任意值为秒级时间戳（失败返回 NaN） */
    toUnix: (v?: unknown) => { const d = parseAnyToDate(v ?? new Date(), 'auto'); return d ? Math.floor(d.getTime() / 1000) : NaN },
    /** 加 N 天，返回格式化字符串（可选格式）；amount 可为负 */
    addDays: (v: unknown, amount: number, pattern?: string) => shift(toDate(v), 'date', amount, pattern),
    /** 加 N 小时 */
    addHours: (v: unknown, amount: number, pattern?: string) => shift(toDate(v), 'hours', amount, pattern),
    /** 加 N 分钟 */
    addMinutes: (v: unknown, amount: number, pattern?: string) => shift(toDate(v), 'minutes', amount, pattern),
    /** 加 N 月 */
    addMonths: (v: unknown, amount: number, pattern?: string) => shift(toDate(v), 'month', amount, pattern),
    /** 当天 00:00:00；传 'x'/'X' 返回时间戳 */
    startOfDay: (v?: unknown, pattern = 'YYYY-MM-DD HH:mm:ss') => fmt(startOf(toDate(v)), pattern),
    /** 当天 23:59:59.999；传 'x'/'X' 返回时间戳 */
    endOfDay: (v?: unknown, pattern = 'YYYY-MM-DD HH:mm:ss') => fmt(endOf(toDate(v)), pattern),
    /** 今日开始 00:00:00（默认 YYYY-MM-DD HH:mm:ss）；传 'x'/'X' 返回时间戳 */
    todayStart: (pattern = 'YYYY-MM-DD HH:mm:ss') => fmt(startOf(new Date()), pattern),
    /** 今日结束 23:59:59.999；传 'x'/'X' 返回时间戳 */
    todayEnd: (pattern = 'YYYY-MM-DD HH:mm:ss') => fmt(endOf(new Date()), pattern),
    /** 昨日开始 00:00:00；传 'x'/'X' 返回时间戳 */
    yesterdayStart: (pattern = 'YYYY-MM-DD HH:mm:ss') => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(startOf(d), pattern) },
    /** 昨日结束 23:59:59.999；传 'x'/'X' 返回时间戳 */
    yesterdayEnd: (pattern = 'YYYY-MM-DD HH:mm:ss') => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(endOf(d), pattern) },
    /** 今日开始毫秒时间戳 */
    todayStartMs: () => startOf(new Date()).getTime(),
    /** 今日结束毫秒时间戳 */
    todayEndMs: () => endOf(new Date()).getTime(),
    /** 昨日开始毫秒时间戳 */
    yesterdayStartMs: () => { const d = new Date(); d.setDate(d.getDate() - 1); return startOf(d).getTime() },
    /** 昨日结束毫秒时间戳 */
    yesterdayEndMs: () => { const d = new Date(); d.setDate(d.getDate() - 1); return endOf(d).getTime() },
    /** 今日开始秒级时间戳 */
    todayStartSec: () => Math.floor(startOf(new Date()).getTime() / 1000),
    /** 今日结束秒级时间戳 */
    todayEndSec: () => Math.floor(endOf(new Date()).getTime() / 1000),
    /** 昨日开始秒级时间戳 */
    yesterdayStartSec: () => { const d = new Date(); d.setDate(d.getDate() - 1); return Math.floor(startOf(d).getTime() / 1000) },
    /** 昨日结束秒级时间戳 */
    yesterdayEndSec: () => { const d = new Date(); d.setDate(d.getDate() - 1); return Math.floor(endOf(d).getTime() / 1000) },
    /** 两时间差（毫秒，a-b） */
    diffMs: (a: unknown, b: unknown) => { const da = parseAnyToDate(a, 'auto'); const db = parseAnyToDate(b, 'auto'); return da && db ? da.getTime() - db.getTime() : NaN },
  }
}

function shift(d: Date, unit: 'date' | 'hours' | 'minutes' | 'month', amount: number, pattern?: string): string | number {
  const r = new Date(d.getTime())
  if (unit === 'date') r.setDate(r.getDate() + amount)
  else if (unit === 'hours') r.setHours(r.getHours() + amount)
  else if (unit === 'minutes') r.setMinutes(r.getMinutes() + amount)
  else if (unit === 'month') r.setMonth(r.getMonth() + amount)
  return pattern ? formatDate(r, pattern) : r.getTime()
}

/** 通用工具函数 */
function buildUtilApi() {
  return {
    /** 左填充：pad(5, 2) => '05' */
    pad: (v: unknown, len: number, ch = '0') => String(v).padStart(len, ch),
    /** 四舍五入到 digits 位小数 */
    round: (n: unknown, digits = 0) => { const f = 10 ** digits; return Math.round(Number(n) * f) / f },
    /** 转数字（失败返回 fallback，默认 0） */
    num: (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback },
    /** 转整数 */
    int: (v: unknown, fallback = 0) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : fallback },
    /** 转字符串 */
    str: (v: unknown) => (v === undefined || v === null ? '' : String(v)),
    /** 转布尔 */
    bool: (v: unknown) => v === true || v === 'true' || v === 1 || v === '1',
    upper: (v: unknown) => String(v).toUpperCase(),
    lower: (v: unknown) => String(v).toLowerCase(),
    trim: (v: unknown) => String(v).trim(),
    /** JSON 序列化 */
    json: (v: unknown) => { try { return JSON.stringify(v) } catch { return '' } },
    /** 取首个非空值 */
    coalesce: (...args: unknown[]) => args.find((a) => a !== undefined && a !== null && a !== '') ,
  }
}

/** 构造表达式作用域内的辅助对象与访问器 */
function buildHelpers(scope: ExpressionScope) {
  const params = scope.params ?? {}
  const point = scope.point ?? {}
  const elements = scope.elements ?? []
  const obj = scope.obj ?? {}
  const urlSearch = scope.urlSearch ?? (typeof window !== 'undefined' ? window.location.search : '')

  const global = scope.global ?? {}
  const components = scope.components ?? {}

  const P = (key: string) => params[key]
  const V = (path: string) => getPath(point, path)
  const url = (name: string) => new URLSearchParams(urlSearch).get(name) ?? undefined
  // 当前 el() 递归深度（防止 extData 相互引用形成环）
  const elDepth = Number((scope.extra as Record<string, unknown> | undefined)?.__elDepth ?? 0)
  /**
   * 深度解析 el() 取到的值：若为字符串且含嵌套引用/表达式，则递归求值。
   *  - `{{ext:key}} / {{el:名:键}} / {{comp:...}} / {{global:...}}`：按 owner 元件解析引用
   *  - `${...}`：按当前作用域插值（递归深度 +1）
   * 例：el('全检-配置','extData.max') 的值为
   *     `${Number(el('1序-配置','extData.max')) + Number(el('2序-配置','extData.max'))}`
   *     → 递归求值得到数字，供 Number()/比较使用。
   */
  const resolveNested = (raw: unknown, owner: CanvasElement): unknown => {
    if (typeof raw !== 'string') return raw
    if (elDepth >= MAX_EL_DEPTH) return raw
    let s = raw
    if (s.includes('{{')) s = resolveExtDataReference(s, owner, elements)
    if (typeof s === 'string' && s.includes('${')) {
      const childScope: ExpressionScope = {
        ...scope,
        extra: { ...(scope.extra ?? {}), __elDepth: elDepth + 1 },
      }
      return interpolateExpression(s, childScope)
    }
    return s
  }
  const el = (selector: string, property?: string) => {
    const found = elements.find((e) => e.id === selector) ?? elements.find((e) => e.name === selector)
    if (!found) return undefined
    if (!property) return found
    // 兼容冒号写法（如 extData:max / ext:max），统一转为点路径
    const path = property.replace(/:/g, '.')
    // text/value：优先取组件快照（含数据绑定解析后的结果），
    // 元件上的 text 只是静态回退值，绑定值不在其上。
    // 两者互相兜底：value 缺失时用 text（反之亦然），以兼容
    // 仅映射到 series_0 / 仅有 text 展示的接口绑定。
    if (path === 'text' || path === 'value') {
      const comps = components as Record<string, unknown>
      const snap = comps[selector] ?? comps[found.name ?? ''] ?? comps[found.id]
      if (snap) {
        const primary = getPath(snap, path)
        if (primary !== undefined && primary !== null && primary !== '') return resolveNested(primary, found)
        const alt = getPath(snap, path === 'value' ? 'text' : 'value')
        if (alt !== undefined && alt !== null && alt !== '') return resolveNested(alt, found)
      }
    }
    // 其它路径（尤其是 extData.*）：值可能是嵌套表达式，递归求值后返回
    return resolveNested(getPath(found, path), found)
  }
  /** 取全局上下文值（点路径），如 G('components.温度计.value') */
  const G = (path: string) => (path ? getPath(global, path) : global)
  /** 取组件快照（名称或 id）；prop 可选，如 C('温度计', 'value') / C('温度计', 'ext.unit') */
  const C = (selector: string, prop?: string) => {
    const snap = (components as Record<string, unknown>)[selector]
    if (snap === undefined) return undefined
    return prop ? getPath(snap, prop) : snap
  }

  return {
    params, point, obj, global, components, P, V, url, el, G, C,
    ctx: { scadaCode: scope.scadaCode ?? '' },
    ...buildTimeApi(),
    ...buildUtilApi(),
    ...(scope.extra ?? {}),
  }
}

/** 编译自定义函数：注入内置作用域（time/util 与 params），失败则跳过该函数 */
function buildCustomFunctions(defs: CustomFunctionDef[] | undefined, base: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!defs?.length) return out
  const baseNames = Object.keys(base)
  const baseValues = baseNames.map((n) => base[n])
  for (const def of defs) {
    if (!def.name || !/^[A-Za-z_$][\w$]*$/.test(def.name)) continue
    try {
      // 自定义函数体可访问基础作用域（时间/工具/params）与自身形参
      // eslint-disable-next-line no-new-func
      const factory = new Function(...baseNames, `return function(${(def.args ?? []).join(',')}){${def.body ?? ''}}`)
      out[def.name] = factory(...baseValues)
    } catch {
      out[def.name] = () => undefined
    }
  }
  return out
}

/**
 * 求值表达式，返回结果值。失败（语法或运行时错误）返回 undefined。
 * 空表达式返回 undefined。
 */
export function evaluateExpression(expression: string | undefined, scope: ExpressionScope): unknown {
  const src = (expression ?? '').trim()
  if (!src) return undefined
  const helpers = buildHelpers(scope)
  const customFns = buildCustomFunctions(scope.customFunctions, helpers)
  const merged: Record<string, unknown> = { ...helpers, ...customFns }
  const names = Object.keys(merged)
  const values = names.map((n) => merged[n])
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `"use strict"; return (${src});`)
    return fn(...values)
  } catch {
    // 表达式可能是语句体（含 return），退化为函数体再试一次
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(...names, `"use strict"; ${src}`)
      return fn(...values)
    } catch {
      return undefined
    }
  }
}

/**
 * 模板插值：把字符串中的 `${表达式}` 片段替换为求值结果。
 * - 整串恰好是单个 `${...}`：返回该表达式的原始类型值（数字/布尔/对象），不转字符串。
 * - 含普通文本或多个片段：逐段求值并拼成字符串。
 * - 不含 `${` 的普通字符串：原样返回。
 */
export function interpolateExpression(input: string, scope: ExpressionScope): unknown {
  if (!input.includes('${')) return input
  const single = input.match(/^\s*\$\{([\s\S]+)\}\s*$/)
  if (single) return evaluateExpression(single[1], scope)
  return input.replace(/\$\{([\s\S]+?)\}/g, (_m, expr: string) => {
    const v = evaluateExpression(expr, scope)
    return v === undefined || v === null ? '' : String(v)
  })
}

/** 将 GlobalParam 值按类型解析为运行时值 */
export function parseGlobalParamValue(type: 'string' | 'number' | 'boolean' | 'json', raw: string): unknown {
  if (type === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : undefined }
  if (type === 'boolean') return raw === 'true' || raw === '1'
  if (type === 'json') return parseBindingValue(raw)
  return raw
}

/** 将全局参数列表解析为运行时值映射（供接口参数解析使用） */
export function resolveGlobalParams(params: GlobalParam[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of params ?? []) {
    if (!p.key?.trim()) continue
    out[p.key] = parseGlobalParamValue(p.type, p.value ?? '')
  }
  return out
}

/** 表达式作用域内可用的补全项元数据（供 ExpressionInput 自动补全） */
export interface ExprCompletion {
  label: string
  detail: string
  type: 'function' | 'variable' | 'property'
}

/** 内置补全项（时间/工具/访问器），与 buildHelpers 保持同步 */
export const BUILTIN_EXPR_COMPLETIONS: ExprCompletion[] = [
  { label: 'params', detail: '全局参数对象（params.key）', type: 'variable' },
  { label: 'point', detail: '点位数据对象', type: 'variable' },
  { label: 'ctx', detail: 'SCADA 上下文（ctx.scadaCode）', type: 'variable' },
  { label: 'obj', detail: '组合对象上下文', type: 'variable' },
  { label: 'P(key)', detail: '取全局参数值', type: 'function' },
  { label: 'V(path)', detail: '取点位数据（点分隔路径）', type: 'function' },
  { label: 'el(name, prop?)', detail: '读组件属性值', type: 'function' },
  { label: 'global', detail: '全局上下文对象（与工作流一致）', type: 'variable' },
  { label: 'components', detail: '所有组件快照映射（名称/id）', type: 'variable' },
  { label: 'G(path)', detail: '取全局上下文值（点路径）', type: 'function' },
  { label: 'C(name, prop?)', detail: '取组件快照（value/params/ext/chart）', type: 'function' },
  { label: 'url(name)', detail: '取 URL query 参数', type: 'function' },
  { label: 'now(pattern?)', detail: "当前时间；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'nowMs()', detail: '当前毫秒时间戳', type: 'function' },
  { label: 'nowSec()', detail: '当前秒级时间戳', type: 'function' },
  { label: 'today(pattern?)', detail: "今天日期；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'yesterday(pattern?)', detail: "昨天日期；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'tomorrow(pattern?)', detail: '明天日期', type: 'function' },
  { label: 'formatDate(v, pattern?)', detail: "格式化时间值；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'toTimestamp(v)', detail: '解析为毫秒时间戳', type: 'function' },
  { label: 'toUnix(v)', detail: '解析为秒级时间戳', type: 'function' },
  { label: 'addDays(v, n, pattern?)', detail: '加 N 天', type: 'function' },
  { label: 'addHours(v, n, pattern?)', detail: '加 N 小时', type: 'function' },
  { label: 'addMinutes(v, n, pattern?)', detail: '加 N 分钟', type: 'function' },
  { label: 'addMonths(v, n, pattern?)', detail: '加 N 月', type: 'function' },
  { label: 'startOfDay(v?, pattern?)', detail: '当天开始 00:00:00', type: 'function' },
  { label: 'endOfDay(v?, pattern?)', detail: '当天结束 23:59:59', type: 'function' },
  { label: 'todayStart(pattern?)', detail: "今日开始 00:00:00；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'todayEnd(pattern?)', detail: "今日结束 23:59:59；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'yesterdayStart(pattern?)', detail: "昨日开始；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'yesterdayEnd(pattern?)', detail: "昨日结束；传 'x'/'X' 得时间戳", type: 'function' },
  { label: 'todayStartMs()', detail: '今日开始毫秒时间戳', type: 'function' },
  { label: 'todayEndMs()', detail: '今日结束毫秒时间戳', type: 'function' },
  { label: 'yesterdayStartMs()', detail: '昨日开始毫秒时间戳', type: 'function' },
  { label: 'yesterdayEndMs()', detail: '昨日结束毫秒时间戳', type: 'function' },
  { label: 'todayStartSec()', detail: '今日开始秒级时间戳', type: 'function' },
  { label: 'todayEndSec()', detail: '今日结束秒级时间戳', type: 'function' },
  { label: 'yesterdayStartSec()', detail: '昨日开始秒级时间戳', type: 'function' },
  { label: 'yesterdayEndSec()', detail: '昨日结束秒级时间戳', type: 'function' },
  { label: 'diffMs(a, b)', detail: '时间差(ms)', type: 'function' },
  { label: 'pad(v, len, ch?)', detail: '左填充', type: 'function' },
  { label: 'round(n, digits?)', detail: '四舍五入', type: 'function' },
  { label: 'num(v, fallback?)', detail: '转数字', type: 'function' },
  { label: 'int(v, fallback?)', detail: '转整数', type: 'function' },
  { label: 'str(v)', detail: '转字符串', type: 'function' },
  { label: 'bool(v)', detail: '转布尔', type: 'function' },
  { label: 'upper(v)', detail: '转大写', type: 'function' },
  { label: 'lower(v)', detail: '转小写', type: 'function' },
  { label: 'trim(v)', detail: '去空白', type: 'function' },
  { label: 'json(v)', detail: 'JSON 序列化', type: 'function' },
  { label: 'coalesce(...args)', detail: '取首个非空', type: 'function' },
]
