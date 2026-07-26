/**
 * 上下文容器（ContextStore）：global 与 workflow 两个作用域共用同一实现。
 *
 * - 纯内存态，不持久化（页面刷新即清空）
 * - set 后异步通知订阅者（setTimeout 0），避免在写入同步栈内重入
 * - 支持点路径读写（a.b.c）
 * 参考 form-app appState.ts。
 */
import type { ContextStore } from './types'

export function createContextStore(initial: Record<string, unknown> = {}): ContextStore {
  let values: Record<string, unknown> = { ...initial }
  const subs = new Set<(name: string, v: unknown) => void>()

  const notify = (name: string, v: unknown) => {
    setTimeout(() => {
      subs.forEach((cb) => { try { cb(name, v) } catch { /* 隔离单个订阅者错误 */ } })
    }, 0)
  }

  return {
    getAll: () => values,
    get: (path) => {
      if (!path) return values
      return path.split('.').reduce<unknown>((cur, key) => {
        if (cur && typeof cur === 'object') return (cur as Record<string, unknown>)[key]
        return undefined
      }, values)
    },
    set: (path, value) => {
      if (!path) return
      const keys = path.split('.')
      let cur: Record<string, unknown> = values
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
        cur = cur[k] as Record<string, unknown>
      }
      cur[keys[keys.length - 1]] = value
      notify(keys[keys.length - 1], value)
    },
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb) } },
  }
}
