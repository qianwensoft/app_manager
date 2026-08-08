import { describe, it, expect } from 'vitest'
import { resolveConditionalStyles } from './conditionalStyles'
import type { CanvasElement, ConditionalStyles } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'

describe('conditionalStyles', () => {
  it('should resolve font color based on numeric value', () => {
    const el: CanvasElement = {
      id: 'test1',
      type: 'text',
      name: 'Test',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      text: '85',
      fontColor: '#ffffff',
      conditionalStyles: {
        fontColor: [
          { condition: 'Number(text) > 80', color: '#ff0000', label: 'Danger' },
          { condition: 'Number(text) > 60', color: '#ff9800', label: 'Warning' },
          { condition: 'true', color: '#4caf50', label: 'Normal' },
        ],
      },
      pointBinding: {
        mode: 'static',
        staticData: { value: 85 },
      },
    }

    const pointData: PointDataMap = { __static_value: 85 }
    const scope = { elements: [el], pointData }

    const styles = resolveConditionalStyles(el, pointData, scope)
    expect(styles.fontColor).toBe('#ff0000') // 85 > 80, first rule matches
  })

  it('should use second rule when first does not match', () => {
    const el: CanvasElement = {
      id: 'test2',
      type: 'text',
      name: 'Test',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      text: '70',
      conditionalStyles: {
        fontColor: [
          { condition: 'Number(text) > 80', color: '#ff0000' },
          { condition: 'Number(text) > 60', color: '#ff9800' },
          { condition: 'true', color: '#4caf50' },
        ],
      },
    }

    const pointData: PointDataMap = {}
    const scope = { elements: [el], pointData }

    const styles = resolveConditionalStyles(el, pointData, scope)
    expect(styles.fontColor).toBe('#ff9800') // 70 > 60, second rule matches
  })

  it('should use extData in conditions', () => {
    const el: CanvasElement = {
      id: 'test3',
      type: 'text',
      name: 'Temperature',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      text: '95',
      extData: {
        max: '100',
        warning: '80',
      },
      conditionalStyles: {
        fontColor: [
          { condition: 'Number(text) > Number(ext.max)', color: '#ff0000' },
          { condition: 'Number(text) > Number(ext.warning)', color: '#ff9800' },
          { condition: 'true', color: '#4caf50' },
        ],
      },
    }

    const pointData: PointDataMap = {}
    const scope = { elements: [el], pointData }

    const styles = resolveConditionalStyles(el, pointData, scope)
    expect(styles.fontColor).toBe('#ff9800') // 95 > 80 but not > 100
  })

  it('should reference other element extData', () => {
    const configEl: CanvasElement = {
      id: 'config',
      type: 'text',
      name: 'Config',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      extData: {
        threshold: '75',
      },
    }

    const displayEl: CanvasElement = {
      id: 'display',
      type: 'text',
      name: 'Display',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 2,
      text: '80',
      conditionalStyles: {
        fontColor: [
          { condition: "Number(text) > Number(el('Config', 'extData.threshold'))", color: '#ff0000' },
          { condition: 'true', color: '#4caf50' },
        ],
      },
    }

    const pointData: PointDataMap = {}
    const scope = { elements: [configEl, displayEl], pointData }

    const styles = resolveConditionalStyles(displayEl, pointData, scope)
    expect(styles.fontColor).toBe('#ff0000') // 80 > 75
  })

  it('resolves nested el() extData (max = ${el(1序).max + el(2序).max})', () => {
    const base = { type: 'text' as const, x: 0, y: 0, width: 100, height: 40, rotation: 0, visible: true, locked: false, zIndex: 1 }
    const seq1: CanvasElement = { ...base, id: 's1', name: '1序-配置', extData: { max: '30' } }
    const seq2: CanvasElement = { ...base, id: 's2', name: '2序-配置', extData: { max: '45' } }
    // 全检-配置.max 本身是引用其它两个组件 extData.max 的表达式
    const cfg: CanvasElement = {
      ...base,
      id: 'cfg',
      name: '全检-配置',
      extData: { max: "${Number(el('1序-配置','extData.max')) + Number(el('2序-配置','extData.max'))}" },
    }
    const display: CanvasElement = {
      ...base,
      id: 'disp',
      name: '显示',
      text: '80',
      conditionalStyles: {
        fontColor: [
          // 全检-配置.max 递归求值应为 30 + 45 = 75，故 80 > 75 命中红色
          { condition: "Number(el('全检-配置','extData.max')) > Number(text)", color: '#ff0000' },
          { condition: 'true', color: '#4caf50' },
        ],
      },
    }
    const elements = [seq1, seq2, cfg, display]
    const pointData: PointDataMap = {}
    const scope = { elements, pointData }

    // 条件表达式方向：max(75) > text(80)? 否 → 命中兜底绿色
    expect(resolveConditionalStyles(display, pointData, scope).fontColor).toBe('#4caf50')

    // 反向校验：text=70 时 75 > 70 命中红色，确认嵌套 max 确实解析为 75 而非 NaN
    const display2 = { ...display, text: '70' }
    const scope2 = { elements: [seq1, seq2, cfg, display2], pointData }
    expect(resolveConditionalStyles(display2, pointData, scope2).fontColor).toBe('#ff0000')
  })

  it('resolves ${...} content-expression text on both sides of condition', () => {
    const base = { type: 'text' as const, x: 0, y: 0, width: 100, height: 40, rotation: 0, visible: true, locked: false, zIndex: 1 }
    // 库存文本源
    const stock1: CanvasElement = { ...base, id: 'k1', name: '库存-1序', text: '10' }
    const stock2: CanvasElement = { ...base, id: 'k2', name: '库存-2序', text: '15' }
    // 配置源（供 全检-配置.max 求和）
    const seq1: CanvasElement = { ...base, id: 's1', name: '1序-配置', extData: { max: '12' } }
    const seq2: CanvasElement = { ...base, id: 's2', name: '2序-配置', extData: { max: '8' } }
    // 全检-配置.max = 12 + 8 = 20
    const cfg: CanvasElement = {
      ...base,
      id: 'cfg',
      name: '全检-配置',
      extData: { max: "${Number(el('1序-配置','extData.max')) + Number(el('2序-配置','extData.max'))}" },
    }
    // 显示组件：text 内容框为库存求和 = 10 + 15 = 25
    const display: CanvasElement = {
      ...base,
      id: 'disp',
      name: '显示',
      text: "${Number(el('库存-1序','text')) + Number(el('库存-2序','text'))}",
      conditionalStyles: {
        fontColor: [
          // max(20) > text(25)? 否 → 兜底绿；确认两侧嵌套表达式都已求值（非 NaN）
          { condition: "Number(el('全检-配置','extData.max')) > Number(text)", color: '#ff0000' },
          { condition: 'true', color: '#4caf50' },
        ],
      },
    }
    const elements = [stock1, stock2, seq1, seq2, cfg, display]
    const scope = { elements, pointData: {} as PointDataMap }
    expect(resolveConditionalStyles(display, {}, scope).fontColor).toBe('#4caf50')

    // 反向：库存合计降为 18（<20）时命中红色，确认 text 侧确实解析为数字而非 NaN
    const stock2b = { ...stock2, text: '8' } // 10 + 8 = 18
    const elements2 = [stock1, stock2b, seq1, seq2, cfg, display]
    const scope2 = { elements: elements2, pointData: {} as PointDataMap }
    expect(resolveConditionalStyles(display, {}, scope2).fontColor).toBe('#ff0000')
  })

  it('should handle multiple style properties', () => {
    const el: CanvasElement = {
      id: 'test5',
      type: 'button',
      name: 'Button',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      text: 'Alert',
      conditionalStyles: {
        fontColor: [{ condition: 'text === "Alert"', color: '#ffffff' }],
        fill: [{ condition: 'text === "Alert"', color: '#f44336' }],
        stroke: [{ condition: 'text === "Alert"', color: '#d32f2f' }],
      },
    }

    const pointData: PointDataMap = {}
    const scope = { elements: [el], pointData }

    const styles = resolveConditionalStyles(el, pointData, scope)
    expect(styles.fontColor).toBe('#ffffff')
    expect(styles.fill).toBe('#f44336')
    expect(styles.stroke).toBe('#d32f2f')
  })

  it('should return empty object when no rules match', () => {
    const el: CanvasElement = {
      id: 'test6',
      type: 'text',
      name: 'Test',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      text: '50',
      conditionalStyles: {
        fontColor: [
          { condition: 'Number(text) > 100', color: '#ff0000' },
        ],
      },
    }

    const pointData: PointDataMap = {}
    const scope = { elements: [el], pointData }

    const styles = resolveConditionalStyles(el, pointData, scope)
    expect(styles.fontColor).toBeUndefined()
  })

  it('should use binding value (v) in conditions', () => {
    const el: CanvasElement = {
      id: 'test7',
      type: 'text',
      name: 'Test',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      visible: true,
      locked: false,
      zIndex: 1,
      text: '90',
      conditionalStyles: {
        fontColor: [
          { condition: 'v > 50', color: '#ff0000' },
          { condition: 'true', color: '#4caf50' },
        ],
      },
      pointBinding: {
        mode: 'static',
        staticData: { value: 90 },
      },
    }

    const pointData: PointDataMap = { __static_value: 90 }
    const scope = { elements: [el], pointData }

    const styles = resolveConditionalStyles(el, pointData, scope)
    expect(styles.fontColor).toBe('#ff0000')
  })
})
