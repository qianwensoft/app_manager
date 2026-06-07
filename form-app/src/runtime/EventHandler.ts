import { isAgentRuntime, runtimeFetch } from './runtimeAuth'

type EventHandler = (eventData: string) => void

class EventManager {
  private handlers: Map<string, EventHandler[]> = new Map()

  on(eventType: string, handler: EventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  off(eventType: string, handler: EventHandler) {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx > -1) handlers.splice(idx, 1)
    }
  }

  emit(eventType: string, eventData: string) {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.forEach(h => h(eventData))
    }
  }

  clear() {
    this.handlers.clear()
  }
}

export const eventManager = new EventManager()

if (typeof window !== 'undefined') {
  (window as Window & { eventManager?: EventManager }).eventManager = eventManager
}

export async function testEventRoute(formAppId: number, eventType: string, eventData: string, token: string) {
  const resp = await fetch(`/api/form-app/infos/${formAppId}/test-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event_type: eventType, event_data: eventData }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error || 'Event test failed')
  return data
}

async function matchRuntimeEvent(formCode: string, eventType: string, eventData: string) {
  return runtimeFetch('/api/form-app/agent-runtime/match-event', 'POST', {
    form_code: formCode,
    event_type: eventType,
    event_data: eventData,
  })
}

function parseParamMapping(raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/**
 * 键盘楔（Keyboard Wedge）扫码枪监听。
 * PDA 头扫/扫码枪以 HID 键盘模式工作时，快速输入字符并以 Enter 结尾。
 * 触发条件：字符间隔 < wedgeIntervalMs 且长度 > 2，Enter 确认。
 */
function setupKeyboardWedge(onScan: (data: string) => void, wedgeIntervalMs = 80): () => void {
  let buffer = ''
  let lastTime = 0

  const onKeyDown = (e: KeyboardEvent) => {
    const now = Date.now()

    if (now - lastTime > wedgeIntervalMs && buffer.length > 0) {
      // 超时，清缓冲（说明是普通键入，非扫码枪）
      buffer = ''
    }
    lastTime = now

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (buffer.length > 2) {
        const data = buffer
        buffer = ''
        onScan(data)
        e.preventDefault()
        e.stopPropagation()
      } else {
        buffer = ''
      }
      return
    }

    if (e.key.length === 1) {
      buffer += e.key
    }
  }

  document.addEventListener('keydown', onKeyDown, true)
  return () => document.removeEventListener('keydown', onKeyDown, true)
}

export function setupEventListener(
  formAppCode: string,
  formAppId: number,
  token: string,
  onNavigate: (pageKey: string, params: Record<string, any>) => void,
): () => void {
  const makeHandler = (eventType: string) => async (eventData: string) => {
    try {
      const res = isAgentRuntime()
        ? await matchRuntimeEvent(formAppCode, eventType, eventData)
        : await testEventRoute(formAppId, eventType, eventData, token)
      if (res.matched) {
        const params = parseParamMapping(res.param_mapping)
        onNavigate(res.target_page_key, params)
      }
    } catch (e) {
      console.error('Event route error:', e)
    }
  }

  const barcodeHandler = makeHandler('barcode')
  const qrcodeHandler = makeHandler('qrcode')
  const nfcHandler = makeHandler('nfc')

  eventManager.on('barcode', barcodeHandler)
  eventManager.on('qrcode', qrcodeHandler)
  eventManager.on('nfc', nfcHandler)

  // 键盘楔扫码枪：统一作为 barcode 事件处理
  const cleanupWedge = setupKeyboardWedge(data => {
    eventManager.emit('barcode', data)
  })

  return () => {
    eventManager.off('barcode', barcodeHandler)
    eventManager.off('qrcode', qrcodeHandler)
    eventManager.off('nfc', nfcHandler)
    cleanupWedge()
  }
}

/**
 * 通知 Agent 是否屏蔽全局自定义事件（避免扫码既触发 form-app 跳转又触发 Custom Event 上报）。
 * 仅在 Agent WebView 环境中生效，浏览器调用为 no-op。
 */
export function setGlobalEventBlocked(blocked: boolean) {
  try {
    const bridge = (window as any).AndroidBridge
    if (bridge?.blockGlobalEvents) {
      bridge.blockGlobalEvents(blocked)
    }
  } catch { /* ignore */ }
}
