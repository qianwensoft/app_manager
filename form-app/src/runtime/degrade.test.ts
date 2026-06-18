import { describe, it, expect } from 'vitest'
import { withTimeout, withRetry, resolveDegrade } from './degrade'
import type { Tool } from './tools/types'

describe('withTimeout', () => {
  it('ms 为空时原样返回', async () => {
    await expect(withTimeout(Promise.resolve('ok'))).resolves.toBe('ok')
  })
  it('未超时正常返回', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })
  it('超时则 reject', async () => {
    const slow = new Promise<string>(res => setTimeout(() => res('late'), 100))
    await expect(withTimeout(slow, 20)).rejects.toThrow(/超时/)
  })
})

describe('withRetry', () => {
  it('首次成功不重试', async () => {
    let calls = 0
    const r = await withRetry(async () => { calls++; return 'ok' }, { maxAttempts: 3, backoff: 'fixed', initialDelay: 0 })
    expect(r).toBe('ok')
    expect(calls).toBe(1)
  })
  it('前两次失败第三次成功', async () => {
    let calls = 0
    const r = await withRetry(async () => {
      calls++
      if (calls < 3) throw new Error('fail')
      return 'ok'
    }, { maxAttempts: 3, backoff: 'fixed', initialDelay: 0 })
    expect(r).toBe('ok')
    expect(calls).toBe(3)
  })
  it('达上限仍失败则抛最后错误', async () => {
    let calls = 0
    await expect(withRetry(async () => { calls++; throw new Error(`e${calls}`) },
      { maxAttempts: 2, backoff: 'fixed', initialDelay: 0 })).rejects.toThrow('e2')
    expect(calls).toBe(2)
  })
  it('maxAttempts<=1 只跑一次', async () => {
    let calls = 0
    await expect(withRetry(async () => { calls++; throw new Error('x') },
      { maxAttempts: 1, backoff: 'fixed', initialDelay: 0 })).rejects.toThrow('x')
    expect(calls).toBe(1)
  })
})

describe('resolveDegrade', () => {
  const tool: Tool = { name: 't', defaults: { timeout: 15000, retry: { maxAttempts: 2, backoff: 'fixed', initialDelay: 100 } }, execute: async () => {} }
  it('动作级覆盖 Tool.defaults', () => {
    const d = resolveDegrade({ timeout: 500 }, tool)
    expect(d.timeout).toBe(500)
    expect(d.retry.maxAttempts).toBe(2) // retry 未覆盖 → 用 tool.defaults
  })
  it('无动作级配置时用 Tool.defaults', () => {
    const d = resolveDegrade({}, tool)
    expect(d.timeout).toBe(15000)
  })
  it('Tool 无 defaults 时兜底不重试', () => {
    const bare: Tool = { name: 'b', execute: async () => {} }
    const d = resolveDegrade({}, bare)
    expect(d.timeout).toBeUndefined()
    expect(d.retry.maxAttempts).toBe(1)
  })
})
