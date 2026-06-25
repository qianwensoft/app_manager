/**
 * 普通页面状态容器：非表单页（列表/详情）用的 StateScope 实现。
 *
 * 没有 Formily form 时，用一个最小 reactive store 实现同一接口，
 * 让事件系统（field_change/set_field/set_field_prop 等）也能跑在非表单页。
 *
 * 本期（第 1 步）先搭骨架；列表/详情可视化（架构第 2 期）再填充 setProp 的消费。
 * 设计说明见 docs/事件引擎脱Formily落地设计.md。
 */
import type { StateScope, FieldProp } from './pageState'

export function createPlainPageState(initial: Record<string, any> = {}): StateScope {
  let values: Record<string, any> = { ...initial }
  const subs = new Set<(name: string, v: any) => void>()
  // 字段展示属性：本期仅存意图，由列表/详情渲染层按需消费
  const props: Record<string, Partial<Record<FieldProp, any>>> = {}

  const setPath = (path: string, value: any) => {
    const keys = path.split('.')
    let cur: any = values
    for (let i = 0; i < keys.length - 1; i++) cur = (cur[keys[i]] ??= {})
    cur[keys[keys.length - 1]] = value
  }

  return {
    getValues: () => values,
    get: (path) => path.split('.').reduce((c, k) => (c == null ? c : c[k]), values),
    set: (path, value) => {
      if (!path) return
      setPath(path, value)
      const shortName = path.split('.').pop() || path
      subs.forEach(cb => { try { cb(shortName, value) } catch { /* 隔离单个订阅者错误 */ } })
    },
    setProp: (path, prop, value) => {
      if (!path || !prop) return
      ;(props[path] ??= {})[prop] = value
    },
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
  }
}
