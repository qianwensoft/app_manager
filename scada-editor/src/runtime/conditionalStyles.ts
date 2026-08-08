/**
 * 条件样式解析器：根据表达式动态计算颜色。
 * 
 * 支持的表达式语法：
 * - 访问绑定值：v（当前元件绑定的数值）
 * - 访问文本值：text（当前元件显示的文本）
 * - 访问扩展数据：ext.key 或 ext['key']（本组件扩展数据）
 * - 访问其他组件：el('名称或ID', 'extData.key') 或 el('名称或ID').extData.key
 * - 表达式示例：
 *   - Number(v) > 100
 *   - Number(text) > Number(ext.max)
 *   - Number(text) > Number(el('阈值组件', 'extData.max'))
 *   - v >= ext.warning && v < ext.danger
 */

import type { CanvasElement, ConditionalColorRule, ConditionalStyles } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { evaluateExpression, type ExpressionScope } from './expression'
import { resolveExtDataReference } from './bindingData'
import { resolveElementText, resolveBindingNumericValue } from './bindingResolver'

/**
 * 构建条件表达式的作用域，包含：
 * - v: 绑定的数值
 * - text: 显示的文本值
 * - ext: 本组件扩展数据对象
 * - 完整的表达式作用域（el/params/point/时间函数等）
 */
function buildConditionalScope(
  el: CanvasElement,
  pointData: PointDataMap,
  baseScope: ExpressionScope
): ExpressionScope {
  // 获取绑定的数值
  const numericValue = resolveBindingNumericValue(el, pointData)
  
  // 获取显示的文本值：必须用 resolveElementText（会解析扩展数据引用并插值 ${...}），
  // 否则内容框写的 ${Number(el('库存-1序','text')) + ...} 会以原始串进入条件，
  // Number(text) 得到 NaN 使条件永不命中。
  const textValue = resolveElementText(el, pointData, baseScope.elements ?? [], baseScope)
  
  // 构建扩展数据对象（解析引用后）
  const ext: Record<string, unknown> = {}
  if (el.extData) {
    const allElements = baseScope.elements ?? []
    for (const [key, rawValue] of Object.entries(el.extData)) {
      // 解析扩展数据中的引用（{{ext:key}} 或 {{el:name:key}}）
      const resolved = resolveExtDataReference(rawValue, el, allElements)
      // 尝试转换为数字，失败则保持字符串
      const num = Number(resolved)
      ext[key] = Number.isFinite(num) ? num : resolved
    }
  }
  
  return {
    ...baseScope,
    extra: {
      ...(baseScope.extra ?? {}),
      v: numericValue,
      text: textValue,
      ext,
    },
  }
}

/**
 * 评估单条颜色规则，返回颜色值或 undefined
 */
function evaluateColorRule(
  rule: ConditionalColorRule,
  scope: ExpressionScope
): string | undefined {
  if (!rule.condition || !rule.color) return undefined
  
  try {
    const result = evaluateExpression(rule.condition, scope)
    // 条件结果为 truthy 时返回颜色
    return result ? rule.color : undefined
  } catch {
    return undefined
  }
}

/**
 * 解析元件的条件样式，返回应用的样式对象。
 * 规则按数组顺序评估，第一个匹配的规则生效。
 */
export function resolveConditionalStyles(
  el: CanvasElement,
  pointData: PointDataMap,
  baseScope: ExpressionScope
): {
  fontColor?: string
  fill?: string
  stroke?: string
  backgroundColor?: string
} {
  const styles: {
    fontColor?: string
    fill?: string
    stroke?: string
    backgroundColor?: string
  } = {}
  
  if (!el.conditionalStyles) return styles
  
  const scope = buildConditionalScope(el, pointData, baseScope)
  
  // 文本颜色
  if (el.conditionalStyles.fontColor) {
    for (const rule of el.conditionalStyles.fontColor) {
      const color = evaluateColorRule(rule, scope)
      if (color) {
        styles.fontColor = color
        break
      }
    }
  }
  
  // 填充色
  if (el.conditionalStyles.fill) {
    for (const rule of el.conditionalStyles.fill) {
      const color = evaluateColorRule(rule, scope)
      if (color) {
        styles.fill = color
        break
      }
    }
  }
  
  // 边框色
  if (el.conditionalStyles.stroke) {
    for (const rule of el.conditionalStyles.stroke) {
      const color = evaluateColorRule(rule, scope)
      if (color) {
        styles.stroke = color
        break
      }
    }
  }
  
  // 背景色
  if (el.conditionalStyles.backgroundColor) {
    for (const rule of el.conditionalStyles.backgroundColor) {
      const color = evaluateColorRule(rule, scope)
      if (color) {
        styles.backgroundColor = color
        break
      }
    }
  }
  
  return styles
}

/**
 * 快捷方法：仅解析文本颜色
 */
export function resolveFontColor(
  el: CanvasElement,
  pointData: PointDataMap,
  baseScope: ExpressionScope,
  defaultColor?: string
): string {
  const styles = resolveConditionalStyles(el, pointData, baseScope)
  return styles.fontColor ?? el.fontColor ?? defaultColor ?? '#ffffff'
}

/**
 * 快捷方法：仅解析填充色
 */
export function resolveFillColor(
  el: CanvasElement,
  pointData: PointDataMap,
  baseScope: ExpressionScope,
  defaultColor?: string
): string {
  const styles = resolveConditionalStyles(el, pointData, baseScope)
  return styles.fill ?? el.fill ?? defaultColor ?? 'transparent'
}

/**
 * 快捷方法：仅解析边框色
 */
export function resolveStrokeColor(
  el: CanvasElement,
  pointData: PointDataMap,
  baseScope: ExpressionScope,
  defaultColor?: string
): string {
  const styles = resolveConditionalStyles(el, pointData, baseScope)
  return styles.stroke ?? el.stroke ?? defaultColor ?? '#ffffff'
}
