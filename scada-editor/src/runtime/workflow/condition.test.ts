import { describe, it, expect } from 'vitest'
import { evalCondition } from './condition'
import type { WorkflowContext } from './types'
import type { ConditionExpr } from '@/types/workflow'

function ctx(over: Partial<WorkflowContext> = {}): WorkflowContext {
  return { event: undefined, point: {}, global: {}, workflow: {}, nodeOutputs: {}, ...over }
}

const c = (left_src: string, operator: ConditionExpr['operator'], value?: string): ConditionExpr =>
  ({ left_src, operator, value })

describe('evalCondition', () => {
  it('treats missing condition / empty left_src as true', () => {
    expect(evalCondition(undefined, ctx())).toBe(true)
    expect(evalCondition(c('', 'eq', '1'), ctx())).toBe(true)
  })

  it('eq / neq compare as strings', () => {
    const base = ctx({ point: { v: 5 } })
    expect(evalCondition(c('$point.v', 'eq', '5'), base)).toBe(true)
    expect(evalCondition(c('$point.v', 'eq', '6'), base)).toBe(false)
    expect(evalCondition(c('$point.v', 'neq', '6'), base)).toBe(true)
  })

  it('gt / lt compare numerically', () => {
    const base = ctx({ point: { v: 80 } })
    expect(evalCondition(c('$point.v', 'gt', '50'), base)).toBe(true)
    expect(evalCondition(c('$point.v', 'gt', '90'), base)).toBe(false)
    expect(evalCondition(c('$point.v', 'lt', '90'), base)).toBe(true)
  })

  it('in checks comma list membership', () => {
    const base = ctx({ point: { s: 'b' } })
    expect(evalCondition(c('$point.s', 'in', 'a, b, c'), base)).toBe(true)
    expect(evalCondition(c('$point.s', 'in', 'x, y'), base)).toBe(false)
  })

  it('empty / not_empty', () => {
    expect(evalCondition(c('$point.x', 'empty'), ctx({ point: {} }))).toBe(true)
    expect(evalCondition(c('$point.x', 'empty'), ctx({ point: { x: ' ' } }))).toBe(true)
    expect(evalCondition(c('$point.x', 'not_empty'), ctx({ point: { x: 'v' } }))).toBe(true)
    expect(evalCondition(c('$point.x', 'not_empty'), ctx({ point: { x: '' } }))).toBe(false)
  })
})
