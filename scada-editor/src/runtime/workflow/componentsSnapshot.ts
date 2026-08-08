/**
 * 组件快照：把画布上所有组件的「当前参数 + 扩展属性 + 当前值」归集为一份
 * 可被全局上下文 / 工作流上下文 / 表达式统一访问的结构。
 *
 * 访问形态（挂到 global context 的 `components` 键下）：
 *   $global.components["<名称>"].value               → 当前绑定值
 *   $global.components["<名称>"].params.*            → 扩展属性（el.properties.*）
 *   $global.components["<名称>"].ext.*               → 扩展数据（el.extData.*）
 *   $global.components["<名称>"].chart.*             → 图表配置（properties.chartConfig.*）
 *   $global.components["<名称>"].conditionalStyles.* → 条件样式规则（原始配置）
 *   $global.components["<名称>"].conditionalResult.* → 条件样式执行结果（当前命中色）
 * 同名以 id 兜底：components["<id>"] 亦可访问，避免重名/无名冲突。
 */
import type { CanvasElement, ConditionalStyles } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { ExpressionScope } from '@/runtime/expression'
import { getPath, readIfaceField } from '@/runtime/bindingData'
import { resolveElementDisplayValue } from '@/runtime/bindingResolver'
import { resolveConditionalStyles } from '@/runtime/conditionalStyles'

export interface ComponentSnapshot {
  id: string
  name: string
  type: string
  /** 当前绑定值（尽力解析：point/simulation/interface 单值） */
  value: unknown
  /** 扩展属性（el.properties.*，不含内部大对象 chartConfig 原样展开在 chart 下） */
  params: Record<string, unknown>
  /** 扩展数据（组件间引用用的 kv） */
  ext: Record<string, string>
  /** 图表配置（若为图表组件） */
  chart?: Record<string, unknown>
  /** 位置尺寸 */
  x?: number
  y?: number
  width?: number
  height?: number
  /** 文本内容（若有） */
  text?: string
  visible?: boolean
  /** 条件样式规则（原始配置：fontColor/fill/stroke/backgroundColor 的规则数组） */
  conditionalStyles?: ConditionalStyles
  /** 条件样式执行结果（当前命中规则计算出的颜色；未命中则该项缺省） */
  conditionalResult?: {
    fontColor?: string
    fill?: string
    stroke?: string
    backgroundColor?: string
  }
}

/** 判断元件是否配置了任意条件样式规则 */
function hasConditionalRules(cs?: ConditionalStyles): boolean {
  if (!cs) return false
  return !!(cs.fontColor?.length || cs.fill?.length || cs.stroke?.length || cs.backgroundColor?.length)
}

/** 尽力解析单个元件的「当前原始值」——用于快照 value（表达式数值取用，未经格式化） */
function resolveElementValue(el: CanvasElement, pointData: PointDataMap): unknown {
  const pb = el.pointBinding
  if (!pb) return el.text ?? undefined
  const mode = pb.mode ?? 'point'
  if (mode === 'point' && pb.pointKey) return getPath(pointData, pb.pointKey)
  if (mode === 'simulation' && pb.simLinkName) return pointData[pb.simLinkName]
  if (mode === 'static') {
    const sd = pb.staticData ?? {}
    return sd.value ?? sd[pb.pointKey ?? 'value'] ?? pb.staticData
  }
  if (mode === 'trend' && pb.trendKeys?.[0]) return pointData[pb.trendKeys[0]]
  // interface 模式：优先字段映射 value/text（元件专属键→全局键），再退化到 series_0
  const mapped = readIfaceField(pointData, 'value', el.id) ?? readIfaceField(pointData, 'text', el.id)
  if (mapped !== undefined) return mapped
  const scoped = `__ifx_${el.id}__series_0`
  if (pointData[scoped] !== undefined) return pointData[scoped]
  if (pointData.__iface_series_0 !== undefined) return pointData.__iface_series_0
  return el.text ?? undefined
}

/** 构建单个组件快照 */
export function buildComponentSnapshot(el: CanvasElement, pointData: PointDataMap, baseScope?: ExpressionScope): ComponentSnapshot {
  const props = (el.properties ?? {}) as Record<string, unknown>
  const chart = props.chartConfig as Record<string, unknown> | undefined
  const params: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'chartConfig') continue
    params[k] = v
  }
  // text：优先展示实际渲染值（含接口字段映射 / 模板 / 格式化），回退到静态文本
  const displayText = resolveElementDisplayValue(el, pointData) ?? el.text

  const snap: ComponentSnapshot = {
    id: el.id,
    name: el.name || el.id,
    type: el.type,
    value: resolveElementValue(el, pointData),
    params,
    ext: { ...(el.extData ?? {}) },
    chart: chart ? { ...chart } : undefined,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    text: displayText,
    visible: el.visible,
  }

  // 条件样式：附带原始规则与当前执行结果，供全局上下文查看与表达式取用
  // （C('名','conditionalResult.fontColor') 等）。仅在配置了规则时写入，避免噪声。
  if (hasConditionalRules(el.conditionalStyles)) {
    snap.conditionalStyles = el.conditionalStyles
    // 结果计算依赖表达式作用域（v/text/ext/el() 等）；缺省时用最小作用域兜底。
    const scope: ExpressionScope = baseScope ?? { elements: [el], point: pointData }
    snap.conditionalResult = resolveConditionalStyles(el, pointData, scope)
  }

  return snap
}

/**
 * 构建全部组件快照映射。
 * key 同时包含名称与 id（名称优先；无名或重名时 id 兜底始终存在）。
 */
export function buildComponentsSnapshot(
  elements: CanvasElement[],
  pointData: PointDataMap,
  baseScope?: ExpressionScope,
): Record<string, ComponentSnapshot> {
  const out: Record<string, ComponentSnapshot> = {}
  const nameCount: Record<string, number> = {}
  // 条件样式结果依赖表达式作用域中的 elements（el() 访问其它组件）。调用方未传时，
  // 用当前 elements + pointData 兜底，保证 el('阈值组件','extData.max') 等能解析。
  const scope: ExpressionScope = baseScope ?? { elements, point: pointData }
  for (const el of elements) {
    if (el.type === 'group') continue
    const snap = buildComponentSnapshot(el, pointData, scope)
    // id 键始终可用
    out[el.id] = snap
    // 名称键：仅当无冲突时占用；冲突则保留首个并计数
    const nm = el.name?.trim()
    if (nm) {
      nameCount[nm] = (nameCount[nm] ?? 0) + 1
      if (nameCount[nm] === 1) out[nm] = snap
    }
  }
  return out
}
