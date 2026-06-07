<template>
  <div style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <el-select v-model="deviceId" placeholder="选择设备" style="width:200px">
        <el-option v-for="d in devices" :key="d.id" :label="d.name || d.serial" :value="d.id" />
      </el-select>
      <div class="filter-box">
        <el-select
          v-model="filters"
          multiple
          filterable
          allow-create
          default-first-option
          collapse-tags
          collapse-tags-tooltip
          :reserve-keyword="false"
          placeholder="过滤条件（如 *:E），回车添加"
          style="min-width:280px;max-width:480px"
          @change="onFiltersChanged"
          @keyup.enter="onFilterEnter"
        />
        <span class="filter-hint">回车添加；已连接时立即生效</span>
      </div>
      <el-button type="primary" @click="connect" :disabled="!deviceId || connected" :loading="wsConnecting">
        {{ connected ? '运行中' : '开始' }}
      </el-button>
      <el-button @click="stop" :disabled="!connected" type="danger" plain>停止</el-button>
      <el-button @click="logs = []">清空</el-button>
      <el-checkbox v-model="autoScroll">自动滚动</el-checkbox>
      <el-tag :type="connected ? 'success' : 'info'" style="font-size:12px">
        <span v-if="connected">● 运行中</span>
        <span v-else>○ 已停止</span>
      </el-tag>

      <el-divider direction="vertical" />

      <el-popover placement="bottom-start" :width="480" trigger="click" @show="onWirelessAdbPopoverShow">
        <template #reference>
          <el-button :disabled="!deviceId">无线 ADB ▾</el-button>
        </template>
        <WirelessAdbPanel ref="wirelessAdbPanelRef" :device-id="deviceId" include-grant-read-logs />
      </el-popover>
    </div>

    <div ref="logRef" class="log-box">
      <div v-for="(line, i) in logs" :key="i" :class="['log-line', levelClass(line)]">{{ line }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { WSClient } from '@/utils/ws'
import * as deviceApi from '@/api/device'
import WirelessAdbPanel from '@/components/WirelessAdbPanel.vue'

const route = useRoute()
const devices = ref([])
const deviceId = ref(route.query.device || '')
const filters = ref([])
const logs = ref([])
const connected = ref(false)
const autoScroll = ref(true)
const logRef = ref(null)
const wirelessAdbPanelRef = ref(null)
const wsConnecting = ref(false)
let ws = null
let reconnectTimer = null

const levelClass = (line) => {
  if (line.includes(' E ') || line.includes('/E:')) return 'log-error'
  if (line.includes(' W ') || line.includes('/W:')) return 'log-warn'
  if (line.includes(' D ') || line.includes('/D:')) return 'log-debug'
  return ''
}

function buildLogcatPath() {
  const base = `/ws/logcat/${deviceId.value}`
  if (!filters.value.length) return base
  const qs = filters.value.map((f) => `filter=${encodeURIComponent(f)}`).join('&')
  return `${base}?${qs}`
}

const onWirelessAdbPopoverShow = () => {
  nextTick(() => {
    wirelessAdbPanelRef.value?.adb?.renderPairQrCode?.()
  })
}

function scheduleReconnect() {
  if (!connected.value) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectWithFilters()
  }, 80)
}

function onFiltersChanged() {
  scheduleReconnect()
}

function onFilterEnter() {
  // allow-create 已添加标签时，再触发一次重连确保实时生效
  scheduleReconnect()
}

function reconnectWithFilters() {
  if (!deviceId.value) return
  ws?.close()
  wsConnecting.value = true
  const path = buildLogcatPath()
  ws = new WSClient(path, {
    onOpen: () => {
      wsConnecting.value = false
      connected.value = true
    },
    onClose: () => {
      wsConnecting.value = false
      connected.value = false
    },
    onMessage: (data) => {
      logs.value.push(data)
      if (logs.value.length > 5000) logs.value.splice(0, 1000)
      if (autoScroll.value) {
        nextTick(() => {
          if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
        })
      }
    }
  })
  ws.connect()
}

const connect = () => {
  if (!deviceId.value) return
  ws?.close()
  wsConnecting.value = true
  ws = new WSClient(buildLogcatPath(), {
    onOpen: () => { wsConnecting.value = false; connected.value = true },
    onClose: () => { wsConnecting.value = false; connected.value = false },
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

const stop = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  ws?.close()
  connected.value = false
}

watch(deviceId, () => {
  stop()
})

onMounted(async () => {
  const res = await deviceApi.getDevices()
  devices.value = res.data || res || []
})

onUnmounted(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  ws?.close()
})
</script>

<style scoped>
.filter-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.filter-hint {
  font-size: 11px;
  color: #909399;
  line-height: 1.2;
}
.log-box { flex: 1; background: #1e1e1e; color: #d4d4d4; font-family: monospace; font-size: 12px; overflow-y: auto; padding: 8px; border-radius: 4px; }
.log-line { white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
.log-error { color: #f48771; }
.log-warn  { color: #dcdcaa; }
.log-debug { color: #9cdcfe; }
</style>
