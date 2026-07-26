import { describe, it, expect } from 'vitest'
import { applyFormatter } from '@/hooks/useInterfaceBindingData'
import { resolveElementDisplayValue, resolveBindingNumericValue } from './bindingResolver'
import type { CanvasElement, PointBinding } from '@/types'

function textEl(id: string, binding?: PointBinding, over: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id, type: 'text', name: id, x: 0, y: 0, width: 10, height: 10,
    rotation: 0, visible: true, locked: false, zIndex: 0, text: 'fallback',
    pointBinding: binding, ...over,
  }
}

describe('applyFormatter', () => {
  it('formats number precision, prefix, unit', () => {
    expect(applyFormatter(3.14159, { precision: 2, unit: '℃' })).toBe('3.14 ℃')
    expect(applyFormatter(5, { prefix: '约' })).toBe('约5')
  })
  it('maps ranges to labels', () => {
    const fmt = { rangeMap: [{ min: 0, max: 10, label: '低' }, { min: 11, max: 100, label: '高' }] }
    expect(applyFormatter(5, fmt)).toBe('低')
    expect(applyFormatter(50, fmt)).toBe('高')
  })
  it('applies template over prefix/unit', () => {
    expect(applyFormatter(7, { template: '${v} 分' })).toBe('7 分')
  })
  it('does string replacement', () => {
    expect(applyFormatter('on', { strReplace: [{ from: 'on', to: '开' }] })).toBe('开')
  })
})

describe('interface per-element scoping (copy-bug regression)', () => {
  const binding: PointBinding = { mode: 'interface' }

  it('two elements read their own scoped iface value, not a shared one', () => {
    const a = textEl('elA', binding)
    const b = textEl('elB', binding)
    const data = { __ifx_elA__value: 11, __ifx_elB__value: 22 }
    expect(resolveElementDisplayValue(a, data)).toBe('11')
    expect(resolveElementDisplayValue(b, data)).toBe('22')
  })

  it('falls back to global iface key (STOMP push) when no scoped key', () => {
    const a = textEl('elA', binding)
    expect(resolveElementDisplayValue(a, { __iface_value: 99 })).toBe('99')
  })

  it('scoped value wins over global for the same element', () => {
    const a = textEl('elA', binding)
    const data = { __iface_value: 1, __ifx_elA__value: 2 }
    expect(resolveElementDisplayValue(a, data)).toBe('2')
  })

  it('numeric resolver is also element-scoped', () => {
    const a = textEl('elA', binding)
    const b = textEl('elB', binding)
    const data = { __ifx_elA__value: 3, __ifx_elB__value: 8 }
    expect(resolveBindingNumericValue(a, data)).toBe(3)
    expect(resolveBindingNumericValue(b, data)).toBe(8)
  })
})

describe('interface text template scoping', () => {
  it('resolves {{field}} from element-scoped keys', () => {
    const binding: PointBinding = { mode: 'interface', textTemplate: '{{name}}:{{status}}' }
    const el = textEl('elA', binding)
    const data = { __ifx_elA__name: 'pump', __ifx_elA__status: 'run' }
    expect(resolveElementDisplayValue(el, data)).toBe('pump:run')
  })

  it('two copies with different params render distinctly', () => {
    const binding: PointBinding = { mode: 'interface', textTemplate: 'v={{v}}' }
    const a = textEl('elA', binding)
    const b = textEl('elB', binding)
    const data = { __ifx_elA__v: 100, __ifx_elB__v: 200 }
    expect(resolveElementDisplayValue(a, data)).toBe('v=100')
    expect(resolveElementDisplayValue(b, data)).toBe('v=200')
  })
})

describe('static and point display', () => {
  it('renders static value with formatter', () => {
    const binding: PointBinding = { mode: 'static', staticData: { value: 42 }, formatter: { unit: '%' } }
    expect(resolveElementDisplayValue(textEl('e', binding), {})).toBe('42 %')
  })
  it('renders point value from pointData key', () => {
    const binding: PointBinding = { mode: 'point', pointKey: 'p1' }
    expect(resolveElementDisplayValue(textEl('e', binding), { p1: 7 })).toBe('7')
  })
  it('falls back to element text when point missing', () => {
    const binding: PointBinding = { mode: 'point', pointKey: 'missing' }
    expect(resolveElementDisplayValue(textEl('e', binding), {})).toBe('fallback')
  })
})
