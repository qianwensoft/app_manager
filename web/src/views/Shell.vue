<template>
  <div style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <el-select v-model="deviceId" placeholder="选择设备" style="width:220px" @change="connect">
        <el-option v-for="d in devices" :key="d.id" :label="d.name || d.serial" :value="d.id" />
      </el-select>
      <el-tag :type="connected ? 'success' : 'info'">{{ connected ? '已连接' : '未连接' }}</el-tag>
      <el-text v-if="hint" type="warning" size="small">{{ hint }}</el-text>
      <el-text v-if="shellMode === 'adb'" type="success" size="small">ADB PTY（本机 adb 已连接设备）</el-text>
      <el-text v-else-if="shellMode === 'agent'" type="info" size="small">经 Agent（无 TTY 时输入为本地回显）</el-text>
    </div>
    <div ref="termRef" style="flex:1;min-height:240px;background:#000;border-radius:4px;padding:4px" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { WSClient } from '@/utils/ws'
import * as deviceApi from '@/api/device'

const route = useRoute()
const devices = ref([])
const deviceId = ref(route.query.device ? Number(route.query.device) || route.query.device : '')
const connected = ref(false)
const hint = ref('')
const shellMode = ref(null)
const termRef = ref(null)
let ws = null
let term = null
let fitAddon = null
let shellMetaHandled = false

const fitTerm = () => {
  nextTick(() => {
    try {
      fitAddon?.fit()
    } catch {
      /* noop */
    }
  })
}

const onWinResize = () => fitTerm()

const initTerm = () => {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    theme: { background: '#1e1e1e', foreground: '#d4d4d4' }
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termRef.value)
  fitTerm()
  term.onData((data) => {
    // Agent 侧 sh 无伪终端时常无回显；ADB PTY 由设备端回显，勿重复
    if (shellMode.value === 'agent') {
      term.write(data)
    }
    ws?.send(data)
  })
}

const connect = () => {
  ws?.close()
  term?.clear()
  hint.value = ''
  shellMode.value = null
  shellMetaHandled = false
  if (!deviceId.value) return
  ws = new WSClient(`/ws/shell/${deviceId.value}`, {
    reconnect: false,
    onOpen: () => {
      connected.value = true
      hint.value = ''
      fitTerm()
      term?.writeln('\x1b[90m正在建立 Shell…\x1b[0m')
    },
    onClose: () => {
      connected.value = false
      shellMode.value = null
    },
    onError: () => {
      ElMessage.error('无法建立 Shell：请确认设备存在；若仅 WiFi Agent，需 Agent 在线；若 USB/ADB 连在服务器上，需 adb devices 为 device')
    },
    onMessage: (data) => {
      if (!shellMetaHandled && typeof data === 'string') {
        try {
          const j = JSON.parse(data)
          if (j.type === 'shell_meta') {
            shellMode.value = j.mode === 'adb' ? 'adb' : j.mode === 'agent' ? 'agent' : null
            shellMetaHandled = true
            if (j.mode === 'adb') {
              term?.writeln('\x1b[90m已连接：服务器 ADB → 设备交互式 shell（PTY）。\x1b[0m')
            } else {
              term?.writeln('\x1b[90m已连接：Agent /system/bin/sh（无 TTY 时见本地回显）。\x1b[0m')
            }
            return
          }
        } catch {
          /* 非 JSON，当作终端输出 */
        }
      }
      term?.write(data)
    }
  })
  ws.connect()
}

onMounted(async () => {
  const res = await deviceApi.getDevices()
  devices.value = res.data
  initTerm()
  window.addEventListener('resize', onWinResize)
  if (deviceId.value) connect()
})

onUnmounted(() => {
  window.removeEventListener('resize', onWinResize)
  ws?.close()
  term?.dispose()
})
</script>
