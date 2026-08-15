import axios from 'axios'
import http from './http'

export const getDevices = (params) => http.get('/devices', { params })
export const getDevice = (id) => http.get(`/devices/${id}`)
export const createDevice = (data) => http.post('/devices', data)
export const updateDevice = (id, data) => http.put(`/devices/${id}`, data)
export const deleteDevice = (id) => http.delete(`/devices/${id}`)
export const scanDevices = () => http.post('/devices/scan')
export const connectDevice = (id, data) => http.post(`/devices/${id}/connect`, data)
export const getDeviceInfo = (id) => http.get(`/devices/${id}/info`)
export const getDeviceApps = (id) => http.get(`/devices/${id}/apps`)

export const getScreenShareClaims = async (deviceId, shareToken) => {
  const r = await fetch(
    `/api/screen-share/claims?device=${encodeURIComponent(deviceId)}&share=${encodeURIComponent(shareToken)}`
  )
  return r.json()
}

// ── 设备注册（反向注册，电视等无摄像头端亦可用）：浏览器直连设备上的 ReverseRegisterServer ──
// 不走 axios（baseURL 是本系统 /api），而是直连设备的 http://<ip>:<port>。
const REVERSE_REGISTER_PORT = 8765

const reverseBase = (ip, port = REVERSE_REGISTER_PORT) => `http://${ip}:${port}`

// 拉取设备端机型信息以供管理端展示确认。带超时避免 IP 错误时长时间挂起。
export const fetchAgentInfo = async (ip, port = REVERSE_REGISTER_PORT) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch(`${reverseBase(ip, port)}/agent/info`, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

// 携带授权码 + serverUrl 认领设备端。serverUrl 用当前页面 host，与扫码接入一致。
export const claimAgent = async (ip, payload, port = REVERSE_REGISTER_PORT) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const r = await fetch(`${reverseBase(ip, port)}/agent/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

export const createScreenShare = (deviceId, data) => http.post(`/devices/${deviceId}/screen-shares`, data)
export const listScreenShares = (deviceId) => http.get(`/devices/${deviceId}/screen-shares`)
export const revokeScreenShare = (deviceId, shareId) => http.delete(`/devices/${deviceId}/screen-shares/${shareId}`)

/** Agent 在线时由手机端枚举已安装应用并写入服务端缓存 */
export const refreshDeviceApps = (id) =>
  http.post(`/devices/${id}/apps/refresh`, null, { timeout: 55000 })

/**
 * Agent 在线：从设备读取 APK（多 split 为 zip）并下载到本机。返回 { blob, filename }。
 */
export const pullInstalledApk = async (id, packageName) => {
  const token = localStorage.getItem('token')
  const res = await axios.post(
    `/devices/${id}/apps/pull-apk`,
    { package_name: packageName },
    {
      baseURL: http.defaults.baseURL,
      timeout: 750000,
      responseType: 'blob',
      validateStatus: () => true,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  )
  const blob = res.data
  if (res.status >= 400) {
    let msg = `下载失败 (HTTP ${res.status})`
    try {
      const t = await blob.text()
      const j = JSON.parse(t)
      if (j.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  let filename = `${packageName}.apk`
  const cd = res.headers['content-disposition']
  if (cd) {
    const m = /filename="([^"]+)"/.exec(cd) || /filename=([^;]+)/.exec(cd)
    if (m) filename = m[1].trim()
  }
  return { blob, filename }
}

/**
 * Agent 在线：从设备导出 APK 到服务器 APK 管理（不下载到本地）
 */
export const exportInstalledApkToServer = (id, packageName) =>
  http.post(`/devices/${id}/apps/export-to-server`, { package_name: packageName }, { timeout: 300000 })

// ADB 操作
export const rebootDevice = (id) => http.post(`/devices/${id}/adb/reboot`)

/** POST screenshot; returns Blob. Uses raw axios so Authorization + responseType blob work. */
export const captureScreenshot = async (id) => {
  const token = localStorage.getItem('token')
  const res = await axios.post(`/devices/${id}/adb/screenshot`, null, {
    baseURL: http.defaults.baseURL,
    timeout: 120000,
    responseType: 'blob',
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  const blob = res.data
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  if (!isPng) {
    const text = await blob.text()
    let msg = '截图失败'
    try {
      const j = JSON.parse(text)
      if (j.error) msg = j.error
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    throw new Error(msg)
  }
  if (res.status >= 400) {
    throw new Error(`截图失败 (HTTP ${res.status})`)
  }
  return blob
}
export const keyEvent = (id, keycode) => http.post(`/devices/${id}/adb/keyevent`, { keycode })
// 虚拟导航键（经 Agent 无障碍 performGlobalAction）：key = back | home | recents | notifications | quick_settings | power_dialog | lock_screen
export const agentNavKey = (id, key) => http.post(`/devices/${id}/agent/nav-key`, { key })
// 远程键盘输入（经 Agent 无障碍 ACTION_SET_TEXT / 焦点操作，无需 ADB）
// body: { input_method?: 'text'|'keys'|'mixed', text?: string, keys?: string[], delay_ms?: number, target_app?: string }
export const agentKeyboardInput = (id, body) => http.post(`/devices/${id}/agent/keyboard-input`, body)
export const inputText = (id, text) => http.post(`/devices/${id}/adb/input/text`, { text })
export const startApp = (id, pkg) => http.post(`/devices/${id}/adb/app/start`, { package: pkg })
export const stopApp = (id, pkg) => http.post(`/devices/${id}/adb/app/stop`, { package: pkg })
export const clearApp = (id, pkg) => http.post(`/devices/${id}/adb/app/clear`, { package: pkg })
export const grantPermission = (id, pkg, permission) => http.post(`/devices/${id}/adb/app/grant`, { package: pkg, permission })
export const listFiles = (id, path) => http.get(`/devices/${id}/adb/files`, { params: { path } })

/** Agent 文件系统：列目录（仅 Agent 在线可用） */
export const listAgentFs = (id, path, opts = {}) =>
  http.get(`/devices/${id}/agent/fs/list`, {
    params: { path, include_hidden: opts.includeHidden ? '1' : '0' }
  })

/** Agent 在线时测 WS 延迟 + HTTP 上下行吞吐；耗时较长 */
export const runSpeedTest = (id) =>
  http.post(`/devices/${id}/speed-test`, null, { timeout: 130000 })

/** 设备文件管理汇总：录屏（Recording）+ 截图/音频存档（DeviceMedia） */
export const listDeviceFileHub = (id) => http.get(`/devices/${id}/file-hub`)

export const uploadDeviceMedia = (deviceId, file, category) => {
  const fd = new FormData()
  fd.append('category', category)
  fd.append('file', file)
  return http.post(`/devices/${deviceId}/media/upload`, fd, { timeout: 120000 })
}

export const deleteDeviceMedia = (id) => http.delete(`/device-media/${id}`)
export const renameDeviceMedia = (id, fileName) => http.patch(`/device-media/${id}`, { file_name: fileName })
export const deleteRecording = (id) => http.delete(`/recordings/${id}`)
export const renameRecording = (id, file_name) => http.patch(`/recordings/${id}`, { file_name })

/** Agent 在线时请求端上立即上报 device_info（Wi‑Fi SSID 等），返回更新后的设备对象 */
export const refreshAgentDeviceInfo = (id) =>
  http.post(`/devices/${id}/agent/refresh-info`, null, { timeout: 20000 })

/** 通知 Agent 打开系统「无线调试」设置页 */
export const openWirelessAdbOnAgent = (id) =>
  http.post(`/devices/${id}/agent/open-wireless-adb`)

/** 远程触发 Agent 菜单 intent_action（如无线 ADB 内置菜单） */
export const triggerAgentMenu = (id, intentAction) =>
  http.post(`/devices/${id}/agent/trigger-menu`, { intent_action: intentAction })

/** 通过 ADB 为 Agent 授予 android.permission.READ_LOGS，授权后 Agent 可读取全量日志 */
export const grantAgentReadLogs = (id) =>
  http.post(`/devices/${id}/adb/grant-read-logs`)

/** 用 Agent 上报的设备 IP + 端口，让服务器发起 adb connect（无线 ADB 快捷连接）
 *  ip 可选，传入时覆盖 DB 中的 device.IP（配对后直接用配对返回的 ip） */
export const adbConnectByAgentIP = (id, port = 5555, ip = '') =>
  http.post(`/devices/${id}/adb/connect-by-ip`, { port, ...(ip ? { ip } : {}) }, { timeout: 20000 })

/** 用 Agent 上报的 IP + 配对端口 + 配对码，让服务器发起 adb pair（Android 11+ 无线配对）
 *  ip 可选，传入时覆盖 DB 中的 device.IP（QR 码直接携带 IP 时使用） */
export const adbPairByAgentIP = (id, port, code, ip = '') =>
  http.post(`/devices/${id}/adb/pair-by-ip`, { port, code, ...(ip ? { ip } : {}) })

/** 查询设备 USB 与无线 ADB 连接状态 */
export const getAdbStatus = (id) => http.get(`/devices/${id}/adb/status`)

/** 断开无线 ADB；clearRecord=true 时同时清除上次连接记录 */
export const adbWirelessDisconnect = (id, clearRecord = false) =>
  http.post(`/devices/${id}/adb/disconnect`, clearRecord ? { clear_record: true } : {})

/** 通过 ADB 在设备上执行单条 shell 命令 */
export const adbShellRun = (id, command) => http.post(`/devices/${id}/adb/shell`, { command })

/** 推送 Agent 更新到设备 */
export const pushAgentUpdate = (id, version) => http.post(`/devices/${id}/agent/push-update`, { version })
