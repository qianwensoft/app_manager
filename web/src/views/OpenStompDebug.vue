<template>
  <div style="padding:24px;max-width:900px">
    <div style="margin-bottom:20px">
      <h2 style="margin:0 0 4px;font-size:18px">开放 STOMP 调试</h2>
      <p style="margin:0;font-size:13px;color:#909399">
        使用 API Key 连接 <code>/ws/open/stomp</code>，实时订阅组态点位数据或设备事件。
        需要令牌具备 <code>open:stomp:subscribe</code> 权限。
      </p>
    </div>

    <!-- Config -->
    <el-card style="margin-bottom:16px">
      <template #header><span style="font-size:13px;font-weight:600">连接配置</span></template>
      <el-form label-width="110px" size="small">
        <el-form-item label="API Key">
          <el-input v-model="apiKey" placeholder="输入具有 open:stomp:subscribe 权限的令牌" show-password style="font-family:monospace" />
        </el-form-item>
        <el-form-item label="订阅 Topic">
          <el-input v-model="destination" placeholder="/topic/scada/point-data/{scada_code}" />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            可用 topic：
            <code>/topic/scada/point-data/{scada_code}</code>、
            <code>/topic/devices</code>、
            <code>/topic/events</code>
          </div>
        </el-form-item>
        <el-form-item label=" ">
          <el-button v-if="!connected" type="primary" :loading="connecting" @click="connect">连接</el-button>
          <el-button v-else type="danger" @click="disconnect">断开</el-button>
          <el-tag :type="statusTagType" style="margin-left:10px">{{ statusLabel }}</el-tag>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Code snippet -->
    <el-card style="margin-bottom:16px">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600">接入示例（JavaScript）</span>
          <el-button size="small" text @click="copySnippet">复制</el-button>
        </div>
      </template>
      <pre style="margin:0;font-size:12px;line-height:1.7;overflow-x:auto;color:#abb2bf;background:#282c34;padding:12px;border-radius:6px">{{ codeSnippet }}</pre>
    </el-card>

    <!-- Messages -->
    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600">实时消息 <el-tag size="small" type="info">{{ messages.length }}</el-tag></span>
          <el-button size="small" text @click="messages = []">清空</el-button>
        </div>
      </template>
      <div
        ref="logEl"
        style="height:360px;overflow-y:auto;font-family:monospace;font-size:12px;line-height:1.8;background:#1e1e2e;border-radius:6px;padding:10px"
      >
        <div v-if="messages.length === 0" style="color:#555;padding:8px 0">等待消息…</div>
        <div
          v-for="(m, i) in messages"
          :key="i"
          :style="{ color: m.type === 'error' ? '#f38ba8' : m.type === 'system' ? '#89b4fa' : '#a6e3a1', marginBottom: '2px' }"
        >
          <span style="color:#585b70;user-select:none">{{ m.time }} </span>{{ m.text }}
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { createOpenStomp } from '@/utils/openStompClient'

const apiKey = ref('')
const destination = ref('/topic/scada/point-data/')
const connected = ref(false)
const connecting = ref(false)
const messages = ref([])
const logEl = ref(null)

let stomp = null

const statusLabel = computed(() => {
  if (connecting.value) return '连接中…'
  return connected.value ? '已连接' : '未连接'
})
const statusTagType = computed(() => {
  if (connecting.value) return 'warning'
  return connected.value ? 'success' : 'info'
})

const codeSnippet = computed(() => {
  const key = apiKey.value || '<YOUR_API_KEY>'
  const dest = destination.value || '/topic/scada/point-data/<scada_code>'
  const wsBase = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  return `import { Client } from '@stomp/stompjs'

const client = new Client({
  brokerURL: '${wsBase}/ws/open/stomp?api_key=${key}',
  reconnectDelay: 5000,
  onConnect: () => {
    client.subscribe('${dest}', (msg) => {
      const data = JSON.parse(msg.body)
      console.log('point-data:', data)
    })
  },
})
client.activate()`
})

function pushMsg(text, type = 'data') {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0')
  messages.value.push({ time, text: typeof text === 'string' ? text : JSON.stringify(text, null, 2), type })
  if (messages.value.length > 500) messages.value.splice(0, messages.value.length - 500)
  nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  })
}

function connect() {
  if (!apiKey.value.trim()) { ElMessage.warning('请输入 API Key'); return }
  if (!destination.value.trim()) { ElMessage.warning('请输入订阅 Topic'); return }
  connecting.value = true
  stomp = createOpenStomp(
    apiKey.value.trim(),
    destination.value.trim(),
    (payload) => pushMsg(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    {
      onConnect: () => {
        connecting.value = false
        connected.value = true
        pushMsg(`已连接，订阅 ${destination.value}`, 'system')
      },
      onDisconnect: () => {
        connecting.value = false
        connected.value = false
        pushMsg('连接已断开', 'system')
      },
      onError: (msg) => {
        connecting.value = false
        connected.value = false
        pushMsg(`错误: ${msg}`, 'error')
      },
    }
  )
  stomp.start()
}

function disconnect() {
  stomp?.stop()
  stomp = null
  connected.value = false
  pushMsg('主动断开', 'system')
}

function copySnippet() {
  navigator.clipboard.writeText(codeSnippet.value).then(() => ElMessage.success('已复制'))
}

onUnmounted(() => stomp?.stop())
</script>
