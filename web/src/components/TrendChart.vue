<template>
  <div ref="chartEl" :style="{ width: '100%', height: height + 'px' }"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: Number, default: 280 }
})

const chartEl = ref(null)
let chart = null

function render() {
  if (!chart && chartEl.value) {
    chart = echarts.init(chartEl.value)
  }
  if (chart) chart.setOption(props.option, true)
}

function resize() {
  chart?.resize()
}

onMounted(async () => {
  await nextTick()
  render()
  window.addEventListener('resize', resize)
})

watch(() => props.option, render, { deep: true })

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})
</script>
