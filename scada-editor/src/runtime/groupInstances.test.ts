import { describe, it, expect } from 'vitest'
import type { CanvasElement } from '@/types'
import { expandGroupInstancesDetailed, buildVirtualContainerStyle } from './groupInstances'

function el(partial: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'x', type: 'text', name: 'x',
    x: 0, y: 0, width: 100, height: 20,
    rotation: 0, visible: true, locked: false,
    zIndex: 0,
    ...partial,
  }
}

describe('expandGroupInstancesDetailed', () => {
  it('保留旧 fixed-cell 行为（向后兼容）', () => {
    const group = el({
      id: 'g1', type: 'group', x: 10, y: 10, width: 80, height: 40,
      children: ['c1'],
      groupBinding: {
        enabled: true,
        source: 'static',
        value: [{ a: 1 }, { a: 2 }],
        layout: 'horizontal',
        gapX: 5,
      },
    })
    const c1 = el({ id: 'c1', x: 5, y: 5, text: '{{item.a}}' })
    const result = expandGroupInstancesDetailed([group, c1], {})
    expect(result.instances).toHaveLength(2)
    // fixed-cell 行为：每个实例的 child 坐标 = child.x + col * (group.width + gapX)
    expect(result.instances[0].element.x).toBe(5 + 0 * (80 + 5))
    expect(result.instances[1].element.x).toBe(5 + 1 * (80 + 5))
    expect(result.virtualContainers).toHaveLength(0)
  })

  it('启用 virtualLayout 时输出 virtualContainers', () => {
    const group = el({
      id: 'g2', type: 'group', x: 100, y: 100, width: 200, height: 60,
      children: ['c2'],
      groupBinding: {
        enabled: true,
        source: 'static',
        value: [{ name: 'A' }, { name: 'B' }],
        virtualLayout: { display: 'flex', flexDirection: 'row', gap: 10 },
      },
    })
    const c2 = el({ id: 'c2', x: 10, y: 10, text: '{{item.name}}' })
    const result = expandGroupInstancesDetailed([group, c2], {})
    expect(result.virtualContainers).toHaveLength(1)
    const vc = result.virtualContainers[0]
    expect(vc.groupId).toBe('g2')
    expect(vc.layout.display).toBe('flex')
    expect(vc.containerStyle.display).toBe('flex')
    expect(vc.items).toHaveLength(2)
    // 虚拟容器模式下，子元素 x/y 应相对容器归零
    expect(result.instances[0].element.x).toBe(10 - 100)
    expect(result.instances[0].element.y).toBe(10 - 100)
    expect(result.instances[0].element.text).toBe('A')
    expect(result.instances[1].element.text).toBe('B')
  })

  it('应用 paramFieldMap 重写 item.xxx -> item.<mapped>', () => {
    const group = el({
      id: 'g3', type: 'group', x: 0, y: 0, width: 100, height: 30,
      children: ['c3'],
      groupBinding: {
        enabled: true,
        source: 'static',
        value: [{ deviceName: 'P-1' }],
        itemAlias: 'item',
        virtualLayout: { display: 'flex' },
        paramFieldMap: { name: 'deviceName' },
      },
    })
    const c3 = el({ id: 'c3', text: '设备 {{item.name}}' })
    const result = expandGroupInstancesDetailed([group, c3], {})
    expect(result.instances[0].element.text).toBe('设备 P-1')
  })

  it('应用 paramOverrides 强制值', () => {
    const group = el({
      id: 'g4', type: 'group', x: 0, y: 0, width: 100, height: 30,
      children: ['c4'],
      groupBinding: {
        enabled: true,
        source: 'static',
        value: [{ name: 'A' }, { name: 'B' }],
        virtualLayout: { display: 'flex' },
        paramOverrides: { name: '强制' },
      },
    })
    const c4 = el({ id: 'c4', text: '{{item.name}}' })
    const result = expandGroupInstancesDetailed([group, c4], {})
    expect(result.instances[0].element.text).toBe('强制')
    expect(result.instances[1].element.text).toBe('强制')
  })

  it('处理 source=point：从 pointData 中读取数组', () => {
    const group = el({
      id: 'g5', type: 'group', x: 0, y: 0, width: 100, height: 30,
      children: ['c5'],
      groupBinding: {
        enabled: true,
        source: 'point',
        path: 'devices',
        virtualLayout: { display: 'flex' },
      },
    })
    const c5 = el({ id: 'c5', text: '{{item.x}}' })
    const result = expandGroupInstancesDetailed([group, c5], {
      devices: [{ x: 'a' }, { x: 'b' }, { x: 'c' }],
    })
    expect(result.instances.map((i) => i.element.text)).toEqual(['a', 'b', 'c'])
  })

  it('maxInstances 截断数组', () => {
    const group = el({
      id: 'g6', type: 'group', x: 0, y: 0, width: 100, height: 30,
      children: ['c6'],
      groupBinding: {
        enabled: true,
        source: 'static',
        value: [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }],
        maxInstances: 2,
        virtualLayout: { display: 'flex' },
      },
    })
    const c6 = el({ id: 'c6', text: '{{item.x}}' })
    const result = expandGroupInstancesDetailed([group, c6], {})
    expect(result.instances).toHaveLength(2)
  })

  it('emptyBehavior=template 时空数组渲染一个空实例', () => {
    const group = el({
      id: 'g7', type: 'group', x: 0, y: 0, width: 100, height: 30,
      children: ['c7'],
      groupBinding: {
        enabled: true,
        source: 'static',
        value: [],
        emptyBehavior: 'template',
        virtualLayout: { display: 'flex' },
      },
    })
    const c7 = el({ id: 'c7', text: '空模板' })
    const result = expandGroupInstancesDetailed([group, c7], {})
    expect(result.instances).toHaveLength(1)
  })
})

describe('buildVirtualContainerStyle', () => {
  it('flex: 输出 display:flex + gap', () => {
    const group = el({ id: 'g', width: 100, height: 30 })
    const { containerStyle } = buildVirtualContainerStyle(
      { display: 'flex', flexDirection: 'row', gap: 8 },
      group
    )
    expect(containerStyle.display).toBe('flex')
    expect((containerStyle as any).flexDirection).toBe('row')
    expect((containerStyle as any).gap).toBe(8)
  })

  it('grid: columnsAutoFit 时输出 auto-fit + minmax', () => {
    const group = el({ id: 'g', width: 100, height: 30 })
    const { containerStyle } = buildVirtualContainerStyle(
      { display: 'grid', columnsAutoFit: { minWidth: 200 } },
      group
    )
    expect(containerStyle.display).toBe('grid')
    expect((containerStyle as any).gridTemplateColumns).toContain('minmax(200px')
  })

  it('flow: columns 转 gridTemplateColumns', () => {
    const group = el({ id: 'g', width: 100, height: 30 })
    const { containerStyle } = buildVirtualContainerStyle(
      { display: 'flow', columns: 3 },
      group
    )
    expect(containerStyle.display).toBe('grid')
    expect((containerStyle as any).gridTemplateColumns).toBe('repeat(3, 1fr)')
  })
})
