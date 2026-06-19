import { useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'

export interface FormAppEvent {
  event: string
  id: number
  code: string
  name: string
  description?: string
  mode?: string
  publish_status?: number
  content_version?: number
  updated_at?: string
}

interface Options {
  onEvent: (event: FormAppEvent) => void
  enabled?: boolean
}

/**
 * 订阅表单应用事件实时推送
 * 支持的事件类型：form_app.created, form_app.deleted, form_app.published, form_app.unpublished
 */
export function useStompFormAppEvents({ onEvent, enabled = true }: Options) {
  const clientRef = useRef<Client | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (!enabled) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const token = localStorage.getItem('token') ?? ''
    const wsUrl = `${proto}://${window.location.host}/ws/stomp${token ? `?token=${encodeURIComponent(token)}` : ''}`

    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      onConnect: () => {
        client.subscribe('/topic/form-app-events', (msg: any) => {
          try {
            const data: FormAppEvent = JSON.parse(msg.body)
            onEventRef.current(data)
          } catch (e) {
            console.warn('[form-app-events] parse failed', e)
          }
        })
      },
      onStompError: (frame: any) => {
        console.warn('[form-app-events] STOMP error', frame.headers?.message)
      },
      onWebSocketError: (e: any) => {
        console.warn('[form-app-events] WebSocket error', e)
      },
    })

    client.activate()
    clientRef.current = client
  }, [enabled])

  useEffect(() => {
    connect()
    return () => {
      clientRef.current?.deactivate()
      clientRef.current = null
    }
  }, [connect])

  return {
    disconnect: () => {
      clientRef.current?.deactivate()
      clientRef.current = null
    },
  }
}
