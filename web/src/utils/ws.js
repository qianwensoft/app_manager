import { useAuthStore } from '@/stores/auth'

/** 始终走 Vite /ws 代理（与页面同源），生产环境与后端同源无需代理 */
export const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

export class WSClient {
  constructor(path, { onOpen, onMessage, onClose, onError, reconnect = true } = {}) {
    this.url = `${WS_BASE}${path}`
    this.onOpen = onOpen || (() => {})
    this.onMessage = onMessage || (() => {})
    /** onClose(code, reason) */
    this.onClose = onClose || (() => {})
    this.onError = onError || (() => {})
    this.reconnect = reconnect
    this.attempts = 0
    this.ws = null
    this.closed = false
  }

  connect() {
    const auth = useAuthStore()
    const t = auth.token ? encodeURIComponent(auth.token) : ''
    const url = t ? `${this.url}?token=${t}` : this.url
    this.ws = new WebSocket(url)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => { this.attempts = 0; this.onOpen() }
    this.ws.onmessage = (e) => {
      let data = e.data
      if (data instanceof ArrayBuffer) {
        data = new TextDecoder('utf-8', { fatal: false }).decode(data)
      } else if (data instanceof Blob) {
        data.arrayBuffer().then((ab) => {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(ab)
          this.onMessage(text)
        })
        return
      }
      this.onMessage(data)
    }
    this.ws.onerror = (e) => this.onError(e)
    this.ws.onclose = (ev) => {
      this.onClose(ev?.code, ev?.reason || '')
      if (this.reconnect && !this.closed) {
        const delay = Math.min(1000 * 2 ** this.attempts, 30000)
        this.attempts++
        setTimeout(() => this.connect(), delay)
      }
    }
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data)
  }

  close() {
    this.closed = true
    this.ws?.close(1000)
  }
}
