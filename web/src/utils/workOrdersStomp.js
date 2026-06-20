import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅 /topic/work-orders，接收服务端工单事件推送（created/status_changed/closed）。
 * payload 为 workOrderEventPayload 的扁平字段：event/id/code/type_code/status/title/
 * priority/device_id/device_name/tags/other_codes/created_at/...
 * @param {(payload: object) => void} onEvent
 * @param {() => string | null | undefined} getToken
 */
export function createWorkOrdersStomp(onEvent, getToken) {
  let client = null
  function tearDown() {
    try {
      client?.deactivate()
    } catch {
      /* noop */
    }
    client = null
  }
  return {
    connect() {
      const token = getToken?.()
      if (!token) return
      tearDown()
      client = new Client({
        brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
        reconnectDelay: 5000,
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,
        onConnect: () => {
          client.subscribe('/topic/work-orders', (message) => {
            let j
            try {
              j = JSON.parse(message.body)
            } catch (e) {
              console.warn('[work-orders STOMP] parse failed', e)
              return
            }
            try {
              onEvent(j)
            } catch (e) {
              console.warn('[work-orders STOMP] onEvent handler failed (subscription stays active)', e)
            }
          })
        },
        onStompError: (frame) => {
          console.warn('STOMP work-orders topic error', frame.headers?.message, frame.body)
        },
        onWebSocketError: (e) => console.warn('STOMP WebSocket error', e)
      })
      client.activate()
    },
    disconnect: tearDown
  }
}
