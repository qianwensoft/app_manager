/**
 * ElementScope — 工作流引擎的核心适配层。
 *
 * 把 `ElementSelector`（by id / by name-path / groupBinding 模板实例）解析成运行时元素，
 * 并把「读写任意属性 / 注入绑定值」翻译为对 editorStore 或运行时覆盖层的变更。
 *
 * 两种落地：
 *  - 编辑器内（试跑）：直接调 editorStore.updateElement 改元素属性
 *  - 运行时（preview/发布/分享）：改运行时元素副本 + pointData 覆盖层（不触碰 store）
 *
 * setBinding 写入 pointData 覆盖层的键，遵循 bindingResolver 的查找规则：
 *  - point/simulation/trend：写 binding 主键（pointKey/linkName/simLinkName/trendKeys[0]）
 *  - interface：写元件专属 `__ifx_<id>__value` 键
 *  - static：无覆盖层可写，回退为直接改元素 staticData（仅编辑器内有意义）
 */
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { ElementSelector } from '@/types/workflow'
import type { ElementScope } from './types'
import { bindingDataKey } from '@/runtime/bindingResolver'

/** 从模板实例 id 中剥离前缀：`<groupId>:<key>:<childId>` → 原始 childId */
function baseElementId(id: string): string {
  const parts = id.split(':')
  return parts.length >= 3 ? parts.slice(2).join(':') : id
}

/** 取模板实例 id 的 key 段（`<groupId>:<key>:<childId>` → key） */
function instanceKeyOf(id: string): string | undefined {
  const parts = id.split(':')
  return parts.length >= 3 ? parts[1] : undefined
}

/** 是否为模板实例 id */
function isInstanceId(id: string): boolean {
  return id.split(':').length >= 3
}

/** 按名称路径匹配：`组合名.子元素名` 或单段 `名称` */
function matchesNamePath(el: CanvasElement, elements: CanvasElement[], ref: string): boolean {
  const segs = ref.split('.').map((s) => s.trim()).filter(Boolean)
  if (segs.length === 0) return false
  if (segs.length === 1) return el.name === segs[0]
  // 多段：末段匹配元素名，前段沿 group.children 逆向匹配父组合名
  if (el.name !== segs[segs.length - 1]) return false
  const parentName = segs[segs.length - 2]
  const parent = elements.find(
    (g) => g.type === 'group' && g.children?.includes(baseElementId(el.id)),
  )
  return !!parent && parent.name === parentName
}

/** 写点路径（支持 properties.a.b）；就地修改 target */
function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> = target
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

/** 读点路径 */
function getByPath(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, k) => {
    if (cur && typeof cur === 'object') return (cur as Record<string, unknown>)[k]
    return undefined
  }, target)
}

export interface ElementScopeDeps {
  /** 运行时元素集合（含展开的模板实例） */
  getElements: () => CanvasElement[]
  /** 应用元素属性变更（编辑器→store.updateElement；运行时→本地副本 setState） */
  applyProp: (elementId: string, updates: Partial<CanvasElement>) => void
  /** 写 pointData 覆盖层（运行时绑定注入） */
  writePointOverride?: (key: string, value: unknown) => void
}

/** 构造 ElementScope 适配层 */
export function createElementScope(deps: ElementScopeDeps): ElementScope {
  const resolve = (sel: ElementSelector): CanvasElement[] => {
    const elements = deps.getElements()
    if (!sel || !sel.ref) return []
    if (sel.by === 'id') {
      return elements.filter((el) => {
        if (el.id === sel.ref) return true
        // 模板实例：基础 id 命中，且 instanceKey（若指定）匹配
        if (isInstanceId(el.id) && baseElementId(el.id) === sel.ref) {
          if (sel.instanceKey === undefined || sel.instanceKey === '') return true
          return instanceKeyOf(el.id) === String(sel.instanceKey)
        }
        return false
      })
    }
    // by name / name-path
    return elements.filter((el) => matchesNamePath(el, elements, sel.ref))
  }

  const getProp = (sel: ElementSelector, prop: string): unknown => {
    const els = resolve(sel)
    if (els.length === 0) return undefined
    return getByPath(els[0], prop)
  }

  const setProp = (sel: ElementSelector, prop: string, value: unknown): void => {
    const els = resolve(sel)
    for (const el of els) {
      // 顶层属性直接 patch；点路径需克隆嵌套对象后整体替换
      if (!prop.includes('.')) {
        deps.applyProp(el.id, { [prop]: value } as Partial<CanvasElement>)
      } else {
        const rootKey = prop.split('.')[0] as keyof CanvasElement
        const cloned = structuredClone((el[rootKey] ?? {}) as Record<string, unknown>)
        const restPath = prop.split('.').slice(1).join('.')
        setByPath(cloned, restPath, value)
        deps.applyProp(el.id, { [rootKey]: cloned } as unknown as Partial<CanvasElement>)
      }
    }
  }

  const setBinding = (sel: ElementSelector, value: unknown): void => {
    const els = resolve(sel)
    for (const el of els) {
      const pb = el.pointBinding
      const mode = pb?.mode ?? 'point'
      if (mode === 'interface') {
        deps.writePointOverride?.(`__ifx_${el.id}__value`, value)
        continue
      }
      const key = bindingDataKey(pb)
      if (key && key !== '__static_value' && key !== '__iface_value') {
        deps.writePointOverride?.(key, value)
      } else {
        // static / 无绑定：直接写元素 staticData（仅编辑器内可见）
        const cloned = structuredClone((pb ?? {}) as Record<string, unknown>)
        const sd = (cloned.staticData ?? {}) as Record<string, unknown>
        sd.value = value
        cloned.staticData = sd
        cloned.mode = mode
        deps.applyProp(el.id, { pointBinding: cloned as CanvasElement['pointBinding'] })
      }
    }
  }

  return { resolve, getProp, setProp, setBinding }
}

/** 从覆盖层写函数构造 pointData 覆盖工具（供运行时使用） */
export function makePointOverrideWriter(
  setOverride: (updater: (prev: PointDataMap) => PointDataMap) => void,
): (key: string, value: unknown) => void {
  return (key, value) => setOverride((prev) => ({ ...prev, [key]: value }))
}
