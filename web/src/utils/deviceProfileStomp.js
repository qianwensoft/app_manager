import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅 /topic/devices，在设备别名、分组等变更时回调（需已登录 JWT）。
 * @param {(payload: { type: string, device_id: number }) => void} onEvent
 * @param {() => string | null | undefined} getToken
 * @returns {{ connect: () => void, disconnect: () => void }}
 */
export function createDeviceProfileStomp(onEvent, getToken) {
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
          client.subscribe('/topic/devices', (message) => {
            try {
              const j = JSON.parse(message.body)
              if (j.type === 'device_profile_updated') onEvent(j)
            } catch (e) {
              console.warn('device profile STOMP parse', e)
            }
          })
        },
        onStompError: (frame) => {
          console.warn('STOMP devices topic error', frame.headers?.message, frame.body)
        },
        onWebSocketError: (e) => console.warn('STOMP WebSocket error', e)
      })
      client.activate()
    },
    disconnect: tearDown
  }
}
