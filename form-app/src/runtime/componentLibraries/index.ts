import { antdComponents } from './antd'
import { shadcnComponents } from './shadcn'

export type LibraryKey = 'shadcn' | 'antd'

export type ComponentRegistry = Record<string, any>

/** 预览/运行时可选的组件库列表（供设计器「预览终端」下拉用）。 */
export const libraryRegistries: { key: LibraryKey; label: string; end: 'desktop' | 'mobile' }[] = [
  { key: 'shadcn', label: '桌面 (shadcn/ui)', end: 'desktop' },
  { key: 'antd', label: '桌面 (antd 旧版)', end: 'desktop' },
]

/**
 * 取指定库的组件表。shadcn/antd 同步返回。
 * 调用方需在拿到组件表后再渲染（见 SchemaFormRenderer 的 ready 状态）。
 */
export async function loadLibrary(key: LibraryKey): Promise<ComponentRegistry> {
  if (key === 'antd') return antdComponents
  return shadcnComponents
}

/** 同步取库。 */
export function getLibrarySync(key: LibraryKey): ComponentRegistry {
  if (key === 'antd') return antdComponents
  return shadcnComponents
}
