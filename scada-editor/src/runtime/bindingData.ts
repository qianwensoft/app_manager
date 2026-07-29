import type { PointDataMap } from '@/hooks/useStompPointData'
import type { CanvasElement } from '@/types'

export type BindingValue = string | number | boolean | null | BindingValue[] | { [key: string]: BindingValue }

export function parseBindingValue(value: unknown): BindingValue | undefined {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value as BindingValue[]
  if (typeof value === 'object') return value as BindingValue
  if (typeof value !== 'string') return undefined

  const text = value.trim()
  if (!text) return ''
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      return JSON.parse(text) as BindingValue
    } catch {
      return undefined
    }
  }
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return Number(text)
  if (text === 'true') return true
  if (text === 'false') return false
  return value
}

export function getPath(source: unknown, path?: string): unknown {
  if (!path) return source
  return path.replace(/\[([^\]]+)\]/g, '.$1').split('.').filter(Boolean).reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key]
    return undefined
  }, source)
}

export function toNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function flattenBindingValue(prefix: string, value: unknown, target: PointDataMap): void {
  target[prefix] = value
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenBindingValue(`${prefix}_${index}`, item, target))
  }
}

/** 全局接口键前缀：STOMP 服务端推送写入此命名空间（无法按元件区分） */
export const IFACE_GLOBAL_PREFIX = '__iface_'

/**
 * 接口字段键前缀。传入元件 id 时返回该元件专属命名空间，避免多个绑定同一接口
 * 的元件（如复制后修改参数）在共享 pointData 中互相覆盖；不传时回退到全局前缀。
 */
export function ifaceKeyPrefix(elId?: string): string {
  return elId ? `__ifx_${elId}__` : IFACE_GLOBAL_PREFIX
}

/** 读取接口字段：优先取元件专属键，回退到全局键（兼容 STOMP 推送） */
export function readIfaceField(pointData: PointDataMap, target: string, elId?: string): unknown {
  if (elId) {
    const scoped = pointData[`__ifx_${elId}__${target}`]
    if (scoped !== undefined) return scoped
  }
  return pointData[`${IFACE_GLOBAL_PREFIX}${target}`]
}

export function resolveTemplateValue(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, path: string) => {
    const value = getPath(context, path)
    return value === undefined || value === null ? match : String(value)
  })
}



/**
 * 解析扩展数据引用：
 * - {{ext:key}} 引用本组件的 extData[key]
 * - {{el:元素名:extKey}} 或 {{el:id:extKey}} 引用其他组件的 extData[extKey]
 *
 * @param template 原始模板字符串
 * @param selfEl 当前组件元素
 * @param allElements 所有元素数组，用于查找被引用的组件
 * @returns 解析后的字符串
 */
export function resolveExtDataReference(
  template: string | undefined,
  selfEl: CanvasElement,
  allElements: CanvasElement[]
): string {
  if (!template) return ''

  return template.replace(/\{\{\s*(ext:\w+|el:[^:}]+(?::\w+)?)\s*\}\}/g, (match, ref: string) => {
    const parts = ref.split(':')
    if (parts.length < 2) return match

    if (parts[0] === 'ext') {
      // 本组件扩展数据引用: {{ext:key}}
      const key = parts[1]
      return selfEl.extData?.[key] ?? match
    } else if (parts[0] === 'el') {
      // 其他组件扩展数据引用: {{el:元素名:extKey}} 或 {{el:id:extKey}}
      const targetNameOrId = parts[1]
      const targetKey = parts[2] ?? 'value'
      const target = allElements.find((e) => e.id === targetNameOrId || e.name === targetNameOrId)
      return target?.extData?.[targetKey] ?? match
    }
    return match
  })
}
