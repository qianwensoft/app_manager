import { useRef, useEffect, useState, useCallback } from 'react'
import * as echarts from 'echarts'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { dataBindingApi } from '@/api/dataBinding'
import { mergeAnimStyle } from '@/runtime/animationExecutor'

interface Props {
  el: CanvasElement
  zoom: number
  /** Live point-data pushed via STOMP — same map all echarts widgets receive */
  pointData?: PointDataMap
  scadaCode?: string
}

interface TrendPoint {
  t: number   // Unix ms
  v: number
}

type SeriesBuffer = Map<string, TrendPoint[]>

const PALETTE = ['#4a9eff', '#27ae60', '#e67e22', '#8e44ad', '#e74c3c', '#1abc9c', '#f1c40f']
const DEFAULT_MAX_POINTS = 200

function cfg<T>(props: Record<string, unknown>, key: string, def: T): T {
  const v = props[key]
  return v !== undefined ? (v as T) : def
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function trimBuffer(buf: TrendPoint[], maxPoints: number, windowMs: number): TrendPoint[] {
  let result = buf
  if (maxPoints > 0 && result.length > maxPoints) {
    result = result.slice(result.length - maxPoints)
  }
  if (windowMs > 0) {
    const cutoff = Date.now() - windowMs
    const idx = result.findIndex((p) => p.t >= cutoff)
    if (idx > 0) result = result.slice(idx)
  }
  return result
}

export default function TrendWidget({ el, zoom, pointData, scadaCode }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const bufRef = useRef<SeriesBuffer>(new Map())
  const [ready, setReady] = useState(false)

  const pb = el.pointBinding
  const keys: string[] = pb?.trendKeys ?? (pb?.simLinkName ? [pb.simLinkName] : [])
  const maxPoints = pb?.trendMaxPoints ?? DEFAULT_MAX_POINTS
  const windowMs = (pb?.trendTimeWindowSec ?? 0) * 1000

  const styleProps = (el.properties?.chartConfig ?? {}) as Record<string, unknown>
  const smooth = cfg(styleProps, 'smooth', true)
  const areaStyle = cfg(styleProps, 'areaStyle', false)
  const lineWidth = cfg(styleProps, 'lineWidth', 2)
  const showSymbol = cfg(styleProps, 'showSymbol', false)
  const showLegend = cfg(styleProps, 'showLegend', keys.length > 1)
  const bgColor = cfg(styleProps, 'bgColor', 'transparent')
  const xAxisColor = cfg(styleProps, 'xAxisColor', '#444')
  const yAxisColor = cfg(styleProps, 'yAxisColor', '#444')
  const splitLineColor = cfg(styleProps, 'splitLineColor', '#2a2a3e')
  const titleText = cfg(styleProps, 'title', '')
  const titleColor = cfg(styleProps, 'titleColor', '#cccccc')
  const gridTop = cfg(styleProps, 'gridTop', titleText ? 36 : 20)

  // Init echarts
  useEffect(() => {
    if (!divRef.current) return
    chartRef.current = echarts.init(divRef.current, 'dark', { renderer: 'canvas' })
    setReady(true)
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  // Resize on zoom/size change
  useEffect(() => {
    chartRef.current?.resize()
  }, [zoom, el.width, el.height])

  const pushOption = useCallback(() => {
    if (!chartRef.current) return
    const now = Date.now()

    const allTimes = new Set<number>()
    bufRef.current.forEach((pts) => pts.forEach((p) => allTimes.add(p.t)))
    const sortedTimes = [...allTimes].sort((a, b) => a - b)
    const xLabels = sortedTimes.map(formatTime)

    const series: echarts.SeriesOption[] = keys.map((key, i) => {
      const buf = bufRef.current.get(key) ?? []
      const timeToVal = new Map(buf.map((p) => [p.t, p.v]))
      const data = sortedTimes.map((t) => {
        const v = timeToVal.get(t)
        return v !== undefined ? v : null
      })
      const color = PALETTE[i % PALETTE.length]
      return {
        name: key,
        type: 'line',
        data,
        smooth,
        showSymbol,
        connectNulls: false,
        lineStyle: { width: lineWidth, color },
        itemStyle: { color },
        areaStyle: areaStyle ? { color: color + '22' } : undefined,
      }
    })

    const option: echarts.EChartsOption = {
      backgroundColor: bgColor,
      animation: false,
      textStyle: { color: '#aaa', fontSize: 11 },
      ...(titleText ? { title: { text: titleText, textStyle: { color: titleColor, fontSize: 12 } } } : {}),
      grid: { top: gridTop, bottom: 30, left: 50, right: showLegend ? 80 : 10 },
      legend: showLegend ? { right: 0, top: 'center', orient: 'vertical', textStyle: { color: '#aaa', fontSize: 10 } } : undefined,
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: xAxisColor } },
        axisLabel: { fontSize: 9, color: '#888' },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: yAxisColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
        axisLabel: { fontSize: 9 },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1a1a2e',
        borderColor: '#333',
        textStyle: { color: '#eee', fontSize: 11 },
      },
      series,
    }

    chartRef.current.setOption(option, { notMerge: true })
    // suppress "unused variable" from Date.now() side-effect
    void now
  }, [keys, smooth, areaStyle, lineWidth, showSymbol, showLegend, bgColor,
      xAxisColor, yAxisColor, splitLineColor, titleText, titleColor, gridTop])

  // Pre-load history on mount / keys change
  useEffect(() => {
    if (!scadaCode || keys.length === 0) return
    bufRef.current = new Map()

    dataBindingApi.fetchSimHistory(scadaCode, keys, maxPoints).then((res) => {
      const hist = res.data ?? {}
      keys.forEach((key) => {
        const pts = (hist[key] ?? []) as { t: number; v: number }[]
        bufRef.current.set(key, pts.slice(-maxPoints))
      })
      if (ready) pushOption()
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scadaCode, keys.join(','), maxPoints, ready])

  // Append live STOMP data
  useEffect(() => {
    if (!pointData || keys.length === 0) return
    let changed = false
    const now = Date.now()

    keys.forEach((key) => {
      const v = pointData[key]
      if (v === undefined) return
      const buf = bufRef.current.get(key) ?? []
      const next = trimBuffer([...buf, { t: now, v: Number(v) }], maxPoints, windowMs)
      bufRef.current.set(key, next)
      changed = true
    })

    if (changed && ready) pushOption()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointData])

  // Re-render when style props change
  useEffect(() => {
    if (ready) pushOption()
  }, [ready, pushOption])

  const boxStyle = (extra: React.CSSProperties = {}) =>
    mergeAnimStyle(el, pointData ?? {}, {
      position: 'absolute',
      left: el.x * zoom,
      top: el.y * zoom,
      width: el.width * zoom,
      height: el.height * zoom,
      zIndex: el.zIndex,
      opacity: el.opacity ?? 1,
      pointerEvents: 'none',
      ...extra,
    })

  if (keys.length === 0) {
    return (
      <div
        style={boxStyle({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
          color: '#555',
          fontSize: 12,
        })}
      >
        趋势图 — 请绑定数据点
      </div>
    )
  }

  return (
    <div ref={divRef} style={boxStyle()} />
  )
}
