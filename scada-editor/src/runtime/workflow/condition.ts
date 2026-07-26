/**
 * ConditionExpr 求值：复用 form-app 的 operator 语义（eq/neq/in/gt/lt/empty/not_empty）。
 */
import type { ConditionExpr } from '@/types/workflow'
import type { WorkflowContext } from './types'
import { resolveSrc } from './resolveSrc'

/** 触发条件判定；无条件（未配 left_src）视为 true */
export function evalCondition(cond: ConditionExpr | undefined, ctx: WorkflowContext): boolean {
  if (!cond || !cond.left_src) return true
  const raw = resolveSrc(cond.left_src, ctx)
  const val = cond.value
  switch (cond.operator) {
    case 'not_empty': return raw !== undefined && raw !== null && String(raw).trim() !== ''
    case 'empty':     return raw === undefined || raw === null || String(raw).trim() === ''
    case 'eq':        return String(raw) === String(val)
    case 'neq':       return String(raw) !== String(val)
    case 'in': {
      const list = String(val ?? '').split(',').map((x) => x.trim())
      return list.includes(String(raw))
    }
    case 'gt': return Number(raw) > Number(val)
    case 'lt': return Number(raw) < Number(val)
    default:   return true
  }
}
