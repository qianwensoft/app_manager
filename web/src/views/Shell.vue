<template>
  <div style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <el-select v-model="deviceId" placeholder="选择设备" style="width:220px" @change="connect">
        <el-option v-for="d in devices" :key="d.id" :label="d.name || d.serial" :value="d.id" />
      </el-select>
      <el-tag :type="connected ? 'success' : 'info'">{{ connected ? '已连接' : '未连接' }}</el-tag>
      <el-text v-if="hint" type="warning" size="small">{{ hint }}</el-text>
      <el-text v-if="shellMode === 'adb'" type="success" size="small">ADB PTY（本机 adb 已连接设备）</el-text>
      <el-text v-else-if="shellMode === 'agent'" type="info" size="small">经 Agent：回车提交；Ctrl+C 中断运行中命令</el-text>
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
let termResizeObserver = null
let shellMetaHandled = false
/** 收到 shell_meta 后再转发输入，避免 start_shell 未就绪时按键被丢弃 */
let shellInputReady = false
/** Agent 模式：整行缓冲，仅回车时发往服务端（与端上按行 sh -c 一致） */
let agentLineBuffer = ''

/** 子进程常用 `\r` 刷新行（如 ping），在 xterm 自动换行后会产生错位缩进；规整为 `\n` */
function normalizeAgentRemoteOutput(s) {
  if (typeof s !== 'string') return s
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

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
    if (!shellInputReady) {
      return
    }
    if (shellMode.value === 'agent') {
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          ws?.send(agentLineBuffer + '\n')
          agentLineBuffer = ''
          term.write('\r\n')
        } else if (ch === '\u007f' || ch === '\b') {
          if (agentLineBuffer.length > 0) {
            agentLineBuffer = agentLineBuffer.slice(0, -1)
            term.write('\b \b')
          }
        } else if (ch === '\u0003') {
          agentLineBuffer = ''
          ws?.send('\u0003')
          term.write('^C\r\n')
        } else {
          agentLineBuffer += ch
          term.write(ch)
        }
      }
      return
    }
    // ADB PTY：逐键转发，由设备端回显
    ws?.send(data)
  })
}

const connect = () => {
  ws?.close()
  term?.clear()
  hint.value = ''
  shellMode.value = null
  shellMetaHandled = false
  shellInputReady = false
  agentLineBuffer = ''
  if (!deviceId.value) return
  ws = new WSClient(`/ws/shell/${deviceId.value}`, {
    reconnect: false,
    onOpen: () => {
      connected.value = true
      hint.value = ''
      fitTerm()
      term?.writeln('\x1b[90m正在建立 Shell…\x1b[0m')
    },
    onClose: (code, reason) => {
      connected.value = false
      shellMode.value = null
      shellInputReady = false
      agentLineBuffer = ''
      if (code != null && code !== 1000) {
        const r = (reason && String(reason).trim()) || `code ${code}`
        hint.value = `连接已断开（${r}）。无权限时请使用管理员/运维账号。`
      }
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
            shellInputReady = true
            if (j.mode === 'adb') {
              term?.writeln('\x1b[90m已连接：服务器 ADB → 设备交互式 shell（PTY）。\x1b[0m')
            } else {
              term?.writeln(
                '\x1b[90mAgent：回车提交一行；Ctrl+C 可中断正在运行的命令（如 ping）。\x1b[0m'
              )
            }
            nextTick(() => fitTerm())
            return
          }
        } catch {
          /* 非 JSON，当作终端输出 */
        }
      }
      if (shellMetaHandled && shellMode.value === 'agent') {
        term?.write(normalizeAgentRemoteOutput(data))
      } else {
        term?.write(data)
      }
    }
  })
  ws.connect()
}

onMounted(async () => {
  const res = await deviceApi.getDevices()
  devices.value = res.data
  initTerm()
  window.addEventListener('resize', onWinResize)
  nextTick(() => {
    if (termRef.value && typeof ResizeObserver !== 'undefined') {
      termResizeObserver = new ResizeObserver(() => fitTerm())
      termResizeObserver.observe(termRef.value)
    }
  })
  if (deviceId.value) connect()
})

onUnmounted(() => {
  window.removeEventListener('resize', onWinResize)
  termResizeObserver?.disconnect()
  termResizeObserver = null
  ws?.close()
  term?.dispose()
})
</script>
