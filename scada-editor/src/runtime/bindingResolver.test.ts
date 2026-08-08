import { describe, it, expect } from 'vitest'
import { applyFormatter } from '@/hooks/useInterfaceBindingData'
import { resolveElementDisplayValue, resolveBindingNumericValue, resolveElementText } from './bindingResolver'
import { buildComponentsSnapshot } from './workflow/componentsSnapshot'
import type { CanvasElement, PointBinding } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'

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

describe('resolveElementText — plain content field', () => {
  const cfg = (id: string, max: string) => textEl(id, undefined, { extData: { max } })

  it('evaluates ${...} arithmetic over other components via el() with extData', () => {
    const a = cfg('1序-配置', '10')
    const b = cfg('2序-配置', '15')
    const disp = textEl('disp', undefined, {
      text: "${Number(el('1序-配置','extData.max')) + Number(el('2序-配置','extData.max'))}",
    })
    const all = [a, b, disp]
    expect(resolveElementText(disp, {}, all, { elements: all })).toBe('25')
  })

  it('evaluates ${...} arithmetic with data-bound components (pointBinding mode:point)', () => {
    const binding = (key: string): PointBinding => ({ mode: 'point', pointKey: key })
    const a = textEl('a', binding('inv1'), { name: '库存-1序' })
    const b = textEl('b', binding('inv2'), { name: '库存-2序' })
    const pointData = { inv1: 10, inv2: 15 }
    // snapshot mirrors what CanvasBoard builds
    const components = buildComponentsSnapshot([a, b], pointData)
    const disp = textEl('disp', undefined, {
      text: "${Number(el('库存-1序','text')) + Number(el('库存-2序','text'))}",
    })
    const all = [a, b, disp]
    const scope = { elements: all, components }
    expect(resolveElementText(disp, pointData, all, scope)).toBe('25')
  })

  it('el(name,value) returns raw numeric value suitable for arithmetic', () => {
    const binding = (key: string): PointBinding => ({ mode: 'point', pointKey: key })
    const a = textEl('a', binding('inv1'), { name: '库存-1序' })
    const b = textEl('b', binding('inv2'), { name: '库存-2序' })
    const pointData = { inv1: 10, inv2: 15 }
    const components = buildComponentsSnapshot([a, b], pointData)
    const disp = textEl('disp', undefined, {
      text: "${Number(el('库存-1序','value')) + Number(el('库存-2序','value'))}",
    })
    const all = [a, b, disp]
    expect(resolveElementText(disp, pointData, all, { elements: all, components })).toBe('25')
  })

  it('mixes literal text with ${...} expression', () => {
    const a = cfg('1序-配置', '10')
    const disp = textEl('disp', undefined, { text: "合计=${Number(el('1序-配置','extData.max')) * 2}" })
    const all = [a, disp]
    expect(resolveElementText(disp, {}, all, { elements: all })).toBe('合计=20')
  })

  it('still resolves {{el:名:键}} reference shorthand', () => {
    const a = cfg('1序-配置', '10')
    const disp = textEl('disp', undefined, { text: '{{el:1序-配置:max}}' })
    const all = [a, disp]
    expect(resolveElementText(disp, {}, all, { elements: all })).toBe('10')
  })

  it('leaves ${...} untouched when no scope provided', () => {
    const disp = textEl('disp', undefined, { text: '${1+1}' })
    expect(resolveElementText(disp, {}, [disp])).toBe('${1+1}')
  })

  it('returns plain text unchanged', () => {
    const disp = textEl('disp', undefined, { text: 'hello' })
    expect(resolveElementText(disp, {}, [disp], { elements: [disp] })).toBe('hello')
  })

  it('content ${...} expression wins over element own interface binding value', () => {
    // 两个数据源组件：接口绑定，字段映射写入各自作用域键
    const binding = (): PointBinding => ({ mode: 'interface', ifaceFieldMappings: [{ sourceField: 'v', target: 'value' }] })
    const a = textEl('a', binding(), { name: '库存-1序' })
    const b = textEl('b', binding(), { name: '库存-2序' })
    // 展示组件：自身也配了接口绑定（数据写入 text），内容框写求和表达式
    const disp = textEl('disp', binding(), {
      text: "${Number(el('库存-1序','text')) + Number(el('库存-2序','text'))}",
    })
    const pointData: PointDataMap = {
      __ifx_a__value: 10,
      __ifx_b__value: 15,
      __ifx_disp__value: 15, // 展示组件自身接口返回的单值（此前会覆盖求和）
    }
    const all = [a, b, disp]
    const components = buildComponentsSnapshot(all, pointData)
    // 求和表达式必须胜出，而不是被自身绑定单值 15 覆盖
    expect(resolveElementText(disp, pointData, all, { elements: all, components })).toBe('25')
  })

  it('resolves current-time datetime element without pointBinding (live clock)', () => {
    const el = textEl('clock', undefined, {
      text: 'fallback',
      dateTime: { enabled: true, source: 'current', format: 'YYYY' },
    })
    const year = String(new Date().getFullYear())
    // must render the formatted current time, not the static fallback
    expect(resolveElementText(el, {}, [el], { elements: [el] })).toBe(year)
  })
})
