/**
 * 跨设备事件接收端（第 7a 步：同设备跨 app）。
 *
 * 挂载时注册 window.dispatchCrossDeviceEvent = (json) => {...}，供 Android 层调用。
 * 解析 CrossDeviceEvent，幂等去重（eventId LRU），防回环（origin.formCode），
 * 构造 EventContext（event=payload，form/app 本地值），emit custom_event。
 *
 * 调用点：EventHandler 初始化时调 setupCrossDeviceReceiver()。
 */
import type { CrossDeviceEvent } from './types'

/** 近期收到的 eventId LRU（幂等去重） */
class EventIdCache {
  private cache: string[] = []
  private maxSize = 256

  has(id: string): boolean {
    return this.cache.includes(id)
  }

  add(id: string): void {
    if (this.has(id)) return
    this.cache.push(id)
    if (this.cache.length > this.maxSize) this.cache.shift()
  }
}

const seenEventIds = new EventIdCache()

/**
 * 注册跨设备事件接收器。
 *
 * @param currentFormCode 当前 form-app 编码（防回环用）
 * @param onReceive 接收回调（参数：event 名、payload、hop）
 */
export function setupCrossDeviceReceiver(
  currentFormCode: string,
  onReceive: (event: string, payload: Record<string, any>, hop: number) => void,
): void {
  if (typeof window === 'undefined') return

  // 挂载全局接收函数（供 Android 层调用）
  ;(window as any).dispatchCrossDeviceEvent = (jsonPayload: string) => {
    try {
      const envelope: CrossDeviceEvent = JSON.parse(jsonPayload)

      // 幂等去重
      if (seenEventIds.has(envelope.origin.eventId)) {
        console.debug('[CrossDevice] 重复事件已丢弃:', envelope.origin.eventId)
        return
      }
      seenEventIds.add(envelope.origin.eventId)

      // 防回环：自己发的不自己收（同设备内按 formCode 判定）
      if (envelope.origin.formCode === currentFormCode) {
        console.debug('[CrossDevice] 回环事件已丢弃:', envelope.event, 'from', currentFormCode)
        return
      }

      // hop 超限仅 warn 不丢弃（A2 决策：不做强限制）
      if (envelope.hop > 10) {
        console.warn('[CrossDevice] hop 超限:', envelope.hop, 'event:', envelope.event)
      }

      // 回调上层（EventHandler 将构造 EventContext 并触发 custom_event）
      onReceive(envelope.event, envelope.payload, envelope.hop)
    } catch (e) {
      console.error('[CrossDevice] 解析跨设备事件失败:', e, jsonPayload)
    }
  }

  console.debug('[CrossDevice] 接收器已注册，formCode:', currentFormCode)
}

/** 卸载接收器（清理全局函数） */
export function teardownCrossDeviceReceiver(): void {
  if (typeof window !== 'undefined') {
    delete (window as any).dispatchCrossDeviceEvent
  }
}
