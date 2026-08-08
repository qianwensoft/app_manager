/**
 * SCADA Agent 扫码事件总线
 * 
 * 接收来自 Android WebView JSBridge (window.ScadaBridge) 的扫码事件，
 * 并派发给工作流引擎。类似 form-app 的 eventManager。
 * 
 * 事件流：
 * 1. Android 扫码枪/摄像头 → ScadaBridge.onScanResult()
 * 2. JSBridge 调用 window.scadaEventBus.emit('agent_scan', eventData)
 * 3. 事件总线派发给所有监听器
 * 4. useWorkflowRuntime 接收并触发 agent_scan 工作流
 */

type ScanEventData = {
  value: string
  event_type: string
  device_id: string
}

type EventHandler = (data: ScanEventData) => void

class ScadaEventBus {
  private handlers: Map<string, EventHandler[]> = new Map()

  on(eventType: string, handler: EventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  off(eventType: string, handler: EventHandler) {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx > -1) handlers.splice(idx, 1)
    }
  }

  emit(eventType: string, data: ScanEventData) {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.forEach(h => h(data))
    }
  }

  clear() {
    this.handlers.clear()
  }
}

export const scadaEventBus = new ScadaEventBus()

// 注入到 window 供 Android JSBridge 调用
if (typeof window !== 'undefined') {
  (window as any).scadaEventBus = scadaEventBus
}

/**
 * 检测是否运行在 Android Agent WebView 环境
 */
export function isAgentRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ScadaBridge
}

/**
 * 获取 Android Bridge（如果存在）
 */
export function getScadaBridge(): any {
  if (typeof window === 'undefined') return null
  return (window as any).ScadaBridge || null
}

/**
 * 触发摄像头扫码（仅 Agent 环境）
 */
export function triggerAgentScan() {
  const bridge = getScadaBridge()
  if (bridge?.scanBarcode) {
    bridge.scanBarcode()
  }
}

/**
 * 获取扫码模式（hardware / camera）
 */
export function getAgentScanMode(): string {
  const bridge = getScadaBridge()
  return bridge?.getScanMode?.() || 'camera'
}

/**
 * 获取设备信息
 */
export function getAgentDeviceInfo(): { device_id: string; model: string; brand: string; os_version: string } | null {
  const bridge = getScadaBridge()
  if (!bridge?.getDeviceInfo) return null
  try {
    return JSON.parse(bridge.getDeviceInfo())
  } catch {
    return null
  }
}

/**
 * Toast 提示（Agent 环境）
 */
export function agentToast(message: string) {
  const bridge = getScadaBridge()
  if (bridge?.toast) {
    bridge.toast(message)
  } else if (typeof window !== 'undefined') {
    // 降级到浏览器 alert
    alert(message)
  }
}

/**
 * 检查是否支持 Web Serial API（桌面浏览器串口扫码）
 */
export function isWebSerialSupported(): boolean {
  return typeof window !== 'undefined' && 'serial' in navigator
}
