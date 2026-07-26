/**
 * 动作降级保护：超时 / 重试 / 配置解析。
 *
 * 全部 opt-in：动作未配置 timeout/retry 时不超时、不重试。
 * 配置优先级：动作级 > Tool.defaults > 全局兜底。
 * 参考 form-app runtime/degrade.ts。
 */
import type { RetryConfig, Tool } from './tools/types'

/** 给 Promise 套超时；ms 为空则原样返回（不超时） */
export function withTimeout<T>(p: Promise<T>, ms?: number): Promise<T> {
  if (!ms || ms <= 0) return p
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`工具执行超时(${ms}ms)`)), ms)),
  ])
}

/** 按重试策略执行；maxAttempts<=1 则只跑一次 */
export async function withRetry<T>(fn: () => Promise<T>, r: RetryConfig): Promise<T> {
  const attempts = Math.max(1, r.maxAttempts || 1)
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (i < attempts - 1) {
        const base = r.backoff === 'exponential' ? r.initialDelay * 2 ** i
          : r.backoff === 'linear' ? r.initialDelay * (i + 1)
          : r.initialDelay
        const delay = Math.min(base, r.maxDelay ?? base)
        if (delay > 0) await new Promise((res) => setTimeout(res, delay))
      }
    }
  }
  throw last
}

/** 动作可携带的降级字段（与 workflow.ActionBase 对齐） */
export interface DegradeFields {
  timeout?: number
  retry?: RetryConfig
}

const NO_RETRY: RetryConfig = { maxAttempts: 1, backoff: 'fixed', initialDelay: 0 }

/** 解析最终生效的降级配置：动作级 > Tool.defaults > 兜底（不超时、不重试） */
export function resolveDegrade(
  action: DegradeFields,
  tool: Tool,
): { timeout?: number; retry: RetryConfig } {
  return {
    timeout: action.timeout ?? tool.defaults?.timeout,
    retry: action.retry ?? tool.defaults?.retry ?? NO_RETRY,
  }
}
