<template>
  <div style="display:inline-block">
    <el-button type="success" @click="dialogVisible = true">扫描本机 USB 设备</el-button>

    <el-dialog v-model="dialogVisible" title="本机 USB 设备" width="560px" :close-on-click-modal="false" @open="onOpen" @close="onClose">

      <!-- Bridge 未连接 -->
      <template v-if="!bridgeConnected">
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom:16px">
          <template #title>
            未检测到本地 ADB Bridge
          </template>
          <div style="margin-top:6px;font-size:13px;line-height:1.8">
            请先下载并运行 <b>app-manager-bridge</b>，它会扫描本机 USB 连接的 Android 设备。
            <br>
            <el-link type="primary" :href="bridgeDownloadUrl" target="_blank">下载 Bridge 程序</el-link>
            &nbsp;·&nbsp;
            <el-text type="info" size="small">运行后刷新此页面</el-text>
          </div>
        </el-alert>
        <div style="text-align:center;padding:16px 0">
          <el-button :loading="connecting" @click="connect">重新连接 Bridge</el-button>
        </div>
      </template>

      <!-- Bridge 已连接 -->
      <template v-else>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <el-tag type="success" size="small">Bridge 已连接</el-tag>
          <el-text type="info" size="small">每 2 秒自动刷新</el-text>
          <div style="flex:1" />
          <el-button size="small" @click="sendScan">刷新</el-button>
        </div>

        <el-table :data="devices" border size="small" style="width:100%">
          <el-table-column prop="serial" label="Serial" width="160" />
          <el-table-column label="型号">
            <template #default="{ row }">
              {{ row.model || row.product || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.state === 'device' ? 'success' : 'warning'" size="small">
                {{ row.state === 'device' ? '已连接' : row.state }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button
                size="small"
                type="primary"
                :disabled="row.state !== 'device'"
                :loading="registering === row.serial"
                @click="register(row)"
              >注册</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="devices.length === 0" description="未检测到 USB 设备，请确认手机已开启 USB 调试" :image-size="60" />
      </template>

      <template #footer>
        <el-button @click="dialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits(['registered'])

const BRIDGE_WS = 'ws://127.0.0.1:17175/ws'
const bridgeDownloadUrl = computed(() => `${location.origin}/api/bridge/download`)

const dialogVisible = ref(false)
const bridgeConnected = ref(false)
const connecting = ref(false)
const devices = ref([])
const registering = ref('')

let ws = null

function connect() {
  if (ws) {
    ws.close()
    ws = null
  }
  connecting.value = true
  bridgeConnected.value = false

  ws = new WebSocket(BRIDGE_WS)

  ws.onopen = () => {
    bridgeConnected.value = true
    connecting.value = false
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'devices') {
        devices.value = msg.devices || []
      } else if (msg.type === 'register_result') {
        if (msg.error) {
          ElMessage.error('注册失败：' + msg.error)
        } else {
          ElMessage.success('设备注册成功')
          emit('registered')
        }
        registering.value = ''
      }
    } catch {}
  }

  ws.onerror = () => {
    bridgeConnected.value = false
    connecting.value = false
    devices.value = []
  }

  ws.onclose = () => {
    bridgeConnected.value = false
    connecting.value = false
    devices.value = []
  }
}

function sendScan() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'scan' }))
  }
}

async function register(device) {
  try {
    await ElMessageBox.prompt('请输入设备名称（可留空）', `注册 ${device.model || device.serial}`, {
      inputPlaceholder: device.model || device.serial,
      confirmButtonText: '注册',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const token = localStorage.getItem('token') || ''
  registering.value = device.serial

  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'register',
      serial: device.serial,
      device_name: device.model || device.serial,
      server_url: location.origin,
      token,
    }))
  } else {
    ElMessage.error('Bridge 连接已断开')
    registering.value = ''
  }
}

function onOpen() {
  connect()
}

function onClose() {
  if (ws) {
    ws.close()
    ws = null
  }
  bridgeConnected.value = false
  devices.value = []
}

onUnmounted(onClose)
</script>
