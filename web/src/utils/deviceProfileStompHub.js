import { Client } from '@stomp/stompjs'
import { WS_BASE } from '@/utils/ws'

/** @type {Map<string, (j: object) => void>} */
const listeners = new Map()

let client = null
/** @type {import('@stomp/stompjs').StompSubscription | null} */
let subscription = null

function getToken() {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

function shutdown() {
  try {
    subscription?.unsubscribe()
  } catch {
    /* noop */
  }
  subscription = null
  try {
    client?.deactivate()
  } catch {
    /* noop */
  }
  client = null
}

function onStompMessage(message) {
  let j
  try {
    j = JSON.parse(message.body)
  } catch {
    return
  }
  listeners.forEach((cb) => {
    try {
      cb(j)
    } catch (e) {
      console.warn('profile stomp hub callback', e)
    }
  })
}

function ensureClient() {
  const token = getToken()
  if (!token) return
  if (client?.active) return

  client = new Client({
    brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
    reconnectDelay: 5000,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    onConnect: () => {
      subscription = client.subscribe('/topic/devices', onStompMessage)
    },
    onStompError: (frame) => {
      console.warn('STOMP devices topic error', frame.headers?.message, frame.body)
    },
    onWebSocketError: (e) => console.warn('STOMP WebSocket error', e)
  })
  client.activate()
}

/**
 * @param {string} id
 * @param {(j: object) => void} callback
 */
export function addProfileHubListener(id, callback) {
  listeners.set(id, callback)
  ensureClient()
}

/**
 * @param {string} id
 */
export function removeProfileHubListener(id) {
  listeners.delete(id)
  if (listeners.size === 0) {
    shutdown()
  }
}
