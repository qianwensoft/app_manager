/**
 * 终端解析：决定某页面在当前环境用哪个组件库渲染（多端适配核心）。
 *
 * 规则（与记忆 form-app-page-designer-direction 对齐）：
 * - 页面可在 config_json.end_strategy 配置 { mode:'auto'|'force', forced:'desktop'|'mobile' }。
 * - mode='force'：强制用 forced 指定的终端对应库（管理员可让某页在桌面也走移动版）。
 * - mode='auto'（默认）：按运行环境探测 → 桌面=antd，移动=antd-mobile。
 */
import type { LibraryKey } from './componentLibraries'

export type EndType = 'desktop' | 'mobile'

export interface EndStrategy {
  mode?: 'auto' | 'force'
  forced?: EndType
}

/** Agent 内嵌 WebView 暴露的桥（存在即认为是移动 App 端）。 */
function hasAndroidBridge(): boolean {
  return typeof window !== 'undefined' && !!(window as any).AndroidBridge
}

/** 探测当前运行环境属于桌面还是移动 / H5。 */
export function detectEnd(): EndType {
  if (typeof window === 'undefined') return 'desktop'
  // Agent App 内嵌 WebView → 移动
  if (hasAndroidBridge()) return 'mobile'
  const ua = navigator.userAgent || ''
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MicroMessenger/i.test(ua)
  const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window
  const narrow = window.innerWidth > 0 && window.innerWidth <= 768
  // UA 命中，或（窄屏且触屏）→ 移动
  if (mobileUA) return 'mobile'
  if (narrow && touch) return 'mobile'
  return 'desktop'
}

/** 终端类型 → 组件库 key。 */
export function endToLibrary(end: EndType): LibraryKey {
  return end === 'mobile' ? 'antd-mobile' : 'antd'
}

/**
 * 根据页面 end_strategy + 运行环境，解析最终使用的组件库。
 * @param strategy 页面 config_json.end_strategy（可空）
 */
export function resolveLibrary(strategy?: EndStrategy | null): LibraryKey {
  if (strategy && strategy.mode === 'force' && strategy.forced) {
    return endToLibrary(strategy.forced)
  }
  return endToLibrary(detectEnd())
}
