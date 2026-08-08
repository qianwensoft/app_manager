import { useRef, useEffect } from 'react'
import * as echarts from 'echarts'
import type { CanvasElement, PointBinding } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { mergeAnimStyle } from '@/runtime/animationExecutor'
import { getStyleValue, type StyleFieldDef, chartSchema } from '@/schema/chartSchema'
import { applyFormatter } from '@/hooks/useInterfaceBindingData'
import { parseBindingValue, toNumber, getPath, type BindingValue } from '@/runtime/bindingData'
import { getGlobalContext } from '@/runtime/workflow/globalContext'
import { interpolateExpression, type ExpressionScope } from '@/runtime/expression'
import type { ChartKeySource } from '@/types'

interface Props {
  el: CanvasElement
  zoom: number
  pointData?: PointDataMap
}

function applyTransform(raw: unknown, transform?: string): number {
  const value = toNumber(raw)
  if (!transform) return value
  try {
    // eslint-disable-next-line no-new-func
    return Number(new Function('v', `return (${transform})`)(value))
  } catch {
    return value
  }
}

/** 从 chartConfig 读取 styleField 值的快捷函数 */
function sv<T>(cfg: Record<string, unknown>, key: string, def: T): T {
  const schema = { key, default: def } as StyleFieldDef
  return getStyleValue<T>(cfg, schema)
}

/** 解析逗号分隔的颜色字符串 */
function parseColors(s: string): string[] {
  return s.split(',').map((c) => c.trim()).filter(Boolean)
}

/** 解析可选最大值：空串或非数字返回 undefined（ECharts 自适应） */
function parseAxisMax(s: string): number | undefined {
  const n = Number(s)
  return s.trim() && Number.isFinite(n) ? n : undefined
}

interface DualAxisCfg {
  enabled: boolean
  axis2From: number
  axis1Name: string
  axis2Name: string
  axis1Max: number | undefined
  axis2Max: number | undefined
}

/** 从 chartConfig 读取双数值轴配置 */
function readDualAxis(cfg: Record<string, unknown>): DualAxisCfg {
  return {
    enabled: sv(cfg, 'dualValueAxis', false),
    axis2From: Math.max(0, Math.floor(sv(cfg, 'axis2FromSeries', 1))),
    axis1Name: sv(cfg, 'axis1Name', ''),
    axis2Name: sv(cfg, 'axis2Name', ''),
    axis1Max: parseAxisMax(sv(cfg, 'axis1Max', '')),
    axis2Max: parseAxisMax(sv(cfg, 'axis2Max', '')),
  }
}

/** 构建纵向直角坐标系图表的数值 Y 轴（单轴或左右双轴） */
function buildValueYAxis(
  da: DualAxisCfg,
  yAxisColor: string,
  splitLineColor: string,
  axis2Color: string,
): echarts.EChartsOption['yAxis'] {
  const primary = {
    type: 'value' as const,
    name: da.axis1Name || undefined,
    max: da.axis1Max,
    axisLine: { lineStyle: { color: yAxisColor } },
    splitLine: { lineStyle: { color: splitLineColor } },
  }
  if (!da.enabled) return primary
  return [primary, {
    type: 'value' as const,
    name: da.axis2Name || undefined,
    max: da.axis2Max,
    position: 'right' as const,
    axisLine: { show: true, lineStyle: { color: axis2Color } },
    splitLine: { show: false },
  }]
}

/** 解析仪表盘颜色段 "0.3:#27ae60,0.7:#e67e22,1:#c0392b" */
function parseGaugeColors(s: string): [number, string][] {
  return s.split(',').map((seg) => {
    const [ratio, color] = seg.trim().split(':')
    return [parseFloat(ratio), color?.trim() ?? '#ccc'] as [number, string]
  }).filter(([r]) => !isNaN(r))
}

/**
 * 解析 ChartKeySource（组件属性 / 全局上下文）为具体值。
 * - component：ref 形如 `<组件名或id>.ext.flow` / `.value` / `.params.max`；
 *   在 global.components 快照中按第一段定位组件，其余路径 getPath。
 * - global：ref 为全局上下文中的点分路径。
 */
function resolveKeySourceValue(src: ChartKeySource): unknown {
  const ref = src.ref?.trim()
  if (!ref) return undefined
  const ctx = getGlobalContext().getAll() as Record<string, unknown>
  if (src.type === 'global') return getPath(ctx, ref)
  if (src.type === 'component') {
    const components = (ctx.components ?? {}) as Record<string, unknown>
    const dot = ref.indexOf('.')
    const compKey = dot === -1 ? ref : ref.slice(0, dot)
    const rest = dot === -1 ? '' : ref.slice(dot + 1)
    const comp = components[compKey]
    if (comp === undefined) return undefined
    return rest ? getPath(comp, rest) : comp
  }
  return undefined
}

/**
 * 把一个「非 key 来源」的系列/分类解析并注入合成键。
 * 返回该系列对应的合成 key 数组（写进 seriesKeys），值写入 syntheticData。
 */
function injectSourceSeries(
  src: ChartKeySource,
  slot: string,
  syntheticData: PointDataMap,
): string[] {
  const value = resolveKeySourceValue(src)
  if (Array.isArray(value)) {
    const keys: string[] = []
    value.forEach((item, i) => {
      const k = `__src_${slot}_${i}`
      syntheticData[k] = item as never
      keys.push(k)
    })
    return keys
  }
  const k = `__src_${slot}`
  syntheticData[k] = (value ?? 0) as never
  return [k]
}

/**
 * 构建静态数据表达式作用域：从全局上下文取 global / components 快照，
 * 并把组件快照还原成 elements（含 extData），支持 el('名','extData:max')。
 */
function buildStaticExprScope(rawPointData: PointDataMap): ExpressionScope {
  const global = getGlobalContext().getAll() as Record<string, unknown>
  const components = (global.components ?? {}) as Record<string, Record<string, unknown>>
  // 还原伪元素：把快照字段对齐真实 CanvasElement，并添加常用别名
  // - extData / ext 均可访问扩展数据（el('名','extData:max') / el('名','ext:max')）
  // - text / 内容 / content 均指向 value（绑定显示值），优于静态文本
  const elements = Object.values(components).reduce<Record<string, unknown>[]>((acc, snap) => {
    if (snap && !acc.some((e) => e.id === snap.id)) {
      const displayValue = snap.value ?? snap.text
      acc.push({
        ...snap,
        extData: snap.ext,
        properties: snap.params,
        value: displayValue,
        text: displayValue,
        内容: displayValue,
        content: displayValue,
      })
    }
    return acc
  }, [])
  return {
    point: rawPointData,
    global,
    components,
    elements: elements as never,
  }
}

/**
 * 把 `{{组件名:属性}}` 快捷写法标准化为 `{{el('组件名', '属性')}}` 函数调用形式。
 * 仅当占位符内不含括号（非函数调用）时才做转换，避免影响正常 JS 表达式。
 * 支持含汉字/连字符的组件名，如 `{{库存-过检:text}}`、`{{过检-配置:extData:max}}`。
 */
function normalizeTemplateShorthand(text: string): string {
  return text.replace(/\{\{\s*([^{}()]+?)\s*\}\}/g, (_m, inner: string) => {
    const trimmed = inner.trim()
    // 已包含 ( 的视为函数调用，直接放行
    if (trimmed.includes('(')) return `{{${trimmed}}}`
    // 含 : 的解析为 组件名:属性[:子属性]，转为 el('名', '属性[:子属性]')
    const colon = trimmed.indexOf(':')
    if (colon > 0) {
      const name = trimmed.slice(0, colon).trim()
      const prop = trimmed.slice(colon + 1).trim()
      return `{{el('${name}', '${prop}')}}`
    }
    return `{{${trimmed}}}`
  })
}

/**
 * 解析静态值：支持扩展参数 / 全局上下文表达式。
 * - 含 `{{...}}`：先把 `{{name:prop}}` 快捷写法转为 `{{el('name','prop')}}`，
 *   再按模板插值（内部可用 el()/C()/G() 等），替换后按 JSON/标量解析。
 * - 纯标量/JSON：直接 parseBindingValue。
 */
function resolveStaticValue(raw: unknown, scope: ExpressionScope): BindingValue | undefined {
  if (typeof raw !== 'string') return parseBindingValue(raw)
  const text = raw.trim()
  if (!text) return ''
  // 模板插值：{{ 表达式 }} → 求值结果（数字/字符串），再解析整串
  if (text.includes('{{')) {
    const normalized = normalizeTemplateShorthand(text)
    const filled = normalized.replace(/\{\{\s*([\s\S]+?)\s*\}\}/g, (_m, expr: string) => {
      const v = interpolateExpression(`\${${expr}}`, scope)
      return v === undefined || v === null ? '' : String(v)
    })
    return parseBindingValue(filled)
  }
  // 数组/对象字面量内可能直接含表达式（如 [el('库存','extData:max'),1,2,3]）
  if ((text.startsWith('[') || text.startsWith('{')) && /\b(el|C|G|P|V|url)\s*\(/.test(text)) {
    const evaluated = interpolateExpression(`\${${text}}`, scope)
    if (evaluated !== undefined) return evaluated as BindingValue
  }
  return parseBindingValue(raw)
}

/**
 * Resolve effective point data for a chart element.
 * - point/simulation mode: use pointData as-is with pb.chartSeriesKeys
 * - static mode: pull from pb.staticData and inject into pointData-compatible keys
 * - interface mode: read __iface_series_* keys from pointData
 */
function resolveChartData(pb: PointBinding | undefined, rawPointData: PointDataMap, elId?: string): {
  seriesKeys: string[][]
  categoryKey: string | undefined
  pointData: PointDataMap
} {
  if (!pb) return { seriesKeys: [], categoryKey: undefined, pointData: rawPointData }

  const mode = pb.mode ?? 'point'

  if (mode === 'static') {
    const sd = pb.staticData ?? {}
    const syntheticData: PointDataMap = {}
    const seriesKeys: string[][] = []
    let categoryKey: string | undefined
    const scope = buildStaticExprScope(rawPointData)

    // 系列键按数字后缀（series0/series1…）升序，保证与 chartSeriesNames/Colors 下标对齐；
    // 其余非系列、非分类键保持原有顺序追加（兼容单值等旧数据）。
    const seriesEntries = Object.keys(sd)
      .filter((k) => /^series\d+$/.test(k))
      .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
    const otherEntries = Object.keys(sd).filter((k) => k !== 'category' && !/^series\d+$/.test(k))

    const pushValue = (key: string, raw: unknown) => {
      const value = resolveStaticValue(raw, scope)
      if (value === undefined) { seriesKeys.push([]); return }
      if (Array.isArray(value)) {
        const keys: string[] = []
        value.forEach((item, index) => {
          const dataKey = `__static_${key}_${index}`
          syntheticData[dataKey] = item
          keys.push(dataKey)
        })
        seriesKeys.push(keys)
      } else if (value === '') {
        // 空系列：保留占位以维持后续系列的下标对齐
        seriesKeys.push([])
      } else {
        const dataKey = `__static_${key}`
        syntheticData[dataKey] = value
        seriesKeys.push([dataKey])
      }
    }

    seriesEntries.forEach((key) => pushValue(key, sd[key]))
    otherEntries.forEach((key) => pushValue(key, sd[key]))

    const catRaw = sd['category']
    if (catRaw !== undefined) {
      const value = resolveStaticValue(catRaw, scope)
      if (value !== undefined) {
        const arr = Array.isArray(value)
          ? value
          : typeof value === 'string'
            ? value.split(',').map((s) => s.trim()).filter(Boolean)
            : [String(value)]
        categoryKey = '__static_category'
        syntheticData[categoryKey] = arr.map(String)
      }
    }
    return { seriesKeys, categoryKey, pointData: { ...rawPointData, ...syntheticData } }
  }

  if (mode === 'interface') {
    // 优先取元件专属键（浏览器轮询），回退到全局键（STOMP 推送）
    const scopedPrefix = elId ? `__ifx_${elId}__` : ''
    const hasScopedSeries = !!scopedPrefix && (
      rawPointData[`${scopedPrefix}series_0`] !== undefined ||
      rawPointData[`${scopedPrefix}series_0_0`] !== undefined
    )
    const prefix = hasScopedSeries ? scopedPrefix : '__iface_'

    const seriesKeys: string[][] = []
    let idx = 0
    while (true) {
      const keys: string[] = []
      let i = 0
      while (rawPointData[`${prefix}series_${idx}_${i}`] !== undefined) {
        keys.push(`${prefix}series_${idx}_${i}`)
        i++
      }
      if (rawPointData[`${prefix}series_${idx}`] !== undefined) {
        keys.push(`${prefix}series_${idx}`)
      }
      if (keys.length === 0) break
      seriesKeys.push(keys)
      idx++
    }
    const scopedCategory = scopedPrefix ? `${scopedPrefix}category` : ''
    const categoryKey = scopedCategory && rawPointData[scopedCategory] !== undefined
      ? scopedCategory
      : rawPointData.__iface_category !== undefined
        ? '__iface_category'
        : undefined
    return { seriesKeys, categoryKey, pointData: rawPointData }
  }

  if (mode === 'simulation') {
    // simLinkName is the STOMP point key pushed by the sim engine.
    // For gauge/single-value charts, inject it as seriesKeys[0][0] so
    // existing case logic can find it. For multi-series charts, fall
    // back to chartSeriesKeys if explicitly configured.
    const simKey = pb.simLinkName
    if (simKey && (!pb.chartSeriesKeys || pb.chartSeriesKeys.length === 0)) {
      return {
        seriesKeys: [[simKey]],
        categoryKey: pb.chartCategoryKey,
        pointData: rawPointData,
      }
    }
    return {
      seriesKeys: pb.chartSeriesKeys ?? [],
      categoryKey: pb.chartCategoryKey,
      pointData: rawPointData,
    }
  }

  // point mode (default)
  const baseSeriesKeys = pb.chartSeriesKeys ?? []
  const sources = pb.chartSeriesSources
  const catSource = pb.chartCategorySource
  const hasSources = (sources?.some((s) => s && s.type !== 'key')) || (catSource && catSource.type !== 'key')

  if (!hasSources) {
    return {
      seriesKeys: baseSeriesKeys,
      categoryKey: pb.chartCategoryKey,
      pointData: rawPointData,
    }
  }

  // 混合来源：为「组件/全局」来源生成合成键，其余保留原数据键
  const syntheticData: PointDataMap = {}
  const seriesKeys: string[][] = baseSeriesKeys.map((keys, i) => {
    const src = sources?.[i]
    if (src && src.type !== 'key') return injectSourceSeries(src, `s${i}`, syntheticData)
    return keys
  })
  let categoryKey = pb.chartCategoryKey
  if (catSource && catSource.type !== 'key') {
    const value = resolveKeySourceValue(catSource)
    if (Array.isArray(value)) {
      categoryKey = '__src_category'
      syntheticData[categoryKey] = value.map(String) as never
    }
  }
  return { seriesKeys, categoryKey, pointData: { ...rawPointData, ...syntheticData } }
}

function buildOption(el: CanvasElement, rawPointData: PointDataMap): echarts.EChartsOption {
  const cfg = (el.properties?.chartConfig ?? {}) as Record<string, unknown>
  const pb = el.pointBinding
  const { seriesKeys, categoryKey, pointData } = resolveChartData(pb, rawPointData, el.id)
  const transform = pb?.transform

  // 共用 title / bg
  const titleText = sv(cfg, 'title', '')
  const titleColor = sv(cfg, 'titleColor', '#cccccc')
  const titleSize = sv(cfg, 'titleSize', 12)
  const bgColor = sv(cfg, 'bgColor', 'transparent')

  const titleOpt = titleText
    ? { text: titleText, textStyle: { color: titleColor, fontSize: titleSize } }
    : undefined

  const base: echarts.EChartsOption = {
    backgroundColor: bgColor,
    animation: false,
    textStyle: { color: '#aaa', fontSize: 11 },
    ...(titleOpt ? { title: titleOpt } : {}),
  }

  switch (el.type) {

    case 'echarts-bar': {
      const colors = parseColors(sv(cfg, 'seriesColors', '#4a9eff,#27ae60,#e67e22'))
      const names = parseColors(sv(cfg, 'seriesNames', ''))
      const borderRadius = sv(cfg, 'barBorderRadius', 2)
      const maxWidth = sv(cfg, 'barMaxWidth', 40)
      const barGap = sv(cfg, 'barGap', '30%')
      const showLegend = sv(cfg, 'showLegend', false)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const da = readDualAxis(cfg)
      const grid = {
        top: sv(cfg, 'gridTop', 30),
        bottom: sv(cfg, 'gridBottom', 30),
        left: sv(cfg, 'gridLeft', 40),
        right: sv(cfg, 'gridRight', da.enabled ? 40 : 10),
      }

      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['A', 'B', 'C', 'D', 'E']
        : ['A', 'B', 'C', 'D', 'E']

      const series: echarts.SeriesOption[] = (seriesKeys.length > 0 ? seriesKeys : [[]]).map((keys, i) => ({
        type: 'bar',
        name: names[i] ?? `系列${i + 1}`,
        yAxisIndex: da.enabled && i >= da.axis2From ? 1 : 0,
        data: keys.length
          ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform))
          : [42, 68, 35, 80, 55],
        barGap,
        itemStyle: {
          color: colors[i % colors.length],
          borderRadius,
        },
        barMaxWidth: maxWidth,
      }))

      return {
        ...base,
        grid,
        legend: showLegend ? {} : undefined,
        xAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: xAxisColor } } },
        yAxis: buildValueYAxis(da, yAxisColor, splitLineColor, colors[da.axis2From % colors.length]),
        series,
      }
    }

    case 'echarts-line': {
      const colors = parseColors(sv(cfg, 'seriesColors', '#4a9eff,#27ae60'))
      const names = parseColors(sv(cfg, 'seriesNames', ''))
      const smooth = sv(cfg, 'smooth', true)
      const areaStyle = sv(cfg, 'areaStyle', true)
      const lineWidth = sv(cfg, 'lineWidth', 2)
      const showSymbol = sv(cfg, 'showSymbol', false)
      const showLegend = sv(cfg, 'showLegend', false)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const da = readDualAxis(cfg)
      const grid = {
        top: sv(cfg, 'gridTop', 30),
        bottom: sv(cfg, 'gridBottom', 30),
        left: sv(cfg, 'gridLeft', 40),
        right: sv(cfg, 'gridRight', da.enabled ? 40 : 10),
      }

      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['1', '2', '3', '4', '5', '6']
        : ['1', '2', '3', '4', '5', '6']

      const series: echarts.SeriesOption[] = (seriesKeys.length > 0 ? seriesKeys : [[]]).map((keys, i) => {
        const color = colors[i % colors.length]
        return {
          type: 'line',
          name: names[i] ?? `系列${i + 1}`,
          yAxisIndex: da.enabled && i >= da.axis2From ? 1 : 0,
          data: keys.length
            ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform))
            : [30, 55, 40, 70, 50, 80],
          smooth,
          showSymbol,
          lineStyle: { width: lineWidth, color },
          itemStyle: { color },
          areaStyle: areaStyle ? { color: color + '22' } : undefined,
        }
      })

      return {
        ...base,
        grid,
        legend: showLegend ? {} : undefined,
        xAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: xAxisColor } } },
        yAxis: buildValueYAxis(da, yAxisColor, splitLineColor, colors[da.axis2From % colors.length]),
        series,
      }
    }

    case 'echarts-pie': {
      const colors = parseColors(sv(cfg, 'colors', '#4a9eff,#27ae60,#e67e22,#8e44ad,#e74c3c'))
      const radius = sv(cfg, 'radius', '65%')
      const innerRadius = sv(cfg, 'innerRadius', '0%')
      const showLabel = sv(cfg, 'showLabel', true)
      const labelColor = sv(cfg, 'labelColor', '#aaaaaa')
      const roseType = sv(cfg, 'roseType', false)

      const keys = seriesKeys[0] ?? []
      const nameArr = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined)
        : undefined

      const pieData = keys.length
        ? keys.map((k, i) => ({
            value: applyTransform(pointData[k] ?? 0, transform),
            name: nameArr?.[i] ?? k,
            itemStyle: { color: colors[i % colors.length] },
          }))
        : [
            { value: 35, name: 'A', itemStyle: { color: colors[0] } },
            { value: 25, name: 'B', itemStyle: { color: colors[1] } },
            { value: 20, name: 'C', itemStyle: { color: colors[2] } },
            { value: 20, name: 'D', itemStyle: { color: colors[3] } },
          ]

      return {
        ...base,
        series: [{
          type: 'pie',
          radius: innerRadius && innerRadius !== '0%' ? [innerRadius, radius] : radius,
          center: ['50%', '55%'],
          roseType: roseType ? 'area' : undefined,
          data: pieData,
          label: { show: showLabel, color: labelColor, fontSize: 10 },
        }],
      }
    }

    case 'echarts-gauge': {
      const key = seriesKeys[0]?.[0] ?? (pb?.mode === 'point' || !pb?.mode ? pb?.pointKey : undefined)
      const value = key ? applyTransform(pointData[key] ?? 0, transform) : 62
      const min = sv(cfg, 'min', 0)
      const max = sv(cfg, 'max', 100)
      const unit = sv(cfg, 'unit', '')
      const pointerColor = sv(cfg, 'pointerColor', '#4a9eff')
      const detailColor = sv(cfg, 'detailColor', '#eeeeee')
      const detailSize = sv(cfg, 'detailSize', 14)
      const axisLineWidth = sv(cfg, 'axisLineWidth', 8)
      const axisLineColorsStr = sv(cfg, 'axisLineColors', '0.3:#27ae60,0.7:#e67e22,1:#c0392b')
      const axisLineColors = parseGaugeColors(axisLineColorsStr)
      const fmt = pb?.formatter

      const detailFormatter = fmt
        ? (v: number) => applyFormatter(v, fmt)
        : unit ? `{value} ${unit}` : '{value}'

      return {
        ...base,
        series: [{
          type: 'gauge',
          min,
          max,
          radius: '80%',
          center: ['50%', '60%'],
          axisLine: { lineStyle: { width: axisLineWidth, color: axisLineColors } },
          pointer: { itemStyle: { color: pointerColor } },
          axisTick: { lineStyle: { color: '#444' } },
          splitLine: { lineStyle: { color: '#444' } },
          axisLabel: { color: '#aaa', fontSize: 10 },
          detail: {
            valueAnimation: false,
            color: detailColor,
            fontSize: detailSize,
            formatter: detailFormatter,
          },
          data: [{ value }],
        }],
      }
    }

    case 'echarts-scatter': {
      const dotColor = sv(cfg, 'dotColor', '#4a9eff')
      const dotSize = sv(cfg, 'dotSize', 8)
      const dotOpacity = sv(cfg, 'dotOpacity', 0.8)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const grid = {
        top: sv(cfg, 'gridTop', 30),
        bottom: sv(cfg, 'gridBottom', 30),
        left: sv(cfg, 'gridLeft', 40),
        right: sv(cfg, 'gridRight', 10),
      }

      const xKeys = seriesKeys[0] ?? []
      const yKeys = seriesKeys[1] ?? []
      const data = xKeys.length && yKeys.length
        ? xKeys.map((k, i) => [
            applyTransform(pointData[k] ?? 0, transform),
            applyTransform(pointData[yKeys[i] ?? k] ?? 0, transform),
          ])
        : [[10, 20], [30, 50], [50, 30], [70, 80], [90, 40]]

      return {
        ...base,
        grid,
        xAxis: { type: 'value', name: sv(cfg, 'xAxisName', '') || undefined, max: parseAxisMax(sv(cfg, 'xAxisMax', '')), axisLine: { lineStyle: { color: xAxisColor } }, splitLine: { lineStyle: { color: splitLineColor } } },
        yAxis: { type: 'value', name: sv(cfg, 'yAxisName', '') || undefined, max: parseAxisMax(sv(cfg, 'yAxisMax', '')), axisLine: { lineStyle: { color: yAxisColor } }, splitLine: { lineStyle: { color: splitLineColor } } },
        series: [{
          type: 'scatter',
          data,
          symbolSize: dotSize,
          itemStyle: { color: dotColor, opacity: dotOpacity },
        }],
      }
    }

    case 'echarts-stacked-bar': {
      const colors = parseColors(sv(cfg, 'seriesColors', '#4a9eff,#27ae60,#e67e22'))
      const names = parseColors(sv(cfg, 'seriesNames', ''))
      const showLegend = sv(cfg, 'showLegend', false)
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const da = readDualAxis(cfg)
      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['A', 'B', 'C', 'D']
        : ['A', 'B', 'C', 'D']
      // 双轴时：主轴系列堆叠为 stackA，第二轴系列堆叠为 stackB，避免跨轴堆叠错乱
      const series: echarts.SeriesOption[] = (seriesKeys.length > 0 ? seriesKeys : [[]]).map((keys, i) => {
        const onAxis2 = da.enabled && i >= da.axis2From
        return {
          type: 'bar',
          name: names[i] ?? `系列${i + 1}`,
          stack: da.enabled ? (onAxis2 ? 'stackB' : 'stackA') : 'total',
          yAxisIndex: onAxis2 ? 1 : 0,
          data: keys.length ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform)) : [20, 30, 25, 15],
          itemStyle: { color: colors[i % colors.length] },
        }
      })
      return {
        ...base,
        grid: { top: sv(cfg, 'gridTop', 30), bottom: sv(cfg, 'gridBottom', 30), left: sv(cfg, 'gridLeft', 40), right: sv(cfg, 'gridRight', da.enabled ? 40 : 10) },
        legend: showLegend ? {} : undefined,
        xAxis: { type: 'category', data: categories },
        yAxis: buildValueYAxis(da, yAxisColor, splitLineColor, colors[da.axis2From % colors.length]),
        series,
      }
    }

    case 'echarts-horizontal-bar': {
      const fallbackColors = parseColors(sv(cfg, 'seriesColors', '#4a9eff,#27ae60,#e67e22'))
      // 系列颜色：优先数据定义里逐系列配置的 chartSeriesColors（空串回退样式面板按序取色）
      const seriesColorAt = (i: number): string => {
        const c = pb?.chartSeriesColors?.[i]?.trim()
        return c || fallbackColors[i % fallbackColors.length]
      }
      // 系列名称：优先数据定义里配置的 chartSeriesNames，回退到样式字段 seriesNames
      const names = (pb?.chartSeriesNames && pb.chartSeriesNames.length > 0)
        ? pb.chartSeriesNames
        : parseColors(sv(cfg, 'seriesNames', ''))
      const borderRadius = sv(cfg, 'barBorderRadius', 2)
      const maxWidth = sv(cfg, 'barMaxWidth', 20)
      const barGap = sv(cfg, 'barGap', '30%')
      const stacked = sv(cfg, 'stack', false)
      const showLegend = sv(cfg, 'showLegend', false)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['A', 'B', 'C', 'D']
        : ['A', 'B', 'C', 'D']

      // 多轴（双数值轴）：横向柱的数值轴是 xAxis
      const da = readDualAxis(cfg)

      // 过滤空系列：先剔除未配置数据键的系列；再在运行时（至少一个系列有实际数据）
      // 剔除所有键在 pointData 中均缺失的系列。保留原始下标以正确取名称/颜色。
      // 没有任何绑定时（seriesKeys=[]）保留一个占位系列用于编辑器预览。
      const hasData = (keys: string[]) => keys.some((k) => pointData[k] != null)
      const keyed = seriesKeys.length > 0
        ? seriesKeys.map((k, i) => ({ keys: k, idx: i })).filter(({ keys }) => keys.length > 0)
        : [{ keys: [] as string[], idx: 0 }]
      // 只要有任一系列已收到数据，就隐藏其余无数据的系列；否则（设计态无数据）全部保留预览。
      const anyData = keyed.some(({ keys }) => hasData(keys))
      const keyEntries = anyData ? keyed.filter(({ keys }) => hasData(keys)) : keyed

      const series: echarts.SeriesOption[] = keyEntries.map(({ keys, idx }) => {
        const useAxis2 = da.enabled && idx >= da.axis2From
        return {
          type: 'bar',
          name: names[idx]?.trim() ? names[idx] : `系列${idx + 1}`,
          stack: stacked ? 'total' : undefined,
          xAxisIndex: useAxis2 ? 1 : 0,
          data: keys.length ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform)) : [42, 68, 35, 80],
          barGap,
          barMaxWidth: maxWidth,
          itemStyle: { color: seriesColorAt(idx), borderRadius },
        }
      })

      const baseXAxis = {
        type: 'value' as const,
        name: da.axis1Name || undefined,
        max: da.axis1Max,
        axisLine: { lineStyle: { color: xAxisColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      }
      const xAxis: echarts.EChartsOption['xAxis'] = da.enabled
        ? [baseXAxis, {
            type: 'value' as const,
            name: da.axis2Name || undefined,
            max: da.axis2Max,
            position: 'top' as const,
            axisLine: { show: true, lineStyle: { color: seriesColorAt(da.axis2From) } },
            splitLine: { show: false },
          }]
        : baseXAxis

      return {
        ...base,
        grid: { top: sv(cfg, 'gridTop', da.enabled ? 40 : 30), bottom: sv(cfg, 'gridBottom', 30), left: sv(cfg, 'gridLeft', 50), right: sv(cfg, 'gridRight', 10) },
        legend: showLegend ? {} : undefined,
        xAxis,
        yAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: yAxisColor } } },
        series,
      }
    }

    case 'echarts-area': {
      const colors = parseColors(sv(cfg, 'seriesColors', '#4a9eff,#27ae60'))
      const names = parseColors(sv(cfg, 'seriesNames', ''))
      const smooth = sv(cfg, 'smooth', true)
      const lineWidth = sv(cfg, 'lineWidth', 2)
      const showLegend = sv(cfg, 'showLegend', false)
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const da = readDualAxis(cfg)
      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['1', '2', '3', '4', '5']
        : ['1', '2', '3', '4', '5']
      const series: echarts.SeriesOption[] = (seriesKeys.length > 0 ? seriesKeys : [[]]).map((keys, i) => {
        const color = colors[i % colors.length]
        return {
          type: 'line',
          name: names[i] ?? `系列${i + 1}`,
          yAxisIndex: da.enabled && i >= da.axis2From ? 1 : 0,
          data: keys.length ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform)) : [30, 55, 40, 70, 50],
          smooth,
          lineStyle: { width: lineWidth, color },
          itemStyle: { color },
          areaStyle: { color: color + '44' },
        }
      })
      return {
        ...base,
        grid: { top: sv(cfg, 'gridTop', 30), bottom: sv(cfg, 'gridBottom', 30), left: sv(cfg, 'gridLeft', 40), right: sv(cfg, 'gridRight', da.enabled ? 40 : 10) },
        legend: showLegend ? {} : undefined,
        xAxis: { type: 'category', data: categories },
        yAxis: buildValueYAxis(da, yAxisColor, splitLineColor, colors[da.axis2From % colors.length]),
        series,
      }
    }

    case 'echarts-radar': {
      const color = parseColors(sv(cfg, 'seriesColors', '#4a9eff'))[0]
      const showArea = sv(cfg, 'showArea', true)
      const keys = seriesKeys[0] ?? []
      const nameArr = categoryKey ? (pointData[categoryKey] as unknown as string[] | undefined) : undefined
      const indicators = keys.length
        ? keys.map((k, i) => ({ name: nameArr?.[i] ?? k, max: 100 }))
        : [{ name: 'A', max: 100 }, { name: 'B', max: 100 }, { name: 'C', max: 100 }]
      const values = keys.length
        ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform))
        : [60, 75, 45]
      return {
        ...base,
        radar: { indicator: indicators, splitArea: { show: true } },
        series: [{
          type: 'radar',
          data: [{ value: values, name: titleText || 'Series' }],
          areaStyle: showArea ? { color: color + '33' } : undefined,
          lineStyle: { color },
          itemStyle: { color },
        }],
      }
    }

    case 'echarts-funnel': {
      const colors = parseColors(sv(cfg, 'colors', '#4a9eff,#27ae60,#e67e22,#8e44ad'))
      const sort = sv(cfg, 'sort', 'descending') as 'ascending' | 'descending'
      const keys = seriesKeys[0] ?? []
      const nameArr = categoryKey ? (pointData[categoryKey] as unknown as string[] | undefined) : undefined
      const funnelData = keys.length
        ? keys.map((k, i) => ({
            value: applyTransform(pointData[k] ?? 0, transform),
            name: nameArr?.[i] ?? k,
            itemStyle: { color: colors[i % colors.length] },
          }))
        : [
            { value: 100, name: '访问', itemStyle: { color: colors[0] } },
            { value: 80, name: '咨询', itemStyle: { color: colors[1] } },
            { value: 60, name: '下单', itemStyle: { color: colors[2] } },
            { value: 40, name: '成交', itemStyle: { color: colors[3] } },
          ]
      return {
        ...base,
        series: [{
          type: 'funnel',
          sort,
          gap: 2,
          label: { show: true, color: '#ccc', fontSize: 10 },
          data: funnelData,
        }],
      }
    }

    case 'echarts-heatmap': {
      const colorLow = sv(cfg, 'colorLow', '#313695')
      const colorHigh = sv(cfg, 'colorHigh', '#a50026')
      const showVisualMap = sv(cfg, 'showVisualMap', true)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const grid = {
        top: sv(cfg, 'gridTop', 30),
        bottom: sv(cfg, 'gridBottom', 30),
        left: sv(cfg, 'gridLeft', 40),
        right: sv(cfg, 'gridRight', 10),
      }

      const xKeys = seriesKeys[0] ?? []
      const yKeys = seriesKeys[1] ?? []
      const vKeys = seriesKeys[2] ?? []

      // 收集唯一的 X/Y 分类
      const xCats = xKeys.length
        ? [...new Set(xKeys.map((k) => String(pointData[k] ?? k)))]
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      const yCats = yKeys.length
        ? [...new Set(yKeys.map((k) => String(pointData[k] ?? k)))]
        : ['Morning', 'Afternoon', 'Evening']

      const heatData: [number, number, number][] = xKeys.length && yKeys.length && vKeys.length
        ? xKeys.map((xk, i) => {
            const xVal = String(pointData[xk] ?? xk)
            const yVal = String(pointData[yKeys[i] ?? xk] ?? yKeys[i] ?? xk)
            const v = applyTransform(Number(pointData[vKeys[i] ?? xk] ?? 0), transform)
            return [xCats.indexOf(xVal), yCats.indexOf(yVal), v]
          })
        : [
            [0, 0, 5], [0, 1, 1], [0, 2, 0],
            [1, 0, 3], [1, 1, 8], [1, 2, 2],
            [2, 0, 1], [2, 1, 4], [2, 2, 9],
            [3, 0, 7], [3, 1, 2], [3, 2, 3],
            [4, 0, 2], [4, 1, 6], [4, 2, 1],
          ]

      const maxVal = Math.max(...heatData.map(([,, v]) => v), 1)

      return {
        ...base,
        grid,
        xAxis: { type: 'category', data: xCats, axisLine: { lineStyle: { color: xAxisColor } }, splitArea: { show: true } },
        yAxis: { type: 'category', data: yCats, axisLine: { lineStyle: { color: yAxisColor } }, splitArea: { show: true } },
        visualMap: showVisualMap ? {
          min: 0, max: maxVal,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          textStyle: { color: '#aaa', fontSize: 9 },
          inRange: { color: [colorLow, colorHigh] },
        } : {
          min: 0, max: maxVal,
          show: false,
          inRange: { color: [colorLow, colorHigh] },
        },
        series: [{
          type: 'heatmap',
          data: heatData,
          label: { show: false },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        }],
      }
    }

    default:
      return { ...base, grid: { top: 30, right: 10, bottom: 30, left: 40 } }
  }
}

export default function ChartWidget({ el, zoom, pointData = {} }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!divRef.current) return
    chartRef.current = echarts.init(divRef.current, 'dark', { renderer: 'canvas' })
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.resize()
  }, [zoom, el.width, el.height])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.setOption(buildOption(el, pointData), { notMerge: true })
  }, [el, pointData])

  // 确保 schema 存在（开发时提示）
  if (import.meta.env.DEV && !chartSchema[el.type]) {
    console.warn(`[ChartWidget] no schema for type: ${el.type}`)
  }

  return (
    <div
      ref={divRef}
      style={mergeAnimStyle(el, pointData, {
        position: 'absolute',
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.width * zoom,
        height: el.height * zoom,
        zIndex: el.zIndex,
        opacity: el.opacity ?? 1,
        pointerEvents: 'none',
      })}
    />
  )
}
