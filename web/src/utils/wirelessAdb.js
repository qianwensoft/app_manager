/** 从旧版 wireless_adb_serial（ip:port）解析端口 */
export function parseWirelessConnectPort(serial) {
  if (!serial || typeof serial !== 'string') return null
  const idx = serial.lastIndexOf(':')
  if (idx < 0 || idx >= serial.length - 1) return null
  const port = parseInt(serial.slice(idx + 1), 10)
  return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : null
}

/** 从设备对象读取已保存的无线 ADB 端口 */
export function savedWirelessPortFromDevice(dev) {
  const p = Number(dev?.wireless_adb_port)
  if (Number.isFinite(p) && p >= 1 && p <= 65535) return p
  return parseWirelessConnectPort(dev?.wireless_adb_serial)
}

export function wirelessStateType(state) {
  if (state === 'device') return 'success'
  if (state === 'offline' || state === 'no_device') return 'danger'
  if (state === 'not_configured') return 'info'
  if (state === 'connecting') return 'warning'
  if (state === 'unauthorized') return 'warning'
  return 'warning'
}

export function wirelessStateLabel(state) {
  const map = {
    device: '已连接',
    offline: '未连接',
    no_device: '未找到',
    not_configured: '未配置',
    connecting: '连接中',
    unauthorized: '未授权'
  }
  return map[state] || state
}

export const WIRELESS_ADB_MENU_INTENT = 'com.appmanager.agent.ACTION_OPEN_WIRELESS_ADB'
