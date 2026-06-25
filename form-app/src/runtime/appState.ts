/**
 * 应用级共享状态 AppState：StateScope 的应用作用域实现。
 *
 * 与 PageState 的区别：
 * - 常驻于 form-app SPA 生命周期（跨页面存活），由 MultiPageRuntime 按 formAppCode 实例化
 * - 纯数据容器，没有 UI 字段 → setProp 为 no-op
 * - 提供 reset（退出登录/手动清空）与 dispose（卸载释放）
 *
 * 关键约束：AppState 必须按 formAppCode 实例化、经 Context 下发，
 * 绝不做模块单例（避开多 form-app 串状态）。详见 docs/第2步-AppState落地设计.md。
 */
import type { StateScope, FieldProp } from './pageState'

export interface AppState extends StateScope {
  /** 所属 form-app code（便于调试/隔离校验） */
  readonly formAppCode: string
  /** 显式重置：清值 + 通知订阅者（退出登录/手动清空） */
  reset(): void
  /** 销毁：清订阅者，释放（MultiPageRuntime 卸载时调用） */
  dispose(): void
}

export function createAppState(
  formAppCode: string,
  initial: Record<string, any> = {},
): AppState {
  let values: Record<string, any> = { ...initial }
  const subs = new Set<(name: string, v: any) => void>()

  // 异步派发，避免在 set 的同步栈内重入（与 emit_event 的 setTimeout(0) 防重入约定一致）
  const notify = (name: string, v: any) => {
    setTimeout(() => {
      subs.forEach(cb => { try { cb(name, v) } catch { /* 隔离单个订阅者错误 */ } })
    }, 0)
  }

  return {
    formAppCode,
    getValues: () => values,
    get: (path) => (path ? path.split('.').reduce((c, k) => (c == null ? c : c[k]), values) : values),
    set: (path, value) => {
      if (!path) return
      const keys = path.split('.')
      let cur: any = values
      for (let i = 0; i < keys.length - 1; i++) cur = (cur[keys[i]] ??= {})
      cur[keys[keys.length - 1]] = value
      // 短名通知，与 PageState.subscribe 语义一致
      notify(keys[keys.length - 1], value)
    },
    // AppState 无 UI 字段，setProp 不适用
    setProp: (_path: string, _prop: FieldProp, _value: any) => { /* no-op */ },
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb) } },
    reset: () => { values = {}; notify('*', undefined) },
    dispose: () => { subs.clear(); values = {} },
  }
}
