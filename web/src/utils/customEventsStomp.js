import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅 /topic/events，接收 Agent 上报并经服务端转发的自定义事件（JSON）。
 * @param {(payload: object) => void} onEvent
 * @param {() => string | null | undefined} getToken
 */
export function createCustomEventsStomp(onEvent, getToken) {
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
          client.subscribe('/topic/events', (message) => {
            let j
            try {
              j = JSON.parse(message.body)
            } catch (e) {
              console.warn('[custom events STOMP] parse failed', e)
              return
            }
            if (j?.type !== 'device_custom_event') return
            try {
              onEvent(j)
            } catch (e) {
              console.warn('[custom events STOMP] onEvent handler failed (subscription stays active)', e)
            }
          })
        },
        onStompError: (frame) => {
          console.warn('STOMP events topic error', frame.headers?.message, frame.body)
        },
        onWebSocketError: (e) => console.warn('STOMP WebSocket error', e)
      })
      client.activate()
    },
    disconnect: tearDown
  }
}
