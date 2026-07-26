import { describe, it, expect } from 'vitest'
import { resolveSrc, resolveNestedField } from './resolveSrc'
import type { WorkflowContext } from './types'

function ctx(over: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    event: undefined,
    point: {},
    global: {},
    workflow: {},
    nodeOutputs: {},
    ...over,
  }
}

describe('resolveNestedField', () => {
  it('returns object itself when path empty', () => {
    const obj = { a: 1 }
    expect(resolveNestedField(obj, '')).toBe(obj)
  })
  it('reads dotted path', () => {
    expect(resolveNestedField({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7)
  })
  it('returns undefined for missing path', () => {
    expect(resolveNestedField({ a: 1 }, 'a.x.y')).toBeUndefined()
  })
})

describe('resolveSrc — prefixes', () => {
  it('$event returns whole event', () => {
    const e = { foo: 1 }
    expect(resolveSrc('$event', ctx({ event: e }))).toBe(e)
  })
  it('$event.path reads nested', () => {
    expect(resolveSrc('$event.foo.bar', ctx({ event: { foo: { bar: 'x' } } }))).toBe('x')
  })
  it('$point.<key> reads point data', () => {
    expect(resolveSrc('$point.temp', ctx({ point: { temp: 42 } }))).toBe(42)
  })
  it('$global.<path> reads global ctx', () => {
    expect(resolveSrc('$global.user.name', ctx({ global: { user: { name: 'kiro' } } }))).toBe('kiro')
  })
  it('$workflow.<path> reads workflow ctx', () => {
    expect(resolveSrc('$workflow.count', ctx({ workflow: { count: 3 } }))).toBe(3)
  })
  it('$node.<id>.<path> reads node outputs', () => {
    expect(resolveSrc('$node.n1.result', ctx({ nodeOutputs: { n1: { result: 9 } } }))).toBe(9)
  })
})

describe('resolveSrc — literals', () => {
  it('coerces numbers', () => {
    expect(resolveSrc('42', ctx())).toBe(42)
    expect(resolveSrc('-3.5', ctx())).toBe(-3.5)
  })
  it('coerces booleans and null', () => {
    expect(resolveSrc('true', ctx())).toBe(true)
    expect(resolveSrc('false', ctx())).toBe(false)
    expect(resolveSrc('null', ctx())).toBeNull()
  })
  it('parses JSON object/array literals', () => {
    expect(resolveSrc('{"a":1}', ctx())).toEqual({ a: 1 })
    expect(resolveSrc('[1,2,3]', ctx())).toEqual([1, 2, 3])
  })
  it('keeps plain strings as-is', () => {
    expect(resolveSrc('hello world', ctx())).toBe('hello world')
  })
  it('returns undefined for undefined/null src', () => {
    expect(resolveSrc(undefined, ctx())).toBeUndefined()
  })
})
