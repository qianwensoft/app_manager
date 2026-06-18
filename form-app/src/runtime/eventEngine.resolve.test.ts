import { describe, it, expect } from 'vitest'
import { resolveSrc, resolveNestedField, evalCondition, passScanFilter } from './eventEngine'
import type { EventContext } from './eventTypes'

const ctx: EventContext = {
  scan: 'CODE123',
  form: { qty: 5, nested: { a: { b: 7 } } },
  app: { token: 'abc', user: { name: 'kim' } },
  event: { payload: 'hi' },
}

describe('resolveSrc', () => {
  it('$scan → 触发值', () => expect(resolveSrc('$scan', ctx)).toBe('CODE123'))
  it('$form.x → 页面值', () => expect(resolveSrc('$form.qty', ctx)).toBe(5))
  it('$form 深路径', () => expect(resolveSrc('$form.nested.a.b', ctx)).toBe(7))
  it('$app.x → 应用级状态', () => expect(resolveSrc('$app.token', ctx)).toBe('abc'))
  it('$app 深路径', () => expect(resolveSrc('$app.user.name', ctx)).toBe('kim'))
  it('$event.x → 事件载荷', () => expect(resolveSrc('$event.payload', ctx)).toBe('hi'))
  it('字面量原样返回', () => expect(resolveSrc('literal', ctx)).toBe('literal'))
  it('undefined → undefined', () => expect(resolveSrc(undefined, ctx)).toBeUndefined())
  it('$app 缺失字段 → undefined', () => expect(resolveSrc('$app.nope', ctx)).toBeUndefined())
  it('无 app 快照时 $app 不抛错', () =>
    expect(resolveSrc('$app.x', { ...ctx, app: undefined })).toBeUndefined())
})

describe('resolveNestedField', () => {
  it('空路径返回原对象', () => expect(resolveNestedField({ a: 1 }, '')).toEqual({ a: 1 }))
  it('中途为 null 安全返回', () => expect(resolveNestedField({ a: null }, 'a.b')).toBeNull())
})

describe('evalCondition', () => {
  it('无条件视为通过', () => expect(evalCondition(undefined, ctx)).toBe(true))
  it('eq 命中', () => expect(evalCondition({ left_src: '$form.qty', operator: 'eq', value: '5' }, ctx)).toBe(true))
  it('not_empty', () => expect(evalCondition({ left_src: '$scan', operator: 'not_empty' }, ctx)).toBe(true))
  it('empty 对空串', () =>
    expect(evalCondition({ left_src: '$app.missing', operator: 'empty' }, ctx)).toBe(true))
  it('in 列表', () =>
    expect(evalCondition({ left_src: '$form.qty', operator: 'in', value: '3,5,7' }, ctx)).toBe(true))
  it('gt 数值', () => expect(evalCondition({ left_src: '$form.qty', operator: 'gt', value: '3' }, ctx)).toBe(true))
  it('基于 $app 的条件', () =>
    expect(evalCondition({ left_src: '$app.token', operator: 'eq', value: 'abc' }, ctx)).toBe(true))
})

describe('passScanFilter', () => {
  it('前缀过滤', () => expect(passScanFilter('ABCxyz', { prefix: 'ABC' })).toBe(true))
  it('前缀不匹配', () => expect(passScanFilter('xyz', { prefix: 'ABC' })).toBe(false))
  it('最小长度', () => expect(passScanFilter('ab', { min_length: 3 })).toBe(false))
  it('正则', () => expect(passScanFilter('123', { regex: '^\\d+$' })).toBe(true))
  it('非法正则不抛错（返回 false）', () => expect(passScanFilter('x', { regex: '(' })).toBe(false))
})
