import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅 /topic/outbound/webhooks/list，收到消息时回调。
 * 每次 webhook 成功接收数据后，后端推送 { webhook_id, last_received_at } (ms)。
 * @param {() => string | null | undefined} getToken
 * @param {(payload: { webhook_id: number, last_received_at: number }) => void} onMessage
 */
export function createWebhookListStomp(getToken, onMessage) {
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
    if (!token) return
    stop()
    client = new Client({
      brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
      reconnectDelay: 5000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onConnect: () => {
        sub = client.subscribe('/topic/outbound/webhooks/list', (msg) => {
          let j
          try { j = JSON.parse(msg.body) } catch { return }
          try { onMessage(j) } catch (e) { console.warn('[webhook list stomp]', e) }
        })
      },
      onStompError: (f) => console.warn('[webhook list stomp]', f.headers?.message, f.body),
      onWebSocketError: (e) => console.warn('[webhook list stomp] ws', e)
    })
    client.activate()
  }

  return { start, stop }
}
