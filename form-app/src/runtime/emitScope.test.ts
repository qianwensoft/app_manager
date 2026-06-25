import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rootEmitScope, makeGuardedEmit, DEFAULT_MAX_EMIT_DEPTH } from './emitScope'
import { eventManager } from './EventHandler'

describe('makeGuardedEmit 环路守卫', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('正常 emit 透传到 eventManager（带 childScope）', () => {
    const spy = vi.spyOn(eventManager, 'emit').mockImplementation(() => {})
    const emit = makeGuardedEmit(rootEmitScope())
    emit('foo', 'data')
    vi.runAllTimers()
    expect(spy).toHaveBeenCalledOnce()
    const [name, data, scope] = spy.mock.calls[0]
    expect(name).toBe('foo')
    expect(data).toBe('data')
    expect((scope as any).depth).toBe(1)
    expect((scope as any).chain).toEqual(['foo'])
  })

  it('直接环 A→A 被截断', () => {
    const spy = vi.spyOn(eventManager, 'emit').mockImplementation(() => {})
    const toasts: string[] = []
    // 模拟已途经 A 的 scope
    const scope = { depth: 1, chain: ['A'], maxDepth: DEFAULT_MAX_EMIT_DEPTH }
    const emit = makeGuardedEmit(scope, m => toasts.push(m))
    emit('A', 'x')
    vi.runAllTimers()
    expect(spy).not.toHaveBeenCalled()
    expect(toasts[0]).toMatch(/环路/)
    expect(toasts[0]).toContain('A→A')
  })

  it('深度超限被截断', () => {
    const spy = vi.spyOn(eventManager, 'emit').mockImplementation(() => {})
    const toasts: string[] = []
    const scope = { depth: DEFAULT_MAX_EMIT_DEPTH, chain: ['x'], maxDepth: DEFAULT_MAX_EMIT_DEPTH }
    const emit = makeGuardedEmit(scope, m => toasts.push(m))
    emit('y', 'x')
    vi.runAllTimers()
    expect(spy).not.toHaveBeenCalled()
    expect(toasts[0]).toMatch(/过深/)
  })

  it('childScope 链路递增（A→B 不误判为环）', () => {
    const spy = vi.spyOn(eventManager, 'emit').mockImplementation(() => {})
    const scope = { depth: 1, chain: ['A'], maxDepth: DEFAULT_MAX_EMIT_DEPTH }
    const emit = makeGuardedEmit(scope)
    emit('B', 'x')
    vi.runAllTimers()
    expect(spy).toHaveBeenCalledOnce()
    expect((spy.mock.calls[0][2] as any).chain).toEqual(['A', 'B'])
  })
})
