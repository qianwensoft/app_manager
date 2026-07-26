import { describe, it, expect } from 'vitest'
import { createElementScope } from './elementScope'
import type { CanvasElement } from '@/types'

function el(id: string, over: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id, type: 'text', name: id, x: 0, y: 0, width: 10, height: 10,
    rotation: 0, visible: true, locked: false, zIndex: 0, ...over,
  }
}

/** 收集 applyProp 调用 + 维护一份可变元素表 */
function harness(initial: CanvasElement[]) {
  const map = new Map(initial.map((e) => [e.id, structuredClone(e)]))
  const calls: { id: string; updates: Partial<CanvasElement> }[] = []
  const overrides: Record<string, unknown> = {}
  const scope = createElementScope({
    getElements: () => Array.from(map.values()),
    applyProp: (id, updates) => {
      calls.push({ id, updates })
      const cur = map.get(id)
      if (cur) Object.assign(cur, updates)
    },
    writePointOverride: (k, v) => { overrides[k] = v },
  })
  return { scope, calls, overrides, map }
}

describe('elementScope.resolve', () => {
  it('by id matches exact', () => {
    const { scope } = harness([el('a'), el('b')])
    const r = scope.resolve({ by: 'id', ref: 'a' })
    expect(r.map((e) => e.id)).toEqual(['a'])
  })

  it('by id matches template instances by base id', () => {
    const { scope } = harness([el('g1:k1:child'), el('g1:k2:child'), el('other')])
    const r = scope.resolve({ by: 'id', ref: 'child' })
    expect(r.map((e) => e.id).sort()).toEqual(['g1:k1:child', 'g1:k2:child'])
  })

  it('by id + instanceKey narrows to one instance', () => {
    const { scope } = harness([el('g1:k1:child'), el('g1:k2:child')])
    const r = scope.resolve({ by: 'id', ref: 'child', instanceKey: 'k2' })
    expect(r.map((e) => e.id)).toEqual(['g1:k2:child'])
  })

  it('by name matches element name', () => {
    const { scope } = harness([el('a', { name: 'gauge' }), el('b', { name: 'label' })])
    const r = scope.resolve({ by: 'name', ref: 'gauge' })
    expect(r.map((e) => e.id)).toEqual(['a'])
  })

  it('by name-path matches group.child', () => {
    const grp = el('grp', { type: 'group', name: '仪表组', children: ['a'] })
    const child = el('a', { name: '温度' })
    const { scope } = harness([grp, child])
    const r = scope.resolve({ by: 'name', ref: '仪表组.温度' })
    expect(r.map((e) => e.id)).toEqual(['a'])
  })
})

describe('elementScope.setProp / getProp', () => {
  it('sets top-level prop', () => {
    const { scope, map } = harness([el('a', { text: 'old' })])
    scope.setProp({ by: 'id', ref: 'a' }, 'text', 'new')
    expect(map.get('a')!.text).toBe('new')
  })

  it('sets nested prop via clone', () => {
    const { scope, map } = harness([el('a', { properties: { color: 'red' } } as Partial<CanvasElement>)])
    scope.setProp({ by: 'id', ref: 'a' }, 'properties.color', 'blue')
    expect((map.get('a') as unknown as Record<string, unknown>).properties).toEqual({ color: 'blue' })
  })

  it('getProp reads via path', () => {
    const { scope } = harness([el('a', { text: 'hi' })])
    expect(scope.getProp({ by: 'id', ref: 'a' }, 'text')).toBe('hi')
  })

  it('applies to all matched instances', () => {
    const { scope, map } = harness([el('g1:k1:c'), el('g1:k2:c')])
    scope.setProp({ by: 'id', ref: 'c' }, 'text', 'X')
    expect(map.get('g1:k1:c')!.text).toBe('X')
    expect(map.get('g1:k2:c')!.text).toBe('X')
  })
})

describe('elementScope.setBinding', () => {
  it('interface mode writes __ifx_<id>__value override', () => {
    const { scope, overrides } = harness([el('a', { pointBinding: { mode: 'interface' } } as Partial<CanvasElement>)])
    scope.setBinding({ by: 'id', ref: 'a' }, 123)
    expect(overrides['__ifx_a__value']).toBe(123)
  })

  it('point mode writes binding key override', () => {
    const { scope, overrides } = harness([el('a', { pointBinding: { mode: 'point', pointKey: 'temp' } } as Partial<CanvasElement>)])
    scope.setBinding({ by: 'id', ref: 'a' }, 55)
    expect(overrides['temp']).toBe(55)
  })
})
