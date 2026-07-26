import { describe, it, expect } from 'vitest'
import {
  parseBindingValue,
  getPath,
  toNumber,
  flattenBindingValue,
  resolveTemplateValue,
  ifaceKeyPrefix,
  readIfaceField,
  IFACE_GLOBAL_PREFIX,
} from './bindingData'
import type { PointDataMap } from '@/hooks/useStompPointData'

describe('parseBindingValue', () => {
  it('keeps native primitives', () => {
    expect(parseBindingValue(42)).toBe(42)
    expect(parseBindingValue(true)).toBe(true)
    expect(parseBindingValue(null)).toBe(null)
  })

  it('parses numeric strings to numbers', () => {
    expect(parseBindingValue('42')).toBe(42)
    expect(parseBindingValue('-3.5')).toBe(-3.5)
    expect(parseBindingValue('1e3')).toBe(1000)
  })

  it('parses JSON arrays and objects', () => {
    expect(parseBindingValue('[42,68,35]')).toEqual([42, 68, 35])
    expect(parseBindingValue('{"a":1}')).toEqual({ a: 1 })
  })

  it('preserves non-numeric strings', () => {
    expect(parseBindingValue('running')).toBe('running')
  })

  it('returns undefined for malformed JSON that enters the parse branch', () => {
    // starts with [ / { and ends with ] / } → treated as JSON, fails to parse
    expect(parseBindingValue('[1,2,]')).toBeUndefined()
    expect(parseBindingValue('{"a":}')).toBeUndefined()
  })

  it('keeps bracket-like non-JSON strings as-is', () => {
    // does not both start and end with matching brackets → stays a string
    expect(parseBindingValue('[1,2,')).toBe('[1,2,')
  })

  it('parses booleans expressed as strings', () => {
    expect(parseBindingValue('true')).toBe(true)
    expect(parseBindingValue('false')).toBe(false)
  })
})

describe('getPath', () => {
  const src = { a: { b: [{ c: 7 }] }, name: 'x' }
  it('resolves nested dot paths', () => {
    expect(getPath(src, 'a.b[0].c')).toBe(7)
  })
  it('returns whole source for empty path', () => {
    expect(getPath(src, '')).toBe(src)
  })
  it('returns undefined for missing path', () => {
    expect(getPath(src, 'a.z.y')).toBeUndefined()
  })
})

describe('toNumber', () => {
  it('coerces and falls back', () => {
    expect(toNumber('5')).toBe(5)
    expect(toNumber('nope', 9)).toBe(9)
    expect(toNumber(undefined, 0)).toBe(0)
  })
})

describe('flattenBindingValue', () => {
  it('flattens arrays into indexed keys', () => {
    const out: PointDataMap = {}
    flattenBindingValue('__static_s', [10, 20], out)
    expect(out.__static_s).toEqual([10, 20])
    expect(out.__static_s_0).toBe(10)
    expect(out.__static_s_1).toBe(20)
  })
})

describe('resolveTemplateValue', () => {
  it('replaces placeholders and keeps unknowns literal', () => {
    expect(resolveTemplateValue('{{a}}-{{b}}', { a: 1, b: 'x' })).toBe('1-x')
    expect(resolveTemplateValue('{{missing}}', {})).toBe('{{missing}}')
  })
})

describe('interface key scoping', () => {
  it('scopes per element id and falls back to global', () => {
    expect(ifaceKeyPrefix('el1')).toBe('__ifx_el1__')
    expect(ifaceKeyPrefix()).toBe(IFACE_GLOBAL_PREFIX)
  })

  it('readIfaceField prefers scoped over global', () => {
    const data: PointDataMap = {
      __iface_value: 'global',
      __ifx_el1__value: 'scoped',
    }
    expect(readIfaceField(data, 'value', 'el1')).toBe('scoped')
    expect(readIfaceField(data, 'value', 'el2')).toBe('global')
    expect(readIfaceField(data, 'value')).toBe('global')
  })
})
