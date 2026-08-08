import { describe, it, expect } from 'vitest'
import { resolveInterfaceParams } from '@/runtime/interfaceParams'

describe('expr arithmetic', () => {
  it('evaluates todayEndMs()-1000*60*60*8 via expression source', () => {
    const out = resolveInterfaceParams(
      { mode: 'interface', ifaceParamBindings: { start: { source: 'expression', expression: 'todayEndMs()-1000*60*60*8' } } } as any,
      [{ name: 'start', type: 'number', required: false }],
      { scadaCode: 'S1', pointData: {}, elements: [], urlSearch: '' } as any,
    )
    const d = new Date(); d.setHours(23, 59, 59, 999)
    expect(out.start).toBe(d.getTime() - 1000 * 60 * 60 * 8)
  })
  it('evaluates via constant ${...} interpolation', () => {
    const out = resolveInterfaceParams(
      { mode: 'interface', ifaceParamBindings: { start: { source: 'constant', value: '${todayEndMs()-1000*60*60*8}' } } } as any,
      [{ name: 'start', type: 'number', required: false }],
      { scadaCode: 'S1', pointData: {}, elements: [], urlSearch: '' } as any,
    )
    const d = new Date(); d.setHours(23, 59, 59, 999)
    expect(out.start).toBe(d.getTime() - 1000 * 60 * 60 * 8)
  })
})
