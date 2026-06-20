/**
 * AndroidBridge 跨 app 事件中继（第 7a 步：同设备跨 form-app）。
 *
 * 发送端：构造 CrossDeviceEvent（含 origin/hop），调 Android 层 emitCrossAppEvent(json)。
 * Android 层：查找目标 WebView（按 formCode），调其 dispatchCrossDeviceEvent(json)。
 * 接收端：见 runtime/crossDevice/receiver.ts。
 */
import type { CrossDeviceEvent, CrossAppTarget } from './types'

interface AndroidCrossAppBridge {
  emitCrossAppEvent?: (jsonPayload: string) => void
}

function getBridge(): AndroidCrossAppBridge | null {
  if (typeof window === 'undefined') return null
  const b = (window as any).AndroidBridge as AndroidCrossAppBridge | undefined
  return b && typeof b.emitCrossAppEvent === 'function' ? b : null
}

export function isCrossAppBridgeAvailable(): boolean {
  return getBridge() !== null
}

/**
 * 生成 UUID v4（幂等去重键）。
 * 复用 crypto.randomUUID()（现代浏览器 + Android WebView 95+）。
 */
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // 降级：伪随机 UUID（不保证全局唯一，但同设备内短期足够）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 同设备跨 form-app emit（经 AndroidBridge 本地中继）。
 *
 * @param currentFormCode 当前 form-app 编码（origin.formCode）
 * @param target 目标寻址
 * @param event 事件名
 * @param payload 自包含数据快照
 * @param parentHop 父事件的 hop（若当前事件由跨设备事件触发，传递其 hop；否则 0）
 */
export function emitCrossApp(
  currentFormCode: string,
  target: CrossAppTarget,
  event: string,
  payload: Record<string, any>,
  parentHop: number = 0,
): void {
  const bridge = getBridge()
  if (!bridge?.emitCrossAppEvent) {
    console.warn('[CrossApp] AndroidBridge.emitCrossAppEvent 不可用（非 Agent 环境或版本过旧）')
    return
  }

  const envelope: CrossDeviceEvent = {
    event,
    payload,
    origin: {
      formCode: currentFormCode,
      deviceId: undefined, // 同设备内不需要 deviceId（Android 层可补）
      emittedAt: Date.now(),
      eventId: generateEventId(),
    },
    hop: parentHop + 1,
  }

  // 扩展寻址信息（Android 层需要知道目标 formCode）
  const fullPayload = { ...envelope, _target: target }

  try {
    bridge.emitCrossAppEvent(JSON.stringify(fullPayload))
  } catch (e) {
    console.error('[CrossApp] emitCrossAppEvent 调用失败:', e)
  }
}
