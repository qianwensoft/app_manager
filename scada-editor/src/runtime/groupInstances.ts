import type { CanvasElement, GroupBinding, VirtualLayoutConfig } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { getPath, resolveTemplateValue, resolveExtDataReference } from './bindingData'

export interface GroupInstance {
  key: string
  groupId: string
  element: CanvasElement
  context: Record<string, unknown>
}

export interface VirtualContainerStyle {
  containerStyle: React.CSSProperties
  /** flex / grid 单元本身是否需要额外的样式（间距等） */
  cellStyle: React.CSSProperties
}

export interface ExpandedGroup {
  /** 与旧 API 兼容：所有展开后的子元素列表 */
  instances: GroupInstance[]
  /**
   * 虚拟容器（仅当 groupBinding.virtualLayout 存在时输出）：
   * - groupId 与 group 的 id 一致
   * - containerStyle / cellStyle 用来渲染 div
   * - items 是该容器下每个展开槽位的 key 与 context（不含 element；element 由 caller 自行组装）
   */
  virtualContainers: VirtualContainer[]
}

export interface VirtualContainer {
  groupId: string
  binding: GroupBinding
  layout: VirtualLayoutConfig
  containerStyle: React.CSSProperties
  cellStyle: React.CSSProperties
  items: Array<{
    key: string
    index: number
    context: Record<string, unknown>
    childElements: CanvasElement[] // 按 children 顺序展开后的所有子
  }>
}

/* -------------------------------------------------------------------------- */
/*                                   resolve items                             */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                            template param substitution                     */
/* -------------------------------------------------------------------------- */

/**
 * 把子元素中所有 {{item.xxx}} 占位符替换为 {{item.<mapped>}} （其中 mapped 来自
 * binding.paramFieldMap），并对 ${...} 表达式做一次注入：
 *   - 在 ${...} 表达式作用域中自动追加 const <paramName> = item.<mapped>;
 *     这样 el() / params / V() 等现有工具仍然有效。
 *
 * 同时对 extData / conditionalStyles / events / pointBinding.transform 等位置做同样的处理。
 */
function applyTemplateParamBindings(
  el: CanvasElement,
  binding: GroupBinding,
  context: Record<string, unknown>,
  allElements: CanvasElement[]
): CanvasElement {
  const cloned = structuredClone(el)
  const alias = binding.itemAlias || 'item'
  const map = binding.paramFieldMap ?? {}

  // 把 paramOverrides 合并到 context[itemAlias] 上，使 {{item.xxx}} / ${item.xxx}
  // 在 substituteTemplateWithFieldMap 之后都能拿到最终值。
  const overriddenContext = applyOverridesToContext(context, binding)

  /* 1) text */
  if (cloned.text) {
    cloned.text = substituteTemplateWithFieldMap(cloned.text, alias, map)
    cloned.text = resolveTemplateValue(cloned.text, overriddenContext)
    cloned.text = resolveExtDataReference(cloned.text, cloned, allElements)
  }

  /* 2) pointBinding.textTemplate */
  if (cloned.pointBinding?.textTemplate) {
    const baseBinding = cloned.pointBinding!
    const mappedTemplate = substituteTemplateWithFieldMap(baseBinding.textTemplate!, alias, map)
    let resolved = resolveTemplateValue(mappedTemplate, overriddenContext)
    resolved = resolveExtDataReference(resolved, cloned, allElements)
    cloned.pointBinding = { ...baseBinding, textTemplate: resolved }
  }

  /* 3) pointBinding.transform (JS 表达式) */
  if (cloned.pointBinding?.transform) {
    cloned.pointBinding = {
      ...cloned.pointBinding,
      transform: injectParamsIntoExpression(
        cloned.pointBinding.transform,
        binding,
        context,
        alias
      ),
    }
  }

  /* 4) conditionalStyles */
  if (cloned.conditionalStyles) {
    cloned.conditionalStyles = mapConditionStyles(cloned.conditionalStyles, binding, context, alias)
  }

  /* 5) events */
  if (cloned.events?.length) {
    cloned.events = cloned.events.map((ev) => {
      if (typeof ev.script !== 'string') return ev
      return { ...ev, script: injectParamsIntoExpression(ev.script, binding, context, alias) }
    })
  }

  /* 6) extData */
  if (cloned.extData) {
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(cloned.extData)) {
      let s = substituteTemplateWithFieldMap(v, alias, map)
      s = resolveTemplateValue(s, context)
      s = resolveExtDataReference(s, cloned, allElements)
      next[k] = s
    }
    cloned.extData = next
  }

  /* 7) chart staticData - JSON 内的 {{}} 也要替换 */
  if (cloned.pointBinding?.staticData) {
    cloned.pointBinding = {
      ...cloned.pointBinding,
      staticData: substituteStaticData(cloned.pointBinding.staticData, binding, context, alias),
    }
  }

  return cloned
}

function substituteTemplateWithFieldMap(
  text: string,
  alias: string,
  map: Record<string, string>
): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, inside: string) => {
    const trimmed = inside.trim()
    if (!trimmed.startsWith(`${alias}.`)) return match
    const name = trimmed.slice(alias.length + 1).trim()
    const mapped = map[name] ?? name
    return match.replace(trimmed, `${alias}.${mapped}`)
  })
}

function injectParamsIntoExpression(
  expr: string,
  binding: GroupBinding,
  context: Record<string, unknown>,
  alias: string
): string {
  // 1. 把 {{item.xxx}} 也重写为 ${item.xxx}，并替换映射
  const rewritten = expr.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, inside: string) => {
    const t = inside.trim()
    if (!t.startsWith(`${alias}.`)) return m
    const name = t.slice(alias.length + 1).trim()
    const mapped = binding.paramFieldMap?.[name] ?? name
    return `\${${alias}.${mapped}}`
  })
  // 2. 在作用域顶部注入 const <paramName> = item.<mapped>;
  const params = binding.params ?? []
  const map = binding.paramFieldMap ?? {}
  const overrides = binding.paramOverrides ?? {}
  const injection: string[] = []
  for (const p of params) {
    const mapped = map[p.name] ?? p.name
    if (overrides[p.name] !== undefined) {
      injection.push(`const ${p.name}=${JSON.stringify(overrides[p.name])};`)
    } else if (context[alias] && typeof context[alias] === 'object') {
      const sample = (context[alias] as Record<string, unknown>)[mapped]
      if (sample !== undefined) injection.push(`const ${p.name}=${JSON.stringify(sample)};`)
    }
  }
  if (!injection.length) return rewritten
  // 把表达式包成 IIFE，避免变量冲突污染外部作用域
  return `(function(){${injection.join('')}return (${rewritten});})()`
}

function mapConditionStyles(
  styles: NonNullable<CanvasElement['conditionalStyles']>,
  binding: GroupBinding,
  context: Record<string, unknown>,
  alias: string
): NonNullable<CanvasElement['conditionalStyles']> {
  const map = <T extends { condition?: string }>(arr?: T[]): T[] | undefined => {
    if (!arr) return arr
    return arr.map((r) => {
      if (!r.condition) return r
      return { ...r, condition: injectParamsIntoExpression(r.condition, binding, context, alias) }
    })
  }
  return {
    fontColor: map(styles.fontColor),
    fill: map(styles.fill),
    stroke: map(styles.stroke),
    backgroundColor: map(styles.backgroundColor),
  }
}

function substituteStaticData(
  data: Record<string, unknown>,
  binding: GroupBinding,
  context: Record<string, unknown>,
  alias: string
): Record<string, unknown> {
  const map = binding.paramFieldMap ?? {}
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      // chart staticData 内的 {{item.xxx}} 走与文本相同的替换路径
      let s = substituteTemplateWithFieldMap(v, alias, map)
      s = resolveTemplateValue(s, context)
      return s
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = walk(vv)
      return out
    }
    return v
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) out[k] = walk(v)
  return out
}

/**
 * 把 binding.paramOverrides 合并到 context[alias] 上：
 * - 若 alias 对应值是对象（最常见情况），把 overrides 作为顶层字段铺上去；
 * - 若 alias 对应值不是对象（如 string/number），则 overrides 完全替换 alias 值。
 *
 * 同时支持 mapping：如果 paramFieldMap 把 name 映射到了 mapped，则
 * override key 必须按 param name（不按 mapped）填入；函数会保留原 mapping 的
 * 同时再覆写 alias[mapped] = overrideValue，方便 resolveTemplateValue 直接命中。
 */
function applyOverridesToContext(context: Record<string, unknown>, binding: GroupBinding): Record<string, unknown> {
  const overrides = binding.paramOverrides
  if (!overrides || Object.keys(overrides).length === 0) return context
  const alias = binding.itemAlias || 'item'
  const map = binding.paramFieldMap ?? {}
  const next: Record<string, unknown> = { ...context }
  const cur = context[alias]
  const obj: Record<string, unknown> = (cur && typeof cur === 'object' && !Array.isArray(cur))
    ? { ...(cur as Record<string, unknown>) }
    : {}
  for (const [name, value] of Object.entries(overrides)) {
    const mapped = map[name] ?? name
    obj[mapped] = value
  }
  next[alias] = obj
  return next
}

/* -------------------------------------------------------------------------- */
/*                              virtual layout → css                          */
/* -------------------------------------------------------------------------- */

export function buildVirtualContainerStyle(layout: VirtualLayoutConfig, group: CanvasElement): VirtualContainerStyle {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: group.x,
    top: group.y,
    zIndex: group.zIndex,
    overflow: layout.overflow ?? 'visible',
  }

  // 容器尺寸
  if (layout.widthMode === 'fill') {
    base.width = '100%'
  } else if (layout.widthMode === 'hug') {
    base.width = 'max-content'
  } else if (layout.customWidth) {
    base.width = layout.customWidth
  } else {
    base.width = group.width
  }

  if (layout.heightMode === 'fill') {
    base.height = '100%'
  } else if (layout.heightMode === 'hug') {
    base.height = 'max-content'
  } else if (layout.customHeight) {
    base.height = layout.customHeight
  } else {
    base.height = group.height
  }

  if (layout.padding !== undefined) base.padding = layout.padding
  if (layout.background) base.background = layout.background
  if (layout.border) base.border = layout.border
  if (layout.borderRadius !== undefined) base.borderRadius = layout.borderRadius

  let containerStyle: React.CSSProperties = base
  let cellStyle: React.CSSProperties = {}

  if (layout.display === 'flex') {
    containerStyle = {
      ...base,
      display: 'flex',
      flexDirection: layout.flexDirection ?? 'row',
      flexWrap: layout.flexWrap ?? 'nowrap',
      justifyContent: layout.justifyContent ?? 'flex-start',
      alignItems: layout.alignItems ?? 'stretch',
      alignContent: layout.alignContent ?? 'stretch',
      gap: layout.gap ?? 0,
    }
  } else if (layout.display === 'grid') {
    const cols = layout.columns ?? 1
    containerStyle = {
      ...base,
      display: 'grid',
      gridTemplateColumns: layout.columnsAutoFit
        ? `repeat(auto-fit, minmax(${layout.columnsAutoFit.minWidth}px, 1fr))`
        : layout.columnWidth
          ? `repeat(${cols}, ${layout.columnWidth})`
          : `repeat(${cols}, 1fr)`,
      gridAutoRows: layout.rowHeight ?? 'auto',
      rowGap: layout.rowGap ?? layout.gap ?? 0,
      columnGap: layout.columnGap ?? layout.gap ?? 0,
      justifyItems: layout.alignItems ?? 'stretch',
      alignContent: layout.alignContent ?? 'stretch',
    }
  } else if (layout.display === 'flow') {
    const cols = layout.columns ?? 1
    containerStyle = {
      ...base,
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridAutoRows: layout.rowHeight ?? 'auto',
      rowGap: layout.rowGap ?? layout.gap ?? 0,
      columnGap: layout.columnGap ?? layout.gap ?? 0,
    }
  }

  // cell 本身不做特殊样式（子元素由其自身 x/y/width/height 决定；
  // 容器内的绝对定位仍生效，因为我们用 position:absolute 渲染每个子）
  cellStyle = { position: 'relative' }

  return { containerStyle, cellStyle }
}

/* -------------------------------------------------------------------------- */
/*                              expand (main entry)                           */
/* -------------------------------------------------------------------------- */

export function expandGroupInstances(elements: CanvasElement[], pointData: PointDataMap): GroupInstance[] {
  return expandGroupInstancesDetailed(elements, pointData).instances
}

/**
 * 与旧 expandGroupInstances 行为完全兼容，但额外返回虚拟容器信息（供需要 div 渲染的场景）。
 */
export function expandGroupInstancesDetailed(
  elements: CanvasElement[],
  pointData: PointDataMap
): ExpandedGroup {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const instances: GroupInstance[] = []
  const virtualContainers: VirtualContainer[] = []

  for (const group of elements.filter((element) => element.type === 'group' && element.groupBinding?.enabled)) {
    const binding = group.groupBinding!
    const items = resolveItems(binding, pointData).slice(0, Math.max(1, binding.maxInstances ?? 100))
    if (!items.length && binding.emptyBehavior !== 'template') continue
    const values = items.length ? items : [{}]
    const alias = binding.itemAlias || 'item'

    // ---- 虚拟 div 路径 ----
    if (binding.virtualLayout) {
      const layout = binding.virtualLayout
      const { containerStyle, cellStyle } = buildVirtualContainerStyle(layout, group)
      const containerItems: VirtualContainer['items'] = []

      values.forEach((item, index) => {
        const context = { [alias]: item, index, group }
        const key = String(getPath(item, binding.keyPath) ?? index)
        const childElements: CanvasElement[] = []
        for (const childId of group.children ?? []) {
          const child = byId.get(childId)
          if (!child) continue
          const expanded = applyTemplateParamBindings(child, binding, context, elements)
          expanded.id = `${group.id}:${key}:${child.id}`
          // 在虚拟容器内坐标归零：每个实例内的子元素保持与组内原坐标一致
          expanded.x = child.x - group.x
          expanded.y = child.y - group.y
          instances.push({ key, groupId: group.id, element: expanded, context })
          childElements.push(expanded)
        }
        containerItems.push({ key, index, context, childElements })
      })

      virtualContainers.push({
        groupId: group.id,
        binding,
        layout,
        containerStyle,
        cellStyle,
        items: containerItems,
      })
      continue
    }

    // ---- 旧 fixed-cell 路径（保留向后兼容） ----
    const columns = Math.max(1, binding.columns ?? (binding.layout === 'grid' ? 1 : values.length))
    const gapX = binding.gapX ?? 16
    const gapY = binding.gapY ?? 16

    values.forEach((item, index) => {
      const row = binding.layout === 'vertical' ? index : binding.layout === 'horizontal' ? 0 : Math.floor(index / columns)
      const col = binding.layout === 'vertical' ? 0 : binding.layout === 'horizontal' ? index : index % columns
      const context = { [alias]: item, index, group }
      const key = String(getPath(item, binding.keyPath) ?? index)
      for (const childId of group.children ?? []) {
        const child = byId.get(childId)
        if (!child) continue
        const expanded = applyTemplateParamBindings(child, binding, context, elements)
        expanded.id = `${group.id}:${key}:${child.id}`
        expanded.x = child.x + col * (group.width + gapX)
        expanded.y = child.y + row * (group.height + gapY)
        instances.push({ key, groupId: group.id, element: expanded, context })
      }
    })
  }
  return { instances, virtualContainers }
}

/* re-export 便于老代码引用 */
export { resolveTemplateValue, resolveExtDataReference }
