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

// 暴露到 window 供 Android Bridge 调用
if (typeof window !== 'undefined') {
  (window as any).eventManager = eventManager
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

export function setupEventListener(formAppId: number, token: string, onNavigate: (pageKey: string, params: Record<string, any>) => void) {
  const handler = async (eventData: string) => {
    try {
      const res = await testEventRoute(formAppId, 'barcode', eventData, token)
      if (res.matched) {
        const params = res.param_mapping ? JSON.parse(res.param_mapping) : {}
        onNavigate(res.target_page_key, params)
      }
    } catch (e) {
      console.error('Event route error:', e)
    }
  }

  eventManager.on('barcode', handler)
  eventManager.on('qrcode', handler)
  eventManager.on('nfc', handler)

  return () => {
    eventManager.off('barcode', handler)
    eventManager.off('qrcode', handler)
    eventManager.off('nfc', handler)
  }
}
