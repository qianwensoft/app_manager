import { describe, it, expect } from 'vitest'
import { scanElementsForTemplateParams, scanTemplate, scanExpression } from './groupParamScan'
import type { CanvasElement } from '@/types'

function makeEl(partial: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'x', type: 'text', name: 'x',
    x: 0, y: 0, width: 100, height: 20,
    rotation: 0, visible: true, locked: false,
    zIndex: 0,
    ...partial,
  }
}

describe('scanElementsForTemplateParams', () => {
  it('从 text 中提取 item.xxx 参数', () => {
    const el = makeEl({ id: 't1', text: '设备 {{item.name}} 当前温度 {{item.temp}}℃' })
    const params = scanElementsForTemplateParams([el], 'item')
    expect(params).toHaveLength(2)
    const names = params.map((p) => p.name).sort()
    expect(names).toEqual(['name', 'temp'])
    expect(params.find((p) => p.name === 'name')?.usedIn).toContain('text')
  })

  it('从 textTemplate 中提取', () => {
    const el = makeEl({
      id: 't2', text: '',
      pointBinding: { mode: 'point', textTemplate: '{{item.status}} - {{item.level}}' },
    })
    const params = scanElementsForTemplateParams([el], 'item')
    expect(params).toHaveLength(2)
    expect(params.find((p) => p.name === 'level')?.usedIn).toContain('textTemplate')
  })

  it('从 ${...} 表达式中提取 item.xxx 引用', () => {
    const el = makeEl({
      id: 't3', text: '',
      pointBinding: { mode: 'point', transform: 'item.value * 2 + item.offset' },
    })
    const params = scanElementsForTemplateParams([el], 'item')
    expect(params).toHaveLength(2)
    const names = params.map((p) => p.name).sort()
    expect(names).toEqual(['offset', 'value'])
    expect(params.find((p) => p.name === 'value')?.usedIn).toContain('expression')
  })

  it('提取 item[\'xxx\'] 形式', () => {
    const el = makeEl({
      id: 't4', text: '',
      pointBinding: { mode: 'point', transform: "item['nestedKey'] + 1" },
    })
    const params = scanElementsForTemplateParams([el], 'item')
    expect(params.find((p) => p.name === 'nestedKey')).toBeDefined()
  })

  it('忽略 ext:/el:/comp:/global: scheme', () => {
    const el = makeEl({
      id: 't5',
      text: '{{ext:foo}} {{el:other:bar}} {{comp:xx:baz}} {{global:a.b}} {{item.real}}',
    })
    const params = scanElementsForTemplateParams([el], 'item')
    expect(params).toHaveLength(1)
    expect(params[0].name).toBe('real')
  })

  it('支持自定义 itemAlias', () => {
    const el = makeEl({ id: 't6', text: '{{row.title}}' })
    const params = scanElementsForTemplateParams([el], 'row')
    expect(params).toHaveLength(1)
    expect(params[0].name).toBe('title')
  })

  it('从样本 item 推断类型', () => {
    const el = makeEl({ id: 't7', text: '{{item.count}} {{item.label}} {{item.flag}}' })
    const params = scanElementsForTemplateParams(
      [el],
      'item',
      { count: 5, label: 'hello', flag: true }
    )
    expect(params.find((p) => p.name === 'count')?.type).toBe('integer')
    expect(params.find((p) => p.name === 'label')?.type).toBe('string')
    expect(params.find((p) => p.name === 'flag')?.type).toBe('boolean')
  })

  it('聚合相同参数名到 usedIn 列表', () => {
    const el1 = makeEl({ id: 't8a', text: '{{item.name}}' })
    const el2 = makeEl({ id: 't8b', text: '', pointBinding: { mode: 'point', textTemplate: '{{item.name}}' } })
    const params = scanElementsForTemplateParams([el1, el2], 'item')
    expect(params).toHaveLength(1)
    expect(params[0].usedIn).toEqual(expect.arrayContaining(['text', 'textTemplate']))
  })
})

describe('scanTemplate', () => {
  it('提取所有 {{}} 占位符并跳过 ext: scheme', () => {
    const collected: string[] = []
    scanTemplate('{{a}} {{b}} {{ext:c}}', 'item', (p) => collected.push(p))
    expect(collected).toEqual(['a', 'b'])
  })
})

describe('scanExpression', () => {
  it('提取 item.xxx 和 item["xxx"]', () => {
    const collected: string[] = []
    scanExpression('item.a + item["b-c"]; item.c', 'item', (p) => collected.push(p))
    expect(collected.sort()).toEqual(['item.a', 'item.b-c', 'item.c'])
  })
})
