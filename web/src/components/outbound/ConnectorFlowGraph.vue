<template>
  <div class="flow-outer" :style="{ height: height + 'px' }">
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :default-edge-options="{ type: 'smoothstep', animated: traceMode }"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-scroll="true"
      :pan-on-drag="true"
      :fit-view-on-init="true"
    >
      <Background :gap="14" pattern-color="#ccc" />
    </VueFlow>
    <div v-if="!nodes.length" class="flow-empty">暂无阶段步骤，无法绘制拓扑</div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = defineProps({
  /** 与 useVueFlow 一致，多实例时需唯一 */
  flowId: { type: String, default: 'connector-topology' },
  /** 与 API / 表单一致的结构：phases[].run_mode, phases[].steps[] */
  phases: { type: Array, default: () => [] },
  /** 执行追溯：{ step_id, total, success, failed, label? }[] */
  nodeStats: { type: Array, default: () => [] },
  height: { type: Number, default: 420 },
  /** 追溯模式：边动画、略缩默认视距 */
  traceMode: { type: Boolean, default: false }
})

const nodes = ref([])
const edges = ref([])

const { fitView } = useVueFlow({ id: props.flowId })

function stepNodeId(pi, st, si) {
  const sid = st.id ?? st.ID
  if (sid) return `step-${sid}`
  return `p${pi}-s${si}`
}

function statsForStep(stepId) {
  if (!stepId || !props.nodeStats?.length) return null
  const sid = Number(stepId)
  return props.nodeStats.find((r) => Number(r.step_id) === sid) || null
}

function buildLabel(st, si, stStats) {
  const typ = st.step_type || 'http'
  let base = ''
  if (typ === 'http') {
    base = st.endpoint_id ? `HTTP #${st.endpoint_id}` : 'HTTP'
  } else if (typ === 'view_url') {
    base = '打开网页'
  } else if (typ === 'broadcast_intent') {
    base = '广播 Intent'
  } else if (typ === 'message') {
    base = '消息提醒'
  } else {
    base = typ
  }
  if (!stStats) {
    const d = delaySuffix(st)
    return d ? `${base}${d}` : base
  }
  const rate = stStats.total > 0 ? Math.round((100 * stStats.success) / stStats.total) : 0
  const d = delaySuffix(st)
  return `${base}${d}\n─────────\n执行 ${stStats.total} 次 · 成功 ${stStats.success} · 失败 ${stStats.failed}\n成功率 ${rate}%`
}

function delaySuffix(st) {
  const b = Number(st.delay_before_ms) || 0
  const a = Number(st.delay_after_ms) || 0
  if (!b && !a) return ''
  const parts = []
  if (b) parts.push(`前${b}ms`)
  if (a) parts.push(`后${a}ms`)
  return `\n⏱ ${parts.join(' · ')}`
}

function nodeStyle(stStats) {
  if (!props.traceMode || !stStats || stStats.total === 0) {
    return { background: '#fff', border: '1px solid #94a3b8', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', minWidth: '120px' }
  }
  const rate = stStats.total > 0 ? stStats.success / stStats.total : 0
  let border = '#94a3b8'
  let bg = '#f8fafc'
  if (rate >= 0.95) {
    border = '#16a34a'
    bg = '#ecfdf5'
  } else if (rate < 0.8) {
    border = '#dc2626'
    bg = '#fef2f2'
  }
  return {
    background: bg,
    border: `2px solid ${border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    minWidth: '130px',
    whiteSpace: 'pre-line',
    textAlign: 'center'
  }
}

function rebuild() {
  const phases = props.phases || []
  const ns = []
  const es = []
  if (!phases.length) {
    nodes.value = []
    edges.value = []
    return
  }

  const colW = 280
  const rowH = 96
  let yBase = 20
  let prevLastId = null

  phases.forEach((phase, pi) => {
    const runMode = phase.run_mode || 'parallel'
    const steps = phase.steps || []
    if (!steps.length) return

    let firstId = null
    let lastId = null
    const x0 = pi * colW + 30

    if (runMode === 'sequential' || runMode === 'failover') {
      steps.forEach((st, si) => {
        const id = stepNodeId(pi, st, si)
        if (si === 0) firstId = id
        lastId = id
        const stStats = statsForStep(st.id ?? st.ID)
        ns.push({
          id,
          position: { x: x0, y: yBase + si * rowH },
          label: buildLabel(st, si, stStats),
          style: nodeStyle(stStats)
        })
        if (si > 0) {
          const prev = stepNodeId(pi, steps[si - 1], si - 1)
          es.push({ id: `e-in-${pi}-${si}`, source: prev, target: id, style: { strokeWidth: 2 } })
        }
      })
      yBase += steps.length * rowH + 56
    } else {
      steps.forEach((st, si) => {
        const id = stepNodeId(pi, st, si)
        if (si === 0) firstId = id
        lastId = id
        const stStats = statsForStep(st.id ?? st.ID)
        ns.push({
          id,
          position: { x: x0 + si * 200, y: yBase },
          label: buildLabel(st, si, stStats),
          style: nodeStyle(stStats)
        })
      })
      yBase += rowH + 72
    }

    if (prevLastId && firstId) {
      es.push({
        id: `phase-link-${pi}`,
        source: prevLastId,
        target: firstId,
        style: { stroke: '#64748b', strokeWidth: 2, strokeDasharray: '6 4' }
      })
    }
    prevLastId = lastId
  })

  nodes.value = ns
  edges.value = es
  if (ns.length) {
    nextTick(() => {
      try {
        fitView({ padding: 0.15, duration: 200 })
      } catch {
        /* ignore */
      }
    })
  }
}

watch(
  () => [props.phases, props.nodeStats, props.traceMode],
  () => rebuild(),
  { deep: true, immediate: true }
)
</script>

<style scoped>
.flow-outer {
  position: relative;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
}
.flow-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 13px;
  pointer-events: none;
}
</style>
