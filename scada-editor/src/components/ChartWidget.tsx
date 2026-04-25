import ReactECharts from 'echarts-for-react'
import type { CanvasElement } from '@/types'

function buildOption(el: CanvasElement) {
  const base = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { top: 30, right: 10, bottom: 30, left: 40 },
    textStyle: { color: '#aaa', fontSize: 11 },
  }
  switch (el.type) {
    case 'echarts-bar':
      return {
        ...base,
        xAxis: { type: 'category', data: ['A', 'B', 'C', 'D', 'E'], axisLine: { lineStyle: { color: '#444' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#2a2a3e' } } },
        series: [{ type: 'bar', data: [42, 68, 35, 80, 55], itemStyle: { color: '#4a9eff' } }],
      }
    case 'echarts-line':
      return {
        ...base,
        xAxis: { type: 'category', data: ['1', '2', '3', '4', '5', '6'], axisLine: { lineStyle: { color: '#444' } } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#2a2a3e' } } },
        series: [{ type: 'line', data: [30, 55, 40, 70, 50, 80], smooth: true, itemStyle: { color: '#4a9eff' }, areaStyle: { color: '#4a9eff22' } }],
      }
    case 'echarts-pie':
      return {
        ...base,
        grid: undefined,
        series: [{
          type: 'pie', radius: '65%', center: ['50%', '55%'],
          data: [
            { value: 35, name: 'A', itemStyle: { color: '#4a9eff' } },
            { value: 25, name: 'B', itemStyle: { color: '#27ae60' } },
            { value: 20, name: 'C', itemStyle: { color: '#e67e22' } },
            { value: 20, name: 'D', itemStyle: { color: '#8e44ad' } },
          ],
          label: { color: '#aaa', fontSize: 10 },
        }],
      }
    case 'echarts-gauge':
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
          data: [{ value: 62 }],
        }],
      }
    default:
      return base
  }
}

interface Props {
  el: CanvasElement
  zoom: number
}

export default function ChartWidget({ el, zoom }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.width * zoom,
        height: el.height * zoom,
        pointerEvents: 'none',
      }}
    >
      <ReactECharts
        option={buildOption(el)}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}
