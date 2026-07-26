import { describe, it, expect } from 'vitest'
import { resolveInterfaceParams } from './interfaceParams'
import type { InterfaceParamContext } from './interfaceParams'
import type { CanvasElement, PointBinding, ParamSpec } from '@/types'

const ctx = (over: Partial<InterfaceParamContext> = {}): InterfaceParamContext => ({
  scadaCode: 'S1',
  pointData: {},
  elements: [],
  urlSearch: '',
  ...over,
})

describe('resolveInterfaceParams', () => {
  it('resolves constant source and coerces to spec type', () => {
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamBindings: { limit: { source: 'constant', value: '10' } },
    }
    const specs: ParamSpec[] = [{ name: 'limit', type: 'integer', required: false }]
    expect(resolveInterfaceParams(binding, specs, ctx())).toEqual({ limit: 10 })
  })

  it('reads url query params', () => {
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamBindings: { id: { source: 'url', path: 'deviceId' } },
    }
    const out = resolveInterfaceParams(binding, [], ctx({ urlSearch: '?deviceId=abc' }))
    expect(out).toEqual({ id: 'abc' })
  })

  it('reads point data path', () => {
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamBindings: { t: { source: 'point', path: 'temp' } },
    }
    const out = resolveInterfaceParams(binding, [], ctx({ pointData: { temp: 25 } }))
    expect(out).toEqual({ t: 25 })
  })

  it('reads object context path (group instance)', () => {
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamBindings: { n: { source: 'object', path: 'item.name' } },
    }
    const out = resolveInterfaceParams(binding, [], ctx({ objectContext: { item: { name: 'pump-1' } } }))
    expect(out).toEqual({ n: 'pump-1' })
  })

  it('reads another element property value', () => {
    const el: CanvasElement = {
      id: 'sel1', type: 'text', name: 't', x: 0, y: 0, width: 1, height: 1,
      rotation: 0, visible: true, locked: false, zIndex: 0, text: 'chosen',
    }
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamBindings: { v: { source: 'element', elementId: 'sel1', property: 'text' } },
    }
    const out = resolveInterfaceParams(binding, [], ctx({ elements: [el] }))
    expect(out).toEqual({ v: 'chosen' })
  })

  it('applies spec default when value missing', () => {
    const binding: PointBinding = { mode: 'interface' }
    const specs: ParamSpec[] = [{ name: 'page', type: 'integer', required: false, default: 1 }]
    expect(resolveInterfaceParams(binding, specs, ctx())).toEqual({ page: 1 })
  })

  it('supports legacy ifaceParamValues fallback', () => {
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamValues: { status: 'on' },
    }
    expect(resolveInterfaceParams(binding, [], ctx())).toEqual({ status: 'on' })
  })

  it('drops empty-string and undefined results', () => {
    const binding: PointBinding = {
      mode: 'interface',
      ifaceParamBindings: { a: { source: 'constant', value: '' } },
    }
    expect(resolveInterfaceParams(binding, [], ctx())).toEqual({})
  })
})
