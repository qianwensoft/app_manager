<template>
  <span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">
    <el-tag v-if="!device.network_connected" type="info" size="small">离线</el-tag>
    <template v-else>
      <!-- 网络类型 -->
      <el-tag :type="netTagType" size="small">{{ netLabel }}</el-tag>
      <!-- WiFi 信号 -->
      <span v-if="isWifi && device.wifi_signal" style="font-size:12px;color:#666">
        {{ signalIcon }} {{ device.wifi_signal }}dBm
      </span>
      <!-- 链路速率 -->
      <span v-if="isWifi && device.wifi_speed" style="font-size:12px;color:#888">
        {{ device.wifi_speed }}Mbps
      </span>
      <!-- SSID -->
      <span v-if="isWifi && device.wifi_ssid" style="font-size:12px;color:#aaa;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="device.wifi_ssid">
        {{ device.wifi_ssid }}
      </span>
    </template>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  device: { type: Object, required: true },
  inline: { type: Boolean, default: false }
})

const isWifi = computed(() => {
  const t = (props.device.network_type || '').toLowerCase()
  return t === 'wifi' || t === 'wlan'
})

const netLabel = computed(() => {
  const t = props.device.network_type
  if (!t) return '未知'
  if (isWifi.value) return 'WiFi'
  return t.toUpperCase()
})

const netTagType = computed(() => {
  if (isWifi.value) return 'success'
  const t = (props.device.network_type || '').toLowerCase()
  if (t.includes('5g') || t.includes('lte') || t.includes('4g')) return 'warning'
  return 'info'
})

const signalIcon = computed(() => {
  const s = props.device.wifi_signal
  if (!s) return '📶'
  if (s >= -55) return '▮▮▮▮'
  if (s >= -65) return '▮▮▮░'
  if (s >= -75) return '▮▮░░'
  return '▮░░░'
})
</script>
