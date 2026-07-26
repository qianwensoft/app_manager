/**
 * ValueSrc 表达式解析。
 *
 * 支持前缀：
 *   $point.<key>       → pointData（含运行时绑定覆盖层），支持点路径
 *   $global.<path>     → 全局上下文
 *   $workflow.<path>   → 工作流上下文
 *   $node.<id>.<path>  → DAG 上游节点产出
 *   $event 或 $event.x → 触发事件载荷
 *   其他               → 字面量（数字/true/false/null/JSON 自动归一）
 */
import type { ValueSrc } from '@/types/workflow'
import type { WorkflowContext } from './types'
import { getPath, parseBindingValue } from '@/runtime/bindingData'

/** 点路径取值，如 data.employee.name（复用 bindingData.getPath 的方括号/点混合语义） */
export function resolveNestedField(obj: unknown, path: string): unknown {
  if (!path) return obj
  return getPath(obj, path)
}

/** 把字面量归一为 number/boolean/null/对象/字符串 */
function coerceLiteral(s: string): unknown {
  const t = s.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  if (t === 'undefined') return undefined
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t)) return Number(t)
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    const parsed = parseBindingValue(t)
    if (parsed !== undefined) return parsed
  }
  return s
}

/** 解析值来源表达式 */
export function resolveSrc(src: ValueSrc | undefined, ctx: WorkflowContext): unknown {
  if (src === undefined || src === null) return undefined
  const s = String(src)
  if (s === '$event') return ctx.event
  if (s.startsWith('$event.')) return resolveNestedField(ctx.event, s.slice(7))
  if (s.startsWith('$point.')) return resolveNestedField(ctx.point, s.slice(7))
  if (s.startsWith('$global.')) return resolveNestedField(ctx.global, s.slice(8))
  if (s.startsWith('$workflow.')) return resolveNestedField(ctx.workflow, s.slice(10))
  if (s.startsWith('$node.')) return resolveNestedField(ctx.nodeOutputs, s.slice(6))
  return coerceLiteral(s)
}
