type AndroidBridge = {
  getDeviceToken?: () => string
  getUserToken?: () => string
  getServerUrl?: () => string
  scanBarcode?: () => void
  toast?: (msg: string) => void
}

export function getAndroidBridge(): AndroidBridge | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { AndroidBridge?: AndroidBridge }).AndroidBridge ?? null
}

export function isAgentRuntime(): boolean {
  const bridge = getAndroidBridge()
  return typeof bridge?.getDeviceToken === 'function' && !!bridge.getDeviceToken()
}

export async function runtimeFetch(path: string, method: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const bridge = getAndroidBridge()
  if (bridge?.getDeviceToken) {
    headers['X-Device-Token'] = bridge.getDeviceToken()
    // 同时注入 JWT token（如果 Agent 侧已配置登录态）
    const userToken = bridge.getUserToken?.() || ''
    if (userToken) headers.Authorization = `Bearer ${userToken}`
  } else {
    const token = localStorage.getItem('token') || ''
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const resp = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
  return data
}

/** 从 bridge 或 localStorage 取当前 JWT token（供个人中心等非 runtimeFetch 场景使用）。 */
export function getRuntimeToken(): string {
  const bridge = getAndroidBridge()
  if (bridge?.getUserToken) return bridge.getUserToken() || ''
  return localStorage.getItem('token') || ''
}

/** 从 bridge 或 localStorage 取服务端 base URL（供个人中心登录调用）。 */
export function getRuntimeServerBase(): string {
  const bridge = getAndroidBridge()
  if (bridge?.getServerUrl) return bridge.getServerUrl() || ''
  // 浏览器环境：同源
  return ''
}
