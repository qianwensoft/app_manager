/**
 * 全局上下文单例：跨画布常驻的内存态上下文。
 *
 * 类 form-app AppState，但因 SCADA 单组态单实例，这里用模块单例即可。
 * 页面刷新即重置。切换组态时应调用 resetGlobalContext() 清空。
 */
import type { ContextStore } from './types'
import { createContextStore } from './contextStore'

let instance: ContextStore | null = null

/** 取全局上下文单例（惰性创建） */
export function getGlobalContext(): ContextStore {
  if (!instance) instance = createContextStore()
  return instance
}

/** 重置全局上下文（切换组态 / 退出预览时调用） */
export function resetGlobalContext(): void {
  instance = createContextStore()
}
