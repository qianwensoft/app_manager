import { describe, it, expect } from 'vitest'
import { evaluateExpression, parseGlobalParamValue } from './expression'
import type { CanvasElement } from '@/types'

describe('evaluateExpression', () => {
  it('returns undefined for empty', () => {
    expect(evaluateExpression('', {})).toBeUndefined()
    expect(evaluateExpression(undefined, {})).toBeUndefined()
  })

  it('reads global params via params object and P()', () => {
    const scope = { params: { deviceId: 'd-1', limit: 20 } }
    expect(evaluateExpression('params.deviceId', scope)).toBe('d-1')
    expect(evaluateExpression("P('limit') + 5", scope)).toBe(25)
  })

  it('reads point data via point and V()', () => {
    const scope = { point: { temp: 25, nested: { v: 3 } } }
    expect(evaluateExpression('point.temp', scope)).toBe(25)
    expect(evaluateExpression("V('nested.v')", scope)).toBe(3)
  })

  it('reads element property via el()', () => {
    const el: CanvasElement = {
      id: 'e1', type: 'text', name: 'title', x: 0, y: 0, width: 1, height: 1,
      rotation: 0, visible: true, locked: false, zIndex: 0, text: 'hello',
    }
    expect(evaluateExpression("el('title', 'text')", { elements: [el] })).toBe('hello')
    expect(evaluateExpression("el('e1', 'text')", { elements: [el] })).toBe('hello')
  })

  it('reads url params', () => {
    expect(evaluateExpression("url('id')", { urlSearch: '?id=abc' })).toBe('abc')
  })

  it('supports builtin time functions', () => {
    expect(evaluateExpression("today('YYYY')", {})).toBe(String(new Date().getFullYear()))
    const ts = evaluateExpression('nowMs()', {}) as number
    expect(typeof ts).toBe('number')
    expect(evaluateExpression("formatDate(0, 'YYYY')", {})).toBe(String(new Date(0).getFullYear()))
  })

  it('supports day-boundary time helpers', () => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date()
    const y = new Date(); y.setDate(y.getDate() - 1)
    const ymd = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`

    expect(evaluateExpression('todayStart()', {})).toBe(`${ymd(d)} 00:00:00`)
    expect(evaluateExpression('todayEnd()', {})).toBe(`${ymd(d)} 23:59:59`)
    expect(evaluateExpression('yesterdayStart()', {})).toBe(`${ymd(y)} 00:00:00`)
    expect(evaluateExpression('yesterdayEnd()', {})).toBe(`${ymd(y)} 23:59:59`)
    expect(evaluateExpression("todayStart('YYYY-MM-DD')", {})).toBe(ymd(d))
  })

  it('day-boundary helpers return timestamps via x/X pattern and *Ms/*Sec', () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(); end.setHours(23, 59, 59, 999)

    // 毫秒时间戳（'x' 与 *Ms 一致，且为 number 类型）
    const tsMs = evaluateExpression("todayStart('x')", {}) as number
    expect(typeof tsMs).toBe('number')
    expect(tsMs).toBe(start.getTime())
    expect(evaluateExpression('todayStartMs()', {})).toBe(start.getTime())
    expect(evaluateExpression('todayEndMs()', {})).toBe(end.getTime())

    // 秒级时间戳（'X' 与 *Sec 一致）
    const tsSec = evaluateExpression("todayStart('X')", {}) as number
    expect(tsSec).toBe(Math.floor(start.getTime() / 1000))
    expect(evaluateExpression('todayEndSec()', {})).toBe(Math.floor(end.getTime() / 1000))

    // 昨日边界毫秒
    const yStart = new Date(); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0)
    expect(evaluateExpression('yesterdayStartMs()', {})).toBe(yStart.getTime())
    expect(evaluateExpression("yesterdayStart('x')", {})).toBe(yStart.getTime())

    // now/today 也支持时间戳格式
    expect(typeof evaluateExpression("now('x')", {})).toBe('number')
    expect(typeof evaluateExpression("today('X')", {})).toBe('number')
  })

  it('supports pad/round util functions', () => {
    expect(evaluateExpression('pad(5, 2)', {})).toBe('05')
    expect(evaluateExpression('round(3.14159, 2)', {})).toBe(3.14)
  })

  it('supports custom functions with builtin scope access', () => {
    const scope = {
      params: { base: 10 },
      customFunctions: [
        { name: 'double', args: ['x'], body: 'return x * 2' },
        { name: 'withBase', args: ['x'], body: 'return x + params.base' },
      ],
    }
    expect(evaluateExpression('double(21)', scope)).toBe(42)
    expect(evaluateExpression('withBase(5)', scope)).toBe(15)
  })

  it('returns undefined on error, never throws', () => {
    expect(evaluateExpression('this is not valid js !!!', {})).toBeUndefined()
    expect(evaluateExpression('nonexistent.deep.path', {})).toBeUndefined()
  })

  it('supports statement body with return', () => {
    expect(evaluateExpression('const a = 2; return a * 3;', {})).toBe(6)
  })
})

describe('parseGlobalParamValue', () => {
  it('parses by type', () => {
    expect(parseGlobalParamValue('number', '42')).toBe(42)
    expect(parseGlobalParamValue('boolean', 'true')).toBe(true)
    expect(parseGlobalParamValue('boolean', 'false')).toBe(false)
    expect(parseGlobalParamValue('string', 'hi')).toBe('hi')
    expect(parseGlobalParamValue('json', '[1,2,3]')).toEqual([1, 2, 3])
  })
})
