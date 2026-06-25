/**
 * 事件链环路守卫。
 *
 * emit_event 异步派发（setTimeout 0），A→B→A 这类互触发会无限递归（原实现零守卫，
 * 是真实死循环 bug）。EmitScope 贯穿「一次外部触发引发的整条 emit 链」，提供：
 * - 直接环检测（chain.includes）：挡 A→B→A
 * - 深度上限（maxDepth）：挡 A→B→C→…→Z 的长链 / 扇出爆炸
 *
 * 外部源（扫码 / 键盘楔 / 自定义事件总线）用 rootEmitScope() 起步（depth 0）。
 * 详见 docs/第3-4步-ToolRegistry与降级守卫落地设计.md。
 */
import { eventManager } from './EventHandler'

export interface EmitScope {
  /** 当前 emit 深度 */
  depth: number
  /** 已途经的事件名（用于环检测 + 诊断） */
  chain: string[]
  /** 深度上限 */
  readonly maxDepth: number
}

export const DEFAULT_MAX_EMIT_DEPTH = 20

export function rootEmitScope(maxDepth = DEFAULT_MAX_EMIT_DEPTH): EmitScope {
  return { depth: 0, chain: [], maxDepth }
}

/**
 * 构造带守卫的 emit：在派发前做深度 / 直接环检测，截断时 toast 出完整链路。
 * scope 随事件透传给下游 handler（eventManager.emit 的第三参）。
 */
export function makeGuardedEmit(
  scope: EmitScope,
  toast?: (msg: string) => void,
): (eventName: string, data: string) => void {
  return (eventName: string, data: string) => {
    if (!eventName) return
    if (scope.depth >= scope.maxDepth) {
      toast?.(`事件链过深(${scope.maxDepth})，疑似循环：${[...scope.chain, eventName].join('→')}`)
      return
    }
    if (scope.chain.includes(eventName)) {
      toast?.(`检测到事件环路：${[...scope.chain, eventName].join('→')}`)
      return
    }
    const childScope: EmitScope = {
      depth: scope.depth + 1,
      chain: [...scope.chain, eventName],
      maxDepth: scope.maxDepth,
    }
    // 异步派发，避免在当前动作链同步栈内递归触发导致的重入问题；scope 随事件透传
    setTimeout(() => {
      try { eventManager.emit(eventName, data, childScope) } catch { /* 忽略 */ }
    }, 0)
  }
}
