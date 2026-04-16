<template>
  <div class="share">
    <div v-if="err" class="err">{{ err }}</div>
    <div v-else>
      <p class="meta">组态：{{ scadaCode }} · STOMP {{ stompOn ? '已连接' : '未连接' }}</p>
      <pre class="points">{{ pointJson }}</pre>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Client } from '@stomp/stompjs'
import * as api from '@/api/scada'

const route = useRoute()
const err = ref('')
const scadaCode = ref('')
const pointJson = ref('{}')
const stompOn = ref(false)
let client = null

const load = async () => {
  err.value = ''
  const token = route.query.token
  const code = route.query.code
  try {
    let row
    if (token) {
      const res = await fetch(`/api/scada/info/share/${encodeURIComponent(token)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '加载失败')
      row = j.data
    } else if (code) {
      const res = await api.getScadaInfoByCode(code)
      row = res.data
    } else {
      err.value = '缺少 token 或 code'
      return
    }
    scadaCode.value = row.scada_code
    connectStomp(row)
  } catch (e) {
    err.value = e.message || String(e)
  }
}

const connectStomp = row => {
  const code = row.scada_code
  const token = route.query.token
  const jwt = localStorage.getItem('token')
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = location.host
  let url
  if (token) {
    url = `${proto}//${host}/ws/stomp-scada?share_token=${encodeURIComponent(token)}`
  } else if (jwt) {
    url = `${proto}//${host}/ws/stomp?token=${encodeURIComponent(jwt)}`
  } else {
    err.value = '需要分享 token 或登录后预览（code）'
    return
  }
  client = new Client({
    brokerURL: url,
    reconnectDelay: 5000,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    onConnect: () => {
      stompOn.value = true
      const dest = `/topic/scada/point-data/${code}`
      client.subscribe(dest, msg => {
        try {
          pointJson.value = JSON.stringify(JSON.parse(msg.body), null, 2)
        } catch {
          pointJson.value = msg.body
        }
      })
    },
    onStompError: frame => {
      err.value = frame.headers['message'] || 'STOMP 错误'
    },
    onWebSocketError: () => {
      stompOn.value = false
    }
  })
  client.activate()
}

onMounted(load)
onUnmounted(() => {
  if (client) {
    client.deactivate()
    client = null
  }
})
</script>

<style scoped>
.share {
  padding: 16px;
  min-height: 100vh;
  background: #0f1419;
  color: #ddd;
}
.err {
  color: #f56c6c;
}
.meta {
  margin-bottom: 8px;
  font-size: 13px;
}
.points {
  background: #1a1f26;
  padding: 12px;
  border-radius: 8px;
  overflow: auto;
  font-size: 12px;
}
</style>
