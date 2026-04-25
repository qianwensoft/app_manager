import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅 Webhook 调试 STOMP 主题，实时接收后端收到的请求。
 * @param {number|string} webhookId
 * @param {() => string | null | undefined} getToken
 * @param {(payload: object) => void} onMessage
 */
export function createWebhookDebugStomp(webhookId, getToken, onMessage) {
  let client = null
  let sub = null

  function stop() {
    try { sub?.unsubscribe() } catch { /* noop */ }
    sub = null
    try { client?.deactivate() } catch { /* noop */ }
    client = null
  }

  function start() {
    const token = getToken?.()
    const id = Number(webhookId)
    if (!token || !Number.isFinite(id) || id <= 0) return
    stop()
    client = new Client({
      brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
      reconnectDelay: 5000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onConnect: () => {
        sub = client.subscribe(`/topic/outbound/webhooks/${id}/debug`, (msg) => {
          let j
          try { j = JSON.parse(msg.body) } catch { return }
          try { onMessage(j) } catch (e) { console.warn('[webhook debug stomp]', e) }
        })
      },
      onStompError: (f) => console.warn('[webhook debug stomp]', f.headers?.message, f.body),
      onWebSocketError: (e) => console.warn('[webhook debug stomp] ws', e)
    })
    client.activate()
  }

  return { start, stop }
}
