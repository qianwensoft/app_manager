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
            try {
              const j = JSON.parse(message.body)
              if (j.type === 'device_custom_event') onEvent(j)
            } catch (e) {
              console.warn('custom events STOMP parse', e)
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
