import type { CanvasElement, PointBinding } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { applyFormatter } from '@/hooks/useInterfaceBindingData'
import { IFACE_GLOBAL_PREFIX, readIfaceField, resolveTemplateValue, resolveExtDataReference, toNumber } from './bindingData'
import { formatDate, formatDateTimeValue } from './dateTimeFormat'
import { evaluateExpression, interpolateExpression, type ExpressionScope } from './expression'

/**
 * 转换表达式作用域：变量 v 为原始值，并注入完整表达式作用域
 * （全局参数 params/P、点位 point/V、组件 el、时间/工具函数、自定义函数）。
 * 优先按 `return (transform)` 求值；失败退化为仅 v 可用（向后兼容旧写法）。
 */
function applyTransform(raw: number, transform?: string, scope?: ExpressionScope): number {
  if (!transform) return raw
  if (scope) {
    const out = evaluateExpression(transform, { ...scope, extra: { v: raw } })
    const n = Number(out)
    if (Number.isFinite(n)) return n
  }
  try {
    // eslint-disable-next-line no-new-func
    return Number(new Function('v', `return (${transform})`)(raw))
  } catch {
    return raw
  }
}

/** 各绑定模式用于查找 pointData 的主键 */
export function bindingDataKey(binding?: PointBinding): string {
  if (!binding) return ''
  const mode = binding.mode ?? 'point'
  switch (mode) {
    case 'simulation':
      return binding.simLinkName ?? ''
    case 'static':
      return '__static_value'
    case 'interface':
      return '__iface_value'
    case 'trend':
      return binding.trendKeys?.[0] ?? ''
    case 'point':
    default:
      return binding.pointKey ?? binding.linkName ?? ''
  }
}

/** 解析绑定点位数值 v（动画/事件条件） */
export function resolveBindingNumericValue(el: CanvasElement, pointData: PointDataMap): number {
  const pb = el.pointBinding
  if (!pb) return 0
  const mode = pb.mode ?? 'point'

  switch (mode) {
    case 'static': {
      const sd = pb.staticData ?? {}
      const raw = sd.value ?? sd[pb.pointKey ?? 'value']
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
      return applyTransform(Number.isFinite(n) ? n : 0, pb.transform)
    }
    case 'simulation': {
      const key = pb.simLinkName
      if (!key) return 0
      return applyTransform(Number(pointData[key] ?? 0), pb.transform)
    }
    case 'interface': {
      const raw = readIfaceField(pointData, 'value', el.id) ?? readIfaceField(pointData, 'text', el.id)
      return applyTransform(Number(raw ?? 0), pb.transform)
    }
    case 'trend': {
      const key = pb.trendKeys?.[0]
      if (!key) return 0
      return applyTransform(Number(pointData[key] ?? 0), pb.transform)
    }
    case 'point':
    default: {
      const key = pb.pointKey ?? pb.linkName
      if (!key) return 0
      return applyTransform(Number(pointData[key] ?? 0), pb.transform)
    }
  }
}

/**
 * 解析模板字符串：
 *  - `{{field}}` 占位符：取接口返回字段/点位数据（原有行为）
 *  - `${表达式}`：求值表达式（函数/全局参数/组件值/时间函数等），需传入 scope
 */
function resolveTemplate(template: string, data: PointDataMap, elId?: string, scope?: ExpressionScope): string {
  // 全局键（STOMP 推送）先铺底，元件专属键后覆盖，保证复制元件各用各的接口数据
  const globalValues = Object.entries(data)
    .filter(([key]) => key.startsWith(IFACE_GLOBAL_PREFIX))
    .map(([key, value]) => [key.slice(IFACE_GLOBAL_PREFIX.length), value] as const)

  const scopedPrefix = elId ? `__ifx_${elId}__` : ''
  const scopedValues = scopedPrefix
    ? Object.entries(data)
        .filter(([key]) => key.startsWith(scopedPrefix))
        .map(([key, value]) => [key.slice(scopedPrefix.length), value] as const)
    : []

  const interfaceValues = Object.fromEntries([...globalValues, ...scopedValues])
  const filled = resolveTemplateValue(template, { ...data, ...interfaceValues })
  if (scope && filled.includes('${')) {
    const out = interpolateExpression(filled, scope)
    return out === undefined || out === null ? '' : String(out)
  }
  return filled
}

/** 提取绑定的原始值（未经数字格式化），供日期时间解析使用 */
function resolveRawBoundValue(el: CanvasElement, pointData: PointDataMap): unknown {
  const binding = el.pointBinding
  if (!binding) return undefined
  switch (binding.mode ?? 'point') {
    case 'static':
      return (binding.staticData ?? {}).value ?? (binding.staticData ?? {})[binding.pointKey ?? '']
    case 'simulation':
      return binding.simLinkName ? pointData[binding.simLinkName] : undefined
    case 'interface':
      return readIfaceField(pointData, 'value', el.id) ?? readIfaceField(pointData, 'text', el.id)
    case 'trend':
      return binding.trendKeys?.[0] ? pointData[binding.trendKeys[0]] : undefined
    case 'point':
    default: {
      const key = binding.pointKey ?? binding.linkName
      return key ? pointData[key] : undefined
    }
  }
}

/**
 * 解析元件「内容」文本（text/button 静态内容或绑定结果）为最终展示字符串。
 *
 * 处理顺序：
 *  1. 取原始文本：有 pointBinding 走 resolveElementDisplayValue（含模板/格式化），
 *     否则用 el.text。
 *  2. 解析扩展数据引用：{{ext:key}} / {{el:名:键}} / {{comp:名:路径}} / {{global:路径}}。
 *  3. 若仍含 `${...}` 表达式，且提供了 scope，则做表达式插值（可用 el()/C()/G()/P()/V()、
 *     Number()、算术运算、时间/工具函数等）。这样纯文本「内容」框也能直接写表达式，
 *     无需切到接口模式的「文本模板」。
 */
export function resolveElementText(
  el: CanvasElement,
  pointData: PointDataMap,
  allElements: CanvasElement[],
  scope?: ExpressionScope,
): string {
  // 内容框显式表达式优先：当 el.text 写了 ${...} 时，它是作者意图的最终内容，
  // 绑定/接口数据仅作为作用域供表达式取用（el()/V()/components 等）。
  // 否则（无内容表达式）才用绑定解析值（接口字段映射/文本模板/日期时间/点位）。
  // 修复：元件同时配置了接口绑定与内容表达式时，绑定的单值会在数据到达后
  // 覆盖掉表达式结果（表现为“刚开始显示总和，接着仅显示一个数字”）。
  const hasContentExpr = !!scope && typeof el.text === 'string' && el.text.includes('${')
  const raw = hasContentExpr
    ? el.text
    : (el.pointBinding || el.dateTime?.enabled)
      ? resolveElementDisplayValue(el, pointData, scope)
      : el.text
  const referenced = resolveExtDataReference(raw ?? '', el, allElements)
  if (scope && referenced.includes('${')) {
    const out = interpolateExpression(referenced, scope)
    return out === undefined || out === null ? '' : String(out)
  }
  return referenced
}

/** 解析元件显示文本（text/button 等） */
export function resolveElementDisplayValue(el: CanvasElement, pointData: PointDataMap, scope?: ExpressionScope): string | undefined {
  // 日期时间显示：优先于普通绑定解析
  const dt = el.dateTime
  if (dt?.enabled) {
    // 当前系统时间：无需绑定数据
    if ((dt.source ?? 'current') === 'current') {
      return formatDate(new Date(), dt.format)
    }
    // 数据来源：解析绑定值为时间（自动兼容时间戳/字符串）
    const raw = resolveRawBoundValue(el, pointData)
    if (raw === undefined || raw === null || raw === '') return el.text
    return formatDateTimeValue(raw, dt) ?? el.text
  }

  const binding = el.pointBinding
  if (!binding) return el.text

  const fmt = binding.formatter

  switch (binding.mode ?? 'point') {
    case 'static': {
      const v = (binding.staticData ?? {}).value ?? (binding.staticData ?? {})[binding.pointKey ?? '']
      if (v === undefined) return el.text
      return applyFormatter(typeof v === 'number' ? v : String(v), fmt)
    }
    case 'simulation': {
      const key = binding.simLinkName
      if (!key) return el.text
      const raw = pointData[key]
      if (raw === undefined) return el.text
      return applyFormatter(applyTransform(toNumber(raw), binding.transform, scope), fmt)
    }
    case 'interface': {
      // 文本组件：优先使用模板
      if (el.type === 'text' && binding.textTemplate) {
        return resolveTemplate(binding.textTemplate, pointData, el.id, scope)
      }
      // 否则使用字段映射
      const mapped = readIfaceField(pointData, 'value', el.id) ?? readIfaceField(pointData, 'text', el.id)
      if (mapped === undefined) return el.text
      return applyFormatter(typeof mapped === 'number' ? mapped : String(mapped), fmt)
    }
    case 'trend': {
      const key = binding.trendKeys?.[0]
      if (!key) return el.text
      const raw = pointData[key]
      if (raw === undefined) return el.text
      return applyFormatter(applyTransform(toNumber(raw), binding.transform, scope), fmt)
    }
    case 'point':
    default: {
      const key = binding.pointKey ?? binding.linkName
      if (!key) return el.text
      const raw = pointData[key]
      if (raw === undefined) return el.text
      return applyFormatter(applyTransform(toNumber(raw), binding.transform, scope), fmt)
    }
  }
}
