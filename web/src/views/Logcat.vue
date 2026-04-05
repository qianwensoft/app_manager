<template>
  <div style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <el-select v-model="deviceId" placeholder="选择设备" style="width:200px">
        <el-option v-for="d in devices" :key="d.id" :label="d.name || d.serial" :value="d.id" />
      </el-select>
      <el-input v-model="filter" placeholder="过滤 (e.g. *:E)" style="width:180px" />
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

      <!-- 无线 ADB 操作区 -->
      <el-popover placement="bottom-start" :width="420" trigger="click" @show="nextTick(renderQrCode)">
        <template #reference>
          <el-button :disabled="!deviceId">无线 ADB ▾</el-button>
        </template>

        <div style="display:flex;flex-direction:column;gap:14px">

          <!-- QR 码引导配对 -->
          <div>
            <div style="font-weight:600;margin-bottom:6px;font-size:13px">
              快捷引导：扫码开启无线调试
              <el-tag size="small" type="warning" style="margin-left:6px">Agent 扫码</el-tag>
            </div>
            <div style="color:#888;font-size:12px;margin-bottom:10px">
              用手机 Agent 扫描下方二维码，自动跳转至无线调试设置页
            </div>
            <div style="display:flex;justify-content:center">
              <canvas ref="qrCanvas" style="border-radius:6px" />
            </div>
            <div style="color:#888;font-size:11px;text-align:center;margin-top:6px">
              扫码后按第一步完成配对
            </div>
          </div>

          <el-divider style="margin:0" />

          <!-- 配对（Android 11+） -->
          <div>
            <div style="font-weight:600;margin-bottom:6px;font-size:13px">
              第一步：配对（Android 11+）
              <el-tag size="small" type="info" style="margin-left:6px">配对码</el-tag>
            </div>
            <div style="color:#888;font-size:12px;margin-bottom:8px">
              手机「开发者选项 → 无线调试 → 使用配对码配对设备」，填入显示的端口和6位配对码
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <el-input-number
                v-model="pairPort"
                :min="1024" :max="65535"
                :controls="false"
                style="width:100px"
                placeholder="配对端口"
              />
              <el-input
                v-model="pairCode"
                placeholder="6位配对码"
                maxlength="6"
                style="width:130px"
                @keyup.enter="adbPair"
              />
              <el-button
                type="primary"
                :loading="pairing"
                :disabled="!deviceId || !pairPort || pairCode.length !== 6"
                @click="adbPair"
              >配对</el-button>
            </div>
          </div>

          <el-divider style="margin:0" />

          <!-- 连接 -->
          <div>
            <div style="font-weight:600;margin-bottom:6px;font-size:13px">
              第二步：连接
              <el-tag size="small" type="success" style="margin-left:6px">调试端口</el-tag>
            </div>
            <div style="color:#888;font-size:12px;margin-bottom:8px">
              配对成功后，填入「无线调试」主页面显示的端口（非配对端口），默认 5555
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <el-input-number
                v-model="adbPort"
                :min="1024" :max="65535"
                :controls="false"
                style="width:100px"
                placeholder="调试端口"
              />
              <el-button
                :loading="adbConnecting"
                :disabled="!deviceId"
                @click="adbConnect()"
              >连接</el-button>
              <el-tag v-if="connectedSerial" type="success" size="small">{{ connectedSerial }}</el-tag>
            </div>
          </div>

          <el-divider style="margin:0" />

          <!-- 授权 READ_LOGS -->
          <div>
            <div style="font-weight:600;margin-bottom:6px;font-size:13px">
              第三步：授权 READ_LOGS
            </div>
            <div style="color:#888;font-size:12px;margin-bottom:8px">
              连接成功后点此授权，Agent 重启后可读取全量日志
            </div>
            <el-button
              :loading="granting"
              :disabled="!deviceId"
              @click="grantReadLogs"
            >授权 READ_LOGS</el-button>
          </div>
        </div>
      </el-popover>
    </div>

    <div ref="logRef" class="log-box">
      <div v-for="(line, i) in logs" :key="i" :class="['log-line', levelClass(line)]">{{ line }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
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

// 无线 ADB
const adbPort = ref(5555)
const pairPort = ref(null)
const pairCode = ref('')
const adbConnecting = ref(false)
const pairing = ref(false)
const granting = ref(false)
const wsConnecting = ref(false)
const connectedSerial = ref('')

// QR 码引导
const qrCanvas = ref(null)

const levelClass = (line) => {
  if (line.includes(' E ') || line.includes('/E:')) return 'log-error'
  if (line.includes(' W ') || line.includes('/W:')) return 'log-warn'
  if (line.includes(' D ') || line.includes('/D:')) return 'log-debug'
  return ''
}

/** 生成「无线调试引导」二维码，内容由 Agent 识别后跳转设置页 */
const renderQrCode = async () => {
  if (!qrCanvas.value || !deviceId.value) return
  const wsBase = import.meta.env.VITE_WS_BASE || `ws://${location.host}`
  const serverUrl = wsBase.replace(/^ws/, 'http').replace(/\/ws$/, '')
  const payload = JSON.stringify({
    type: 'wireless_adb_guide',
    deviceId: deviceId.value,
    serverUrl
  })
  try {
    await QRCode.toCanvas(qrCanvas.value, payload, {
      width: 160,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    })
  } catch (e) {
    console.error('QR render failed', e)
  }
}

// deviceId 变化时重绘 QR（popover 打开后 canvas 才挂载，用 watch 配合 nextTick）
watch(deviceId, () => nextTick(renderQrCode))

const connect = () => {
  ws?.close()
  wsConnecting.value = true
  const path = `/ws/logcat/${deviceId.value}${filter.value ? '?filter=' + encodeURIComponent(filter.value) : ''}`
  ws = new WSClient(path, {
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

const stop = () => { ws?.close(); connected.value = false }

const adbPair = async () => {
  if (!deviceId.value || !pairPort.value || pairCode.value.length !== 6) return
  pairing.value = true
  try {
    const res = await deviceApi.adbPairByAgentIP(deviceId.value, pairPort.value, pairCode.value)
    ElMessage.success(`配对成功：${res.data.message}\n请在第二步填入手机「无线调试」主页面显示的调试端口，再点连接`)
    pairCode.value = ''
  } catch (e) {
    const msg = e?.response?.data?.error || 'ADB 配对失败'
    const out = e?.response?.data?.output ? `（${e.response.data.output}）` : ''
    ElMessage.error(msg + out)
  } finally {
    pairing.value = false
  }
}

const adbConnect = async () => {
  if (!deviceId.value) return
  adbConnecting.value = true
  try {
    const res = await deviceApi.adbConnectByAgentIP(deviceId.value, adbPort.value)
    connectedSerial.value = res.data.serial || ''
    ElMessage.success(`ADB 连接成功：${res.data.message}${res.data.serial ? '（' + res.data.serial + '）' : ''}`)
  } catch (e) {
    const msg = e?.response?.data?.error || 'ADB 连接失败'
    const out = e?.response?.data?.output ? `（${e.response.data.output}）` : ''
    ElMessage.error(msg + out)
  } finally {
    adbConnecting.value = false
  }
}

const grantReadLogs = async () => {
  if (!deviceId.value) return
  granting.value = true
  try {
    const res = await deviceApi.grantAgentReadLogs(deviceId.value)
    ElMessage.success(res.data.message || 'READ_LOGS 权限授权成功，重启 Agent 后生效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '授权失败，请确认设备已通过 ADB 连接或开启无线调试')
  } finally {
    granting.value = false
  }
}

onMounted(async () => {
  const res = await deviceApi.getDevices()
  devices.value = res.data
  // 若 URL 带了 device 参数，稍后 canvas 可能未就绪，用 nextTick 延迟
  await nextTick()
  renderQrCode()
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
