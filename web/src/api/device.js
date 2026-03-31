import axios from 'axios'
import http from './http'

export const getDevices = () => http.get('/devices')
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

export const createScreenShare = (deviceId, data) => http.post(`/devices/${deviceId}/screen-shares`, data)
export const listScreenShares = (deviceId) => http.get(`/devices/${deviceId}/screen-shares`)
export const revokeScreenShare = (deviceId, shareId) => http.delete(`/devices/${deviceId}/screen-shares/${shareId}`)

/** Agent 在线时由手机端枚举已安装应用并写入服务端缓存 */
export const refreshDeviceApps = (id) =>
  http.post(`/devices/${id}/apps/refresh`, null, { timeout: 55000 })

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
export const inputText = (id, text) => http.post(`/devices/${id}/adb/input/text`, { text })
export const startApp = (id, pkg) => http.post(`/devices/${id}/adb/app/start`, { package: pkg })
export const stopApp = (id, pkg) => http.post(`/devices/${id}/adb/app/stop`, { package: pkg })
export const clearApp = (id, pkg) => http.post(`/devices/${id}/adb/app/clear`, { package: pkg })
export const grantPermission = (id, pkg, permission) => http.post(`/devices/${id}/adb/app/grant`, { package: pkg, permission })
export const listFiles = (id, path) => http.get(`/devices/${id}/adb/files`, { params: { path } })

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
export const deleteRecording = (id) => http.delete(`/recordings/${id}`)
export const renameRecording = (id, file_name) => http.patch(`/recordings/${id}`, { file_name })

/** Agent 在线时请求端上立即上报 device_info（Wi‑Fi SSID 等），返回更新后的设备对象 */
export const refreshAgentDeviceInfo = (id) =>
  http.post(`/devices/${id}/agent/refresh-info`, null, { timeout: 20000 })

/** Agent 在线且允许拉取时，列出设备目录（GET ?path=） */
export const agentListFiles = (id, path) =>
  http.get(`/devices/${id}/adb/agent/files`, {
    params: { path: path || '/sdcard' },
    timeout: 40000
  })

/** Agent 在线且端上开启「允许远程拉取文件」时，经 Agent 读设备路径并下载（无 ADB） */
export const agentPullFile = async (id, path) => {
  const token = localStorage.getItem('token')
  const res = await axios.post(
    `/devices/${id}/adb/agent/pull-file`,
    { path },
    {
      baseURL: http.defaults.baseURL,
      timeout: 130000,
      responseType: 'blob',
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }
  )
  const blob = res.data
  if (res.status >= 400) {
    const text = await blob.text()
    let msg = '拉取失败'
    try {
      const j = JSON.parse(text)
      if (j.error) msg = j.error
    } catch {
      if (text) msg = text.slice(0, 300)
    }
    throw new Error(msg)
  }
  const cd = res.headers['content-disposition']
  let name = 'download'
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd)
    if (m) name = decodeURIComponent(m[1].trim())
  }
  return { blob, filename: name }
}
