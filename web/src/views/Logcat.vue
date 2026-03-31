<template>
  <div style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <el-select v-model="deviceId" placeholder="选择设备" style="width:200px">
        <el-option v-for="d in devices" :key="d.id" :label="d.name || d.serial" :value="d.id" />
      </el-select>
      <el-input v-model="filter" placeholder="过滤 (e.g. *:E)" style="width:180px" />
      <el-button type="primary" @click="connect" :disabled="!deviceId">开始</el-button>
      <el-button @click="stop">停止</el-button>
      <el-button @click="logs = []">清空</el-button>
      <el-checkbox v-model="autoScroll">自动滚动</el-checkbox>
      <el-tag :type="connected ? 'success' : 'info'">{{ connected ? '运行中' : '已停止' }}</el-tag>
    </div>
    <div ref="logRef" class="log-box">
      <div v-for="(line, i) in logs" :key="i" :class="['log-line', levelClass(line)]">{{ line }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { WSClient } from '@/utils/ws'
import * as deviceApi from '@/api/device'

const route = useRoute()
const devices = ref([])
const deviceId = ref(route.query.device || '')
const filter = ref('')
const logs = ref([])
const connected = ref(false)
const autoScroll = ref(true)
const logRef = ref(null)
let ws = null

const levelClass = (line) => {
  if (line.includes(' E ') || line.includes('/E:')) return 'log-error'
  if (line.includes(' W ') || line.includes('/W:')) return 'log-warn'
  if (line.includes(' D ') || line.includes('/D:')) return 'log-debug'
  return ''
}

const connect = () => {
  ws?.close()
  const path = `/ws/logcat/${deviceId.value}${filter.value ? '?filter=' + encodeURIComponent(filter.value) : ''}`
  ws = new WSClient(path, {
    onOpen: () => { connected.value = true },
    onClose: () => { connected.value = false },
    onMessage: (data) => {
      logs.value.push(data)
      if (logs.value.length > 5000) logs.value.splice(0, 1000)
      if (autoScroll.value) nextTick(() => {
        if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
      })
    }
  })
  ws.connect()
}

const stop = () => { ws?.close(); connected.value = false }

onMounted(async () => {
  const res = await deviceApi.getDevices()
  devices.value = res.data
})
onUnmounted(() => ws?.close())
</script>

<style scoped>
.log-box { flex: 1; background: #1e1e1e; color: #d4d4d4; font-family: monospace; font-size: 12px; overflow-y: auto; padding: 8px; border-radius: 4px; }
.log-line { white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
.log-error { color: #f48771; }
.log-warn  { color: #dcdcaa; }
.log-debug { color: #9cdcfe; }
</style>
