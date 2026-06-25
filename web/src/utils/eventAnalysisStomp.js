import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅设备自定义事件分析 STOMP 主题。
 * @param {number|string} deviceId
 * @param {() => string | null | undefined} getToken
 * @param {(payload: object) => void} onUpdate
 */
export function createEventAnalysisStomp(deviceId, getToken, onUpdate) {
  let client = null
  let sub = null

  function stop() {
    try {
      sub?.unsubscribe()
    } catch {
      /* noop */
    }
    sub = null
    try {
      client?.deactivate()
    } catch {
      /* noop */
    }
    client = null
  }

  function start() {
    const token = getToken?.()
    const id = Number(deviceId)
    if (!token || !Number.isFinite(id) || id <= 0) return
    stop()
    client = new Client({
      brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
      reconnectDelay: 5000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onConnect: () => {
        const dest = `/topic/device/${id}/event-analysis`
        sub = client.subscribe(dest, (message) => {
          let j
          try {
            j = JSON.parse(message.body)
          } catch {
            return
          }
          if (j?.type !== 'event_analysis_update') return
          try {
            onUpdate(j)
          } catch (e) {
            console.warn('[event-analysis STOMP]', e)
          }
        })
      },
      onStompError: (frame) => {
        console.warn('[event-analysis STOMP]', frame.headers?.message, frame.body)
      },
      onWebSocketError: (e) => console.warn('[event-analysis STOMP] ws', e)
    })
    client.activate()
  }

  return { start, stop }
}
