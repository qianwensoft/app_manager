import { describe, it, expect, vi } from 'vitest'
import { runEventAction, type EventEngineDeps } from './eventEngine'
import type { StateScope } from './pageState'
import type { EventContext } from './eventTypes'

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

describe('runEventAction 工具查表 + scope 分流', () => {
  it('set_field 默认写 pageState', async () => {
    const page = fakeScope()
    const app = fakeScope()
    const deps: EventEngineDeps = { pageState: page, appState: app }
    await runEventAction({ type: 'set_field', field: 'name', value_src: '$scan' } as any, baseCtx, deps)
    expect(page.store.name).toBe('S')
    expect(app.store.name).toBeUndefined()
  })

  it('set_field scope=app 写 appState', async () => {
    const page = fakeScope()
    const app = fakeScope()
    const deps: EventEngineDeps = { pageState: page, appState: app }
    await runEventAction({ type: 'set_field', field: 'token', value_src: 'abc', scope: 'app' } as any, baseCtx, deps)
    expect(app.store.token).toBe('abc')
    expect(page.store.token).toBeUndefined()
  })

  it('call_interface result_map 回填 + result_scope=app', async () => {
    const page = fakeScope()
    const app = fakeScope()
    const onScanInterface = vi.fn().mockResolvedValue({ data: { id: 42 } })
    const deps: EventEngineDeps = { pageState: page, appState: app, onScanInterface }
    await runEventAction({
      type: 'call_interface', interface_type: 'internal', interface_code: 'q',
      param_map: [{ key: 'code', src: '$scan' }],
      result_map: [{ response_field: 'data.id', form_field: 'rid' }],
      result_scope: 'app',
    } as any, baseCtx, deps)
    expect(onScanInterface).toHaveBeenCalledWith('q', { code: 'S' }, 'internal')
    expect(app.store.rid).toBe(42)
    expect(page.store.rid).toBeUndefined()
  })

  it('toast 工具调用 deps.toast', async () => {
    const page = fakeScope()
    const toast = vi.fn()
    const deps: EventEngineDeps = { pageState: page, toast }
    await runEventAction({ type: 'toast', message_src: 'hello' } as any, baseCtx, deps)
    expect(toast).toHaveBeenCalledWith('hello')
  })

  it('未知工具不抛错，toast 提示', async () => {
    const page = fakeScope()
    const toast = vi.fn()
    const deps: EventEngineDeps = { pageState: page, toast }
    await expect(runEventAction({ type: 'no_such_tool' } as any, baseCtx, deps)).resolves.toBeUndefined()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('未知工具'))
  })

  it('call_interface 超时（mock 永挂起 + 动作级 timeout）', async () => {
    const page = fakeScope()
    const onScanInterface = vi.fn().mockImplementation(() => new Promise(() => {})) // 永不 resolve
    const deps: EventEngineDeps = { pageState: page, onScanInterface }
    await expect(runEventAction({
      type: 'call_interface', interface_type: 'internal', interface_code: 'q', timeout: 30,
    } as any, baseCtx, deps)).rejects.toThrow(/超时/)
  })
})
