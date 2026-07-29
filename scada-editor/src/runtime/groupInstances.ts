import type { CanvasElement, GroupBinding } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { getPath, resolveTemplateValue, resolveExtDataReference } from './bindingData'

export interface GroupInstance {
  key: string
  groupId: string
  element: CanvasElement
  context: Record<string, unknown>
}

function resolveItems(binding: GroupBinding, pointData: PointDataMap): unknown[] {
  const source = binding.source ?? 'static'
  const raw = source === 'point' || source === 'interface'
    ? getPath(pointData, binding.path)
    : binding.value
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return raw } })() : raw
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

function resolveElementTemplates(
  element: CanvasElement,
  context: Record<string, unknown>,
  allElements: CanvasElement[]
): CanvasElement {
  const cloned = structuredClone(element)
  if (cloned.text) {
    cloned.text = resolveTemplateValue(cloned.text, context)
    // 解析扩展数据引用
    cloned.text = resolveExtDataReference(cloned.text, cloned, allElements)
  }
  if (cloned.pointBinding?.textTemplate) {
    cloned.pointBinding.textTemplate = resolveTemplateValue(cloned.pointBinding.textTemplate, context)
    cloned.pointBinding.textTemplate = resolveExtDataReference(cloned.pointBinding.textTemplate, cloned, allElements)
  }
  return cloned
}

export function expandGroupInstances(elements: CanvasElement[], pointData: PointDataMap): GroupInstance[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const instances: GroupInstance[] = []

  for (const group of elements.filter((element) => element.type === 'group' && element.groupBinding?.enabled)) {
    const binding = group.groupBinding!
    const items = resolveItems(binding, pointData).slice(0, Math.max(1, binding.maxInstances ?? 100))
    if (!items.length && binding.emptyBehavior !== 'template') continue
    const values = items.length ? items : [{}]
    const columns = Math.max(1, binding.columns ?? (binding.layout === 'grid' ? 1 : values.length))
    const gapX = binding.gapX ?? 16
    const gapY = binding.gapY ?? 16
    const alias = binding.itemAlias || 'item'

    values.forEach((item, index) => {
      const row = binding.layout === 'vertical' ? index : binding.layout === 'horizontal' ? 0 : Math.floor(index / columns)
      const col = binding.layout === 'vertical' ? 0 : binding.layout === 'horizontal' ? index : index % columns
      const context = { [alias]: item, index, group }
      const key = String(getPath(item, binding.keyPath) ?? index)
      for (const childId of group.children ?? []) {
        const child = byId.get(childId)
        if (!child) continue
        const expanded = resolveElementTemplates(child, context, elements)
        expanded.id = `${group.id}:${key}:${child.id}`
        expanded.x = child.x + col * (group.width + gapX)
        expanded.y = child.y + row * (group.height + gapY)
        instances.push({ key, groupId: group.id, element: expanded, context })
      }
    })
  }
  return instances
}
