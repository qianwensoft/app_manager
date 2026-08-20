import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/**
 * 订阅 /topic/install-tasks/{id}（单任务实时进度）。
 * payload 字段：task_id / phase / progress / message / status / timestamp / error
 * @param {(payload: object) => void} onEvent
 * @param {() => string | null | undefined} getToken
 * @param {{ taskId: number | string }} opts 必须传入订阅的目标 taskId
 */
export function createInstallTaskStomp(onEvent, getToken, opts = {}) {
  const { taskId } = opts
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
      if (!token) return false
      if (taskId == null) return false
      tearDown()
      client = new Client({
        brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
        reconnectDelay: 5000,
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,
        onConnect: () => {
          client.subscribe(`/topic/install-tasks/${taskId}`, (message) => {
            let j
            try {
              j = JSON.parse(message.body)
            } catch (e) {
              console.warn('[install-task STOMP] parse failed', e)
              return
            }
            try {
              onEvent(j)
            } catch (e) {
              console.warn('[install-task STOMP] onEvent handler failed', e)
            }
          })
        },
        onStompError: (frame) => {
          console.warn('STOMP install-task topic error', frame.headers?.message, frame.body)
        },
        onWebSocketError: (e) => console.warn('STOMP install-task WebSocket error', e)
      })
      client.activate()
      return true
    },
    disconnect: tearDown
  }
}