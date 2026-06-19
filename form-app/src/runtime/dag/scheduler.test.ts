import { describe, it, expect, vi } from 'vitest'
import { runGraph } from './scheduler'
import { validateGraph, detectCycle } from './validate'
import { migrateActionsToGraph } from './migrate'
import type { FlowGraph } from './types'
import type { EventEngineDeps } from '../eventEngine'
import type { EventContext } from '../eventTypes'
import type { StateScope } from '../pageState'

function fakeScope(init: Record<string, any> = {}): StateScope & { store: Record<string, any> } {
  const store = { ...init }
  return {
    store,
    getValues: () => store,
    get: (p) => p.split('.').reduce((c: any, k) => (c == null ? c : c[k]), store),
    set: (p, v) => { store[p] = v },
    setProp: () => {},
    subscribe: () => () => {},
  }
}

const baseCtx: EventContext = { scan: 'S', form: {}, app: {}, event: undefined }

describe('detectCycle / validateGraph', () => {
  it('无环图通过', () => {
    const g: FlowGraph = { nodes: [{ id: 'a', kind: 'tool' }, { id: 'b', kind: 'tool' }], edges: [{ id: 'e', source: 'a', target: 'b' }] }
    expect(detectCycle(g)).toBeNull()
    expect(validateGraph(g).ok).toBe(true)
  })
  it('A→B→A 检出环', () => {
    const g: FlowGraph = { nodes: [{ id: 'a', kind: 'tool' }, { id: 'b', kind: 'tool' }], edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }] }
    const c = detectCycle(g)
    expect(c).not.toBeNull()
    expect(validateGraph(g).ok).toBe(false)
  })
  it('边指向不存在节点 → 结构错误', () => {
    const g: FlowGraph = { nodes: [{ id: 'a', kind: 'tool' }], edges: [{ id: 'e', source: 'a', target: 'ghost' }] }
    expect(validateGraph(g).ok).toBe(false)
  })
})

describe('runGraph 调度', () => {
  it('fan-out 并发 + barrier 等齐：3 个 set_field 并行后汇合', async () => {
    const page = fakeScope()
    const deps: EventEngineDeps = { pageState: page }
    const g: FlowGraph = {
      nodes: [
        { id: 'p', kind: 'parallel' },
        { id: 'a', kind: 'tool', action: { type: 'set_field', field: 'a', value_src: 'A' } as any },
        { id: 'b', kind: 'tool', action: { type: 'set_field', field: 'b', value_src: 'B' } as any },
        { id: 'c', kind: 'tool', action: { type: 'set_field', field: 'c', value_src: 'C' } as any },
        { id: 'm', kind: 'barrier' },
        { id: 'done', kind: 'tool', action: { type: 'set_field', field: 'done', value_src: 'YES' } as any },
      ],
      edges: [
        { id: 'e1', source: 'p', target: 'a' }, { id: 'e2', source: 'p', target: 'b' }, { id: 'e3', source: 'p', target: 'c' },
        { id: 'e4', source: 'a', target: 'm' }, { id: 'e5', source: 'b', target: 'm' }, { id: 'e6', source: 'c', target: 'm' },
        { id: 'e7', source: 'm', target: 'done' },
      ],
    }
    await runGraph(g, baseCtx, deps)
    expect(page.store).toMatchObject({ a: 'A', b: 'B', c: 'C', done: 'YES' })
  })

  it('$node 上游产出传递：call_interface 结果喂下游 set_field', async () => {
    const page = fakeScope()
    const onScanInterface = vi.fn().mockResolvedValue({ data: { id: 99 } })
    const deps: EventEngineDeps = { pageState: page, onScanInterface }
    const g: FlowGraph = {
      nodes: [
        { id: 'q', kind: 'tool', action: { type: 'call_interface', interface_type: 'internal', interface_code: 'q' } as any },
        { id: 's', kind: 'tool', action: { type: 'set_field', field: 'rid', value_src: '$node.q.result.data.id' } as any },
      ],
      edges: [{ id: 'e', source: 'q', target: 's' }],
    }
    await runGraph(g, baseCtx, deps)
    expect(page.store.rid).toBe(99)
  })

  it('condition 选边剪枝：YES 分支走、NO 分支跳过', async () => {
    const page = fakeScope({ flag: 'YES' })
    const ctx: EventContext = { ...baseCtx, form: page.store }
    const deps: EventEngineDeps = { pageState: page }
    const g: FlowGraph = {
      nodes: [
        { id: 'c', kind: 'condition' },
        { id: 'yes', kind: 'tool', action: { type: 'set_field', field: 'picked', value_src: 'YES_BRANCH' } as any },
        { id: 'no', kind: 'tool', action: { type: 'set_field', field: 'picked', value_src: 'NO_BRANCH' } as any },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'yes', condition: { left_src: '$form.flag', operator: 'eq', value: 'YES' } },
        { id: 'e2', source: 'c', target: 'no', condition: { left_src: '$form.flag', operator: 'eq', value: 'NO' } },
      ],
    }
    const { traces } = await runGraph(g, ctx, deps)
    expect(page.store.picked).toBe('YES_BRANCH')
    expect(traces.find(t => t.nodeId === 'no')?.status).toBe('skipped')
  })

  it('节点超时：动作级 timeout 触发，trace 标 timeout', async () => {
    const page = fakeScope()
    const onScanInterface = vi.fn().mockImplementation(() => new Promise(() => {}))
    const deps: EventEngineDeps = { pageState: page }
    const g: FlowGraph = {
      nodes: [{ id: 'q', kind: 'tool', action: { type: 'call_interface', interface_type: 'internal', interface_code: 'q', timeout: 30, onError: 'continue' } as any }],
      edges: [],
    }
    const dd: EventEngineDeps = { ...deps, onScanInterface }
    const { traces } = await runGraph(g, baseCtx, dd)
    expect(traces[0].status).toBe('timeout')
  })

  it('有环图不执行（运行前校验拦截）', async () => {
    const page = fakeScope()
    const toast = vi.fn()
    const deps: EventEngineDeps = { pageState: page, toast }
    const g: FlowGraph = {
      nodes: [{ id: 'a', kind: 'tool', action: { type: 'set_field', field: 'x', value_src: '1' } as any }, { id: 'b', kind: 'tool', action: { type: 'set_field', field: 'y', value_src: '2' } as any }],
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }],
    }
    await runGraph(g, baseCtx, deps)
    expect(page.store).toEqual({}) // 未执行
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('非法'))
  })

  it('onTrace 回调收到节点轨迹', async () => {
    const page = fakeScope()
    const onTrace = vi.fn()
    const deps: EventEngineDeps = { pageState: page, onTrace }
    const g: FlowGraph = { nodes: [{ id: 'a', kind: 'tool', action: { type: 'set_field', field: 'x', value_src: '1' } as any }], edges: [] }
    await runGraph(g, baseCtx, deps)
    expect(onTrace).toHaveBeenCalledOnce()
    expect(onTrace.mock.calls[0][0][0].status).toBe('ok')
  })
})

describe('migrateActionsToGraph', () => {
  it('线性 actions → 单链 graph，执行结果与顺序一致', async () => {
    const actions = [
      { type: 'set_field', field: 'a', value_src: '1' },
      { type: 'set_field', field: 'b', value_src: '$form.a' },
    ] as any[]
    const g = migrateActionsToGraph(actions)
    expect(g.nodes).toHaveLength(2)
    expect(g.edges).toHaveLength(1)
    const page = fakeScope()
    const ctx: EventContext = { ...baseCtx, form: page.store }
    await runGraph(g, ctx, { pageState: page })
    expect(page.store.a).toBe('1')
    expect(page.store.b).toBe('1') // b 读到 a 的值，证明顺序执行
  })

  it('run_script 动作转 run_script 节点', () => {
    const g = migrateActionsToGraph([{ type: 'run_script', script: 'ctx.toast("hi")' } as any])
    expect(g.nodes[0].kind).toBe('run_script')
    expect(g.nodes[0].script).toBe('ctx.toast("hi")')
  })
})
