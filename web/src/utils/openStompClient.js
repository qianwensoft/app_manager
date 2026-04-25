import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 创建开放 STOMP 客户端（供外部应用调试使用）。
 * 认证方式：api_key query param（也支持 X-API-Key header，但 WebSocket 握手只能用 query）。
 *
 * @param {string} apiKey
 * @param {string} destination  订阅的 topic，如 /topic/scada/point-data/xxx
 * @param {(payload: object | string) => void} onMessage
 * @param {{ onConnect?: () => void, onDisconnect?: () => void, onError?: (msg: string) => void }} [hooks]
 */
export function createOpenStomp(apiKey, destination, onMessage, hooks = {}) {
  let client = null
  let sub = null

  function stop() {
    try { sub?.unsubscribe() } catch { /* noop */ }
    sub = null
    try { client?.deactivate() } catch { /* noop */ }
    client = null
    hooks.onDisconnect?.()
  }

  function start() {
    if (!apiKey || !destination) return
    stop()
    client = new Client({
      brokerURL: `${WS_BASE}/ws/open/stomp?api_key=${encodeURIComponent(apiKey)}`,
      reconnectDelay: 5000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onConnect: () => {
        hooks.onConnect?.()
        sub = client.subscribe(destination, (msg) => {
          let parsed
          try { parsed = JSON.parse(msg.body) } catch { parsed = msg.body }
          try { onMessage(parsed) } catch (e) { console.warn('[open-stomp]', e) }
        })
      },
      onDisconnect: () => hooks.onDisconnect?.(),
      onStompError: (f) => {
        const msg = f.headers?.message || f.body || 'STOMP error'
        console.warn('[open-stomp]', msg)
        hooks.onError?.(msg)
      },
      onWebSocketError: (e) => {
        console.warn('[open-stomp] ws', e)
        hooks.onError?.('WebSocket 连接失败')
      },
    })
    client.activate()
  }

  return { start, stop }
}
