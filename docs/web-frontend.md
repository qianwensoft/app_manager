# Web 前端技术文档

## 概述

基于 Vue 3 的 AppManager 管理界面，提供设备管理、APK 分发、实时屏幕查看、Shell 终端、日志查看等功能。

---

## 技术栈

```
框架：Vue 3 (Composition API)
构建工具：Vite
状态管理：Pinia
路由：Vue Router 4
UI 组件库：Element Plus
HTTP 客户端：Axios
终端模拟器：xterm.js + @xterm/addon-fit
WebSocket：原生 WebSocket API
```

---

## 项目结构

```
web/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   └── index.js
│   ├── stores/
│   │   ├── auth.js
│   │   ├── device.js
│   │   └── task.js
│   ├── api/
│   │   ├── http.js
│   │   ├── auth.js
│   │   ├── device.js
│   │   ├── app.js
│   │   └── task.js
│   ├── utils/
│   │   ├── ws.js
│   │   └── format.js
│   ├── views/
│   │   ├── Login.vue
│   │   ├── Dashboard.vue
│   │   ├── Devices.vue
│   │   ├── DeviceDetail.vue
│   │   ├── Screen.vue
│   │   ├── Shell.vue
│   │   ├── Logcat.vue
│   │   ├── Apps.vue
│   │   ├── Tasks.vue
│   │   ├── ApiKeys.vue
│   │   └── AuditLog.vue
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.vue
│       │   └── Header.vue
│       ├── DeviceCard.vue
│       ├── ScreenViewer.vue
│       ├── TerminalTab.vue
│       ├── LogcatViewer.vue
│       ├── InstallModal.vue
│       ├── AdbOpsPanel.vue
│       └── FileManager.vue
```

---

## 核心模块详解

### 1. HTTP 封装 (api/http.js)

```javascript
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000
})

// 请求拦截器
http.interceptors.request.use(
  config => {
    const authStore = useAuthStore()
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器
http.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.logout()
      router.push('/login')
      ElMessage.error('登录已过期，请重新登录')
    } else {
      ElMessage.error(error.response?.data?.message || '请求失败')
    }
    return Promise.reject(error)
  }
)

export default http
```

---

### 2. WebSocket 封装 (utils/ws.js)

```javascript
export class WSClient {
  constructor(url, options = {}) {
    this.url = url
    this.ws = null
    this.reconnectInterval = options.reconnectInterval || 3000
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10
    this.reconnectAttempts = 0
    this.onMessage = options.onMessage || (() => {})
    this.onOpen = options.onOpen || (() => {})
    this.onClose = options.onClose || (() => {})
    this.onError = options.onError || (() => {})
  }

  connect() {
    const authStore = useAuthStore()
    const wsUrl = `${this.url}?token=${authStore.token}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.onOpen()
    }

    this.ws.onmessage = (event) => {
      this.onMessage(event.data)
    }

    this.ws.onerror = (error) => {
      this.onError(error)
    }

    this.ws.onclose = () => {
      this.onClose()
      this.reconnect()
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => this.connect(), this.reconnectInterval)
    }
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  close() {
    this.maxReconnectAttempts = 0
    this.ws?.close()
  }
}
```

---

### 3. 认证 Store (stores/auth.js)

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as authApi from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(null)

  const login = async (username, password) => {
    const res = await authApi.login(username, password)
    token.value = res.data.token
    user.value = res.data.user
    localStorage.setItem('token', token.value)
  }

  const logout = () => {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
  }

  const fetchMe = async () => {
    const res = await authApi.getMe()
    user.value = res.data
  }

  return { token, user, login, logout, fetchMe }
})
```

---

### 4. 设备 Store (stores/device.js)

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as deviceApi from '@/api/device'

export const useDeviceStore = defineStore('device', () => {
  const devices = ref([])
  const currentDevice = ref(null)

  const fetchDevices = async () => {
    const res = await deviceApi.getDevices()
    devices.value = res.data
  }

  const fetchDeviceInfo = async (id) => {
    const res = await deviceApi.getDeviceInfo(id)
    currentDevice.value = res.data
  }

  const connectDevice = async (id, ip, port) => {
    await deviceApi.connectDevice(id, { ip, port })
    await fetchDevices()
  }

  return { devices, currentDevice, fetchDevices, fetchDeviceInfo, connectDevice }
})
```

---

### 5. 屏幕查看组件 (components/ScreenViewer.vue)

```vue
<template>
  <div class="screen-viewer">
    <canvas ref="canvasRef" :width="width" :height="height"></canvas>
    <div v-if="!connected" class="overlay">连接中...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { WSClient } from '@/utils/ws'

const props = defineProps({
  deviceId: String
})

const canvasRef = ref(null)
const width = ref(540)
const height = ref(960)
const connected = ref(false)
let ws = null

onMounted(() => {
  const wsUrl = `${import.meta.env.VITE_WS_BASE_URL}/ws/screen/${props.deviceId}`

  ws = new WSClient(wsUrl, {
    onOpen: () => { connected.value = true },
    onClose: () => { connected.value = false },
    onMessage: (data) => {
      const blob = new Blob([data], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const ctx = canvasRef.value.getContext('2d')
        ctx.drawImage(img, 0, 0, width.value, height.value)
        URL.revokeObjectURL(url)
      }
      img.src = url
    }
  })

  ws.connect()
})

onUnmounted(() => {
  ws?.close()
})
</script>

<style scoped>
.screen-viewer {
  position: relative;
  display: inline-block;
}
canvas {
  border: 1px solid #ddd;
  background: #000;
}
.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 18px;
}
</style>
```

---

### 6. Shell 终端组件 (components/TerminalTab.vue)

```vue
<template>
  <div ref="terminalRef" class="terminal-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WSClient } from '@/utils/ws'
import 'xterm/css/xterm.css'

const props = defineProps({
  deviceId: String
})

const terminalRef = ref(null)
let terminal = null
let fitAddon = null
let ws = null

onMounted(() => {
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    theme: { background: '#1e1e1e' }
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalRef.value)
  fitAddon.fit()

  const wsUrl = `${import.meta.env.VITE_WS_BASE_URL}/ws/shell/${props.deviceId}`

  ws = new WSClient(wsUrl, {
    onOpen: () => {
      terminal.write('\r\n*** Connected to device ***\r\n')
    },
    onMessage: (data) => {
      terminal.write(data)
    },
    onClose: () => {
      terminal.write('\r\n*** Connection closed ***\r\n')
    }
  })

  ws.connect()

  terminal.onData(data => {
    ws.send(data)
  })

  window.addEventListener('resize', () => fitAddon.fit())
})

onUnmounted(() => {
  ws?.close()
  terminal?.dispose()
})
</script>

<style scoped>
.terminal-container {
  width: 100%;
  height: 600px;
}
</style>
```

---

### 7. Logcat 查看组件 (components/LogcatViewer.vue)

```vue
<template>
  <div class="logcat-viewer">
    <div class="toolbar">
      <el-input v-model="filter" placeholder="过滤关键词" style="width: 300px" />
      <el-select v-model="level" placeholder="日志级别" style="width: 150px">
        <el-option label="全部" value="" />
        <el-option label="Verbose" value="V" />
        <el-option label="Debug" value="D" />
        <el-option label="Info" value="I" />
        <el-option label="Warning" value="W" />
        <el-option label="Error" value="E" />
      </el-select>
      <el-button @click="clearLogs">清空</el-button>
    </div>
    <div ref="logContainer" class="log-container">
      <div v-for="(log, idx) in filteredLogs" :key="idx" :class="['log-line', `level-${log.level}`]">
        {{ log.text }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { WSClient } from '@/utils/ws'

const props = defineProps({
  deviceId: String
})

const logs = ref([])
const filter = ref('')
const level = ref('')
const logContainer = ref(null)
let ws = null

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    if (filter.value && !log.text.includes(filter.value)) return false
    if (level.value && log.level !== level.value) return false
    return true
  })
})

const parseLogLine = (line) => {
  const match = line.match(/^([VDIWEF])\//)
  return {
    level: match ? match[1] : 'I',
    text: line
  }
}

const clearLogs = () => {
  logs.value = []
}

onMounted(() => {
  const wsUrl = `${import.meta.env.VITE_WS_BASE_URL}/ws/logcat/${props.deviceId}`

  ws = new WSClient(wsUrl, {
    onMessage: (data) => {
      logs.value.push(parseLogLine(data))
      if (logs.value.length > 1000) {
        logs.value.shift()
      }
      nextTick(() => {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      })
    }
  })

  ws.connect()
})

onUnmounted(() => {
  ws?.close()
})
</script>

<style scoped>
.logcat-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.toolbar {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #ddd;
}
.log-container {
  flex: 1;
  overflow-y: auto;
  background: #1e1e1e;
  color: #ddd;
  font-family: monospace;
  font-size: 12px;
  padding: 10px;
}
.log-line {
  padding: 2px 0;
}
.level-E { color: #f56c6c; }
.level-W { color: #e6a23c; }
.level-I { color: #67c23a; }
.level-D { color: #409eff; }
.level-V { color: #909399; }
</style>
```

---

### 8. ADB 操作面板 (components/AdbOpsPanel.vue)

```vue
<template>
  <el-card title="快捷操作">
    <el-space wrap>
      <el-button @click="reboot">重启设备</el-button>
      <el-button @click="screenshot">截图</el-button>
      <el-button @click="showKeyEventDialog">模拟按键</el-button>
      <el-button @click="showInputDialog">输入文字</el-button>
    </el-space>
  </el-card>

  <el-dialog v-model="keyEventVisible" title="模拟按键">
    <el-select v-model="keycode" placeholder="选择按键">
      <el-option label="Home (3)" :value="3" />
      <el-option label="Back (4)" :value="4" />
      <el-option label="Menu (82)" :value="82" />
      <el-option label="Power (26)" :value="26" />
    </el-select>
    <template #footer>
      <el-button @click="keyEventVisible = false">取消</el-button>
      <el-button type="primary" @click="sendKeyEvent">发送</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="inputVisible" title="输入文字">
    <el-input v-model="inputText" placeholder="输入内容" />
    <template #footer>
      <el-button @click="inputVisible = false">取消</el-button>
      <el-button type="primary" @click="sendInput">发送</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as deviceApi from '@/api/device'

const props = defineProps({
  deviceId: [String, Number]
})

const keyEventVisible = ref(false)
const inputVisible = ref(false)
const keycode = ref(3)
const inputText = ref('')

const reboot = async () => {
  await deviceApi.rebootDevice(props.deviceId)
  ElMessage.success('重启指令已发送')
}

const screenshot = async () => {
  const res = await deviceApi.screenshotDevice(props.deviceId)
  window.open(res.data.url)
}

const showKeyEventDialog = () => {
  keyEventVisible.value = true
}

const sendKeyEvent = async () => {
  await deviceApi.keyEvent(props.deviceId, keycode.value)
  keyEventVisible.value = false
  ElMessage.success('按键已发送')
}

const showInputDialog = () => {
  inputVisible.value = true
}

const sendInput = async () => {
  await deviceApi.inputText(props.deviceId, inputText.value)
  inputVisible.value = false
  inputText.value = ''
  ElMessage.success('文字已输入')
}
</script>
```

---

### 9. 路由配置 (router/index.js)

```javascript
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue')
  },
  {
    path: '/',
    component: () => import('@/components/layout/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue')
      },
      {
        path: 'devices',
        name: 'Devices',
        component: () => import('@/views/Devices.vue')
      },
      {
        path: 'devices/:id',
        name: 'DeviceDetail',
        component: () => import('@/views/DeviceDetail.vue')
      },
      {
        path: 'screen',
        name: 'Screen',
        component: () => import('@/views/Screen.vue')
      },
      {
        path: 'shell',
        name: 'Shell',
        component: () => import('@/views/Shell.vue')
      },
      {
        path: 'logcat',
        name: 'Logcat',
        component: () => import('@/views/Logcat.vue')
      },
      {
        path: 'apps',
        name: 'Apps',
        component: () => import('@/views/Apps.vue')
      },
      {
        path: 'tasks',
        name: 'Tasks',
        component: () => import('@/views/Tasks.vue')
      },
      {
        path: 'apikeys',
        name: 'ApiKeys',
        component: () => import('@/views/ApiKeys.vue')
      },
      {
        path: 'audit',
        name: 'AuditLog',
        component: () => import('@/views/AuditLog.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.token) {
    next('/login')
  } else {
    next()
  }
})

export default router
```

---

### 10. 主入口 (main.js)

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)

app.mount('#app')
```

---

### 11. Vite 配置 (vite.config.js)

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      }
    }
  }
})
```

---

### 12. 环境变量配置

```bash
# .env.development
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=ws://localhost:8080

# .env.production
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=wss://your-domain.com
```

---

### 13. package.json

```json
{
  "name": "app-manager-web",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.5",
    "pinia": "^2.1.7",
    "axios": "^1.6.5",
    "element-plus": "^2.5.4",
    "xterm": "^5.3.0",
    "@xterm/addon-fit": "^0.10.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.3",
    "vite": "^5.0.11"
  }
}
```

---

## 关键功能实现

### 实时屏幕同步流程
```
1. 用户打开 Screen 页面
2. 前端建立 WebSocket 连接到 /ws/screen/:deviceId
3. Server 从 Agent 或 ADB 获取屏幕帧（JPEG）
4. Server 通过 WebSocket 推送二进制数据到前端
5. 前端将 Blob 转为 Image，绘制到 Canvas
6. 循环接收帧，实现实时画面
```

### Shell 终端交互流程
```
1. 用户打开 Shell 页面
2. xterm.js 初始化终端 UI
3. 建立 WebSocket 到 /ws/shell/:deviceId
4. Server 启动 PTY + adb shell 进程
5. 用户输入 → xterm.onData → WebSocket 发送 → Server 写入 PTY
6. PTY 输出 → Server 读取 → WebSocket 推送 → xterm.write 显示
```

---

## 开发注意事项

1. **WebSocket 重连**：网络不稳定时需自动重连，避免用户手动刷新
2. **Canvas 性能**：高帧率屏幕流需优化渲染，避免卡顿
3. **xterm.js 适配**：终端需响应窗口大小变化，使用 FitAddon
4. **日志过滤**：Logcat 日志量大，需前端过滤 + 限制缓存数量
5. **Token 刷新**：JWT 过期前需提示或自动刷新
6. **权限控制**：根据用户角色隐藏/禁用部分功能按钮
7. **文件上传**：APK 文件大，需显示上传进度条
8. **错误处理**：API 失败需友好提示，避免白屏
