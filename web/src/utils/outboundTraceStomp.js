import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅连接器执行拓扑的 STOMP 主题，接收每步投递增量。
 * @param {number|string} connectorId
 * @param {() => string | null | undefined} getToken
 * @param {(payload: object) => void} onTick
 */
export function createOutboundConnectorTraceStomp(connectorId, getToken, onTick) {
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
    const id = Number(connectorId)
    if (!token || !Number.isFinite(id) || id <= 0) return
    stop()
    client = new Client({
      brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
      reconnectDelay: 5000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onConnect: () => {
        const dest = `/topic/outbound/connectors/${id}/execution-trace`
        sub = client.subscribe(dest, (message) => {
          let j
          try {
            j = JSON.parse(message.body)
          } catch {
            return
          }
          if (j?.type !== 'outbound_connector_execution_trace') return
          try {
            onTick(j)
          } catch (e) {
            console.warn('[outbound trace STOMP] onTick', e)
          }
        })
      },
      onStompError: (frame) => {
        console.warn('[outbound trace STOMP]', frame.headers?.message, frame.body)
      },
      onWebSocketError: (e) => console.warn('[outbound trace STOMP] ws', e)
    })
    client.activate()
  }

  return { start, stop }
}
