/**
 * 全局自定义事件总线（单例）。
 *
 * 供 emit_event 动作派发、custom_event 触发源监听。
 * 事件链环路守卫上下文（EmitScope）随事件透传。
 * 参考 form-app EventHandler.ts + emitScope.ts。
 */

/** 事件链环路守卫 */
export interface EmitScope {
  depth: number
  chain: string[]
  readonly maxDepth: number
}

export const DEFAULT_MAX_EMIT_DEPTH = 20

export function rootEmitScope(maxDepth = DEFAULT_MAX_EMIT_DEPTH): EmitScope {
  return { depth: 0, chain: [], maxDepth }
}

type BusHandler = (data: unknown, scope?: EmitScope) => void

class EmitBus {
  private handlers = new Map<string, BusHandler[]>()

  on(name: string, handler: BusHandler): () => void {
    if (!this.handlers.has(name)) this.handlers.set(name, [])
    this.handlers.get(name)!.push(handler)
    return () => this.off(name, handler)
  }

  off(name: string, handler: BusHandler): void {
    const arr = this.handlers.get(name)
    if (!arr) return
    const i = arr.indexOf(handler)
    if (i > -1) arr.splice(i, 1)
  }

  emit(name: string, data: unknown, scope?: EmitScope): void {
    const arr = this.handlers.get(name)
    if (arr) arr.slice().forEach((h) => { try { h(data, scope) } catch { /* 隔离 */ } })
  }

  clear(): void {
    this.handlers.clear()
  }
}

/** 全局单例 */
export const emitBus = new EmitBus()

/**
 * 构造带守卫的 emit：派发前做深度 / 直接环检测，截断时 toast 出完整链路。
 * 异步派发（setTimeout 0），避免当前动作链同步栈内递归重入。
 */
export function makeGuardedEmit(
  scope: EmitScope,
  toast?: (msg: string) => void,
): (eventName: string, data: unknown) => void {
  return (eventName, data) => {
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
    setTimeout(() => {
      try { emitBus.emit(eventName, data, childScope) } catch { /* 忽略 */ }
    }, 0)
  }
}
