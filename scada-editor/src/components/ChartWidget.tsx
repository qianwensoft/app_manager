import { useRef, useEffect } from 'react'
import * as echarts from 'echarts'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'

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

function buildOption(el: CanvasElement, pointData: PointDataMap): echarts.EChartsOption {
  const base: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { top: 30, right: 10, bottom: 30, left: 40 },
    textStyle: { color: '#aaa', fontSize: 11 },
  }

  const pb = el.pointBinding
  const seriesKeys = pb?.chartSeriesKeys ?? []
  const transform = pb?.transform

  switch (el.type) {
    case 'echarts-bar': {
      const data = seriesKeys[0]?.length
        ? seriesKeys[0].map((k) => applyTransform(pointData[k] ?? 0, transform))
        : [42, 68, 35, 80, 55]
      const categories = pb?.chartCategoryKey
        ? (pointData[pb.chartCategoryKey] as unknown as string[] | undefined) ?? ['A', 'B', 'C', 'D', 'E']
        : ['A', 'B', 'C', 'D', 'E']
      return {
        ...base,
        xAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: '#444' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#2a2a3e' } } },
        series: [{ type: 'bar', data, itemStyle: { color: '#4a9eff' } }],
      }
    }
    case 'echarts-line': {
      const data = seriesKeys[0]?.length
        ? seriesKeys[0].map((k) => applyTransform(pointData[k] ?? 0, transform))
        : [30, 55, 40, 70, 50, 80]
      const categories = pb?.chartCategoryKey
        ? (pointData[pb.chartCategoryKey] as unknown as string[] | undefined) ?? ['1', '2', '3', '4', '5', '6']
        : ['1', '2', '3', '4', '5', '6']
      return {
        ...base,
        xAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: '#444' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#2a2a3e' } } },
        series: [{ type: 'line', data, smooth: true, itemStyle: { color: '#4a9eff' }, areaStyle: { color: '#4a9eff22' } }],
      }
    }
    case 'echarts-pie': {
      const keys = seriesKeys[0] ?? []
      const pieData = keys.length
        ? keys.map((k, i) => ({
            value: applyTransform(pointData[k] ?? 0, transform),
            name: k,
            itemStyle: { color: ['#4a9eff', '#27ae60', '#e67e22', '#8e44ad', '#e74c3c'][i % 5] },
          }))
        : [
            { value: 35, name: 'A', itemStyle: { color: '#4a9eff' } },
            { value: 25, name: 'B', itemStyle: { color: '#27ae60' } },
            { value: 20, name: 'C', itemStyle: { color: '#e67e22' } },
            { value: 20, name: 'D', itemStyle: { color: '#8e44ad' } },
          ]
      return {
        ...base,
        grid: undefined,
        series: [{
          type: 'pie', radius: '65%', center: ['50%', '55%'],
          data: pieData,
          label: { color: '#aaa', fontSize: 10 },
        }],
      }
    }
    case 'echarts-gauge': {
      const key = seriesKeys[0]?.[0] ?? pb?.pointKey
      const value = key ? applyTransform(pointData[key] ?? 0, transform) : 62
      return {
        ...base,
        grid: undefined,
        series: [{
          type: 'gauge', radius: '80%', center: ['50%', '60%'],
          axisLine: { lineStyle: { width: 8, color: [[0.3, '#27ae60'], [0.7, '#e67e22'], [1, '#c0392b']] } },
          pointer: { itemStyle: { color: '#4a9eff' } },
          axisTick: { lineStyle: { color: '#444' } },
          splitLine: { lineStyle: { color: '#444' } },
          axisLabel: { color: '#aaa', fontSize: 10 },
          detail: { valueAnimation: false, color: '#eee', fontSize: 14 },
          data: [{ value }],
        }],
      }
    }
    case 'echarts-scatter': {
      const xKeys = seriesKeys[0] ?? []
      const yKeys = seriesKeys[1] ?? []
      const data = xKeys.length && yKeys.length
        ? xKeys.map((k, i) => [applyTransform(pointData[k] ?? 0, transform), applyTransform(pointData[yKeys[i] ?? k] ?? 0, transform)])
        : [[10, 20], [30, 50], [50, 30], [70, 80], [90, 40]]
      return {
        ...base,
        xAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#2a2a3e' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#2a2a3e' } } },
        series: [{ type: 'scatter', data, itemStyle: { color: '#4a9eff' } }],
      }
    }
    default:
      return base
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
