import { useRef, useEffect } from 'react'
import * as echarts from 'echarts'
import type { CanvasElement, PointBinding } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { getStyleValue, type StyleFieldDef, chartSchema } from '@/schema/chartSchema'
import { applyFormatter } from '@/hooks/useInterfaceBindingData'

interface Props {
  el: CanvasElement
  zoom: number
  pointData?: PointDataMap
}

function applyTransform(raw: number, transform?: string): number {
  if (!transform) return raw
  try {
    // eslint-disable-next-line no-new-func
    return Number(new Function('v', `return (${transform})`)(raw))
  } catch {
    return raw
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

/** 解析仪表盘颜色段 "0.3:#27ae60,0.7:#e67e22,1:#c0392b" */
function parseGaugeColors(s: string): [number, string][] {
  return s.split(',').map((seg) => {
    const [ratio, color] = seg.trim().split(':')
    return [parseFloat(ratio), color?.trim() ?? '#ccc'] as [number, string]
  }).filter(([r]) => !isNaN(r))
}

/**
 * Resolve effective point data for a chart element.
 * - point/simulation mode: use pointData as-is with pb.chartSeriesKeys
 * - static mode: pull from pb.staticData and inject into pointData-compatible keys
 * - interface mode: read __iface_series_* keys from pointData
 */
function resolveChartData(pb: PointBinding | undefined, rawPointData: PointDataMap): {
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

    for (const [key, val] of Object.entries(sd)) {
      if (Array.isArray(val)) {
        const keys: string[] = []
        ;(val as unknown[]).forEach((v, i) => {
          const k = `__static_${key}_${i}`
          syntheticData[k] = Number(v)
          keys.push(k)
        })
        seriesKeys.push(keys)
      } else {
        const k = `__static_${key}`
        syntheticData[k] = Number(val)
        seriesKeys.push([k])
      }
    }
    return { seriesKeys, categoryKey: undefined, pointData: { ...rawPointData, ...syntheticData } }
  }

  if (mode === 'interface') {
    // __iface_series_0_0, __iface_series_0_1, ... already in rawPointData
    const seriesKeys: string[][] = []
    let idx = 0
    while (true) {
      const keys: string[] = []
      let i = 0
      while (rawPointData[`__iface_series_${idx}_${i}`] !== undefined) {
        keys.push(`__iface_series_${idx}_${i}`)
        i++
      }
      if (rawPointData[`__iface_series_${idx}`] !== undefined) {
        keys.push(`__iface_series_${idx}`)
      }
      if (keys.length === 0) break
      seriesKeys.push(keys)
      idx++
    }
    return { seriesKeys, categoryKey: undefined, pointData: rawPointData }
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
  return {
    seriesKeys: pb.chartSeriesKeys ?? [],
    categoryKey: pb.chartCategoryKey,
    pointData: rawPointData,
  }
}

function buildOption(el: CanvasElement, rawPointData: PointDataMap): echarts.EChartsOption {
  const cfg = (el.properties?.chartConfig ?? {}) as Record<string, unknown>
  const pb = el.pointBinding
  const { seriesKeys, categoryKey, pointData } = resolveChartData(pb, rawPointData)
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
      const borderRadius = sv(cfg, 'barBorderRadius', 2)
      const maxWidth = sv(cfg, 'barMaxWidth', 40)
      const showLegend = sv(cfg, 'showLegend', false)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const grid = {
        top: sv(cfg, 'gridTop', 30),
        bottom: sv(cfg, 'gridBottom', 30),
        left: sv(cfg, 'gridLeft', 40),
        right: sv(cfg, 'gridRight', 10),
      }

      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['A', 'B', 'C', 'D', 'E']
        : ['A', 'B', 'C', 'D', 'E']

      const series: echarts.SeriesOption[] = (seriesKeys.length > 0 ? seriesKeys : [[]]).map((keys, i) => ({
        type: 'bar',
        data: keys.length
          ? keys.map((k) => applyTransform(pointData[k] ?? 0, transform))
          : [42, 68, 35, 80, 55],
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
        yAxis: { type: 'value', axisLine: { lineStyle: { color: yAxisColor } }, splitLine: { lineStyle: { color: splitLineColor } } },
        series,
      }
    }

    case 'echarts-line': {
      const colors = parseColors(sv(cfg, 'seriesColors', '#4a9eff,#27ae60'))
      const smooth = sv(cfg, 'smooth', true)
      const areaStyle = sv(cfg, 'areaStyle', true)
      const lineWidth = sv(cfg, 'lineWidth', 2)
      const showSymbol = sv(cfg, 'showSymbol', false)
      const showLegend = sv(cfg, 'showLegend', false)
      const xAxisColor = sv(cfg, 'xAxisColor', '#444')
      const yAxisColor = sv(cfg, 'yAxisColor', '#444')
      const splitLineColor = sv(cfg, 'splitLineColor', '#2a2a3e')
      const grid = {
        top: sv(cfg, 'gridTop', 30),
        bottom: sv(cfg, 'gridBottom', 30),
        left: sv(cfg, 'gridLeft', 40),
        right: sv(cfg, 'gridRight', 10),
      }

      const categories = categoryKey
        ? (pointData[categoryKey] as unknown as string[] | undefined) ?? ['1', '2', '3', '4', '5', '6']
        : ['1', '2', '3', '4', '5', '6']

      const series: echarts.SeriesOption[] = (seriesKeys.length > 0 ? seriesKeys : [[]]).map((keys, i) => {
        const color = colors[i % colors.length]
        return {
          type: 'line',
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
        yAxis: { type: 'value', axisLine: { lineStyle: { color: yAxisColor } }, splitLine: { lineStyle: { color: splitLineColor } } },
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
        xAxis: { type: 'value', axisLine: { lineStyle: { color: xAxisColor } }, splitLine: { lineStyle: { color: splitLineColor } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: yAxisColor } }, splitLine: { lineStyle: { color: splitLineColor } } },
        series: [{
          type: 'scatter',
          data,
          symbolSize: dotSize,
          itemStyle: { color: dotColor, opacity: dotOpacity },
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
      style={{
        position: 'absolute',
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.width * zoom,
        height: el.height * zoom,
        zIndex: el.zIndex,
        opacity: el.opacity ?? 1,
        pointerEvents: 'none',
      }}
    />
  )
}
