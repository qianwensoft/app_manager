type AndroidBridge = {
  getDeviceToken?: () => string
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
  } else {
    const token = localStorage.getItem('token') || ''
    headers.Authorization = `Bearer ${token}`
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
