import { antdComponents } from './antd'

export type LibraryKey = 'antd' | 'antd-mobile'

export type ComponentRegistry = Record<string, any>

/** 预览/运行时可选的组件库列表（供设计器「预览终端」下拉用）。 */
export const libraryRegistries: { key: LibraryKey; label: string; end: 'desktop' | 'mobile' }[] = [
  { key: 'antd', label: '桌面 (antd)', end: 'desktop' },
  { key: 'antd-mobile', label: '移动 / H5 (antd-mobile)', end: 'mobile' },
]

// 移动库较重且会引入 antd-mobile 样式，按需动态加载，避免桌面场景白白增大首包。
let mobileCache: ComponentRegistry | null = null

/**
 * 取指定库的组件表。antd 同步返回；antd-mobile 首次调用动态 import。
 * 调用方需在拿到组件表后再渲染（见 SchemaFormRenderer 的 ready 状态）。
 */
export async function loadLibrary(key: LibraryKey): Promise<ComponentRegistry> {
  if (key === 'antd-mobile') {
    if (!mobileCache) {
      const mod = await import('./antdMobile')
      mobileCache = mod.antdMobileComponents
    }
    return mobileCache
  }
  return antdComponents
}

/** 同步取库；移动库未预加载时回退桌面，保证不阻塞。 */
export function getLibrarySync(key: LibraryKey): ComponentRegistry {
  if (key === 'antd-mobile' && mobileCache) return mobileCache
  return antdComponents
}
