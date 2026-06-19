import { useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'

export interface ScadaEvent {
  event: string
  id: number
  scada_code: string
  scada_name: string
  group_id?: number
  description?: string
  preview_image?: string
  publish_status?: number
  content_version?: number
  updated_at?: string
}

interface Options {
  onEvent: (event: ScadaEvent) => void
  enabled?: boolean
}

/**
 * 订阅 SCADA 事件实时推送
 * 支持的事件类型：scada.created, scada.deleted, scada.published, scada.unpublished
 */
export function useStompScadaEvents({ onEvent, enabled = true }: Options) {
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
        client.subscribe('/topic/scada-events', (msg) => {
          try {
            const data: ScadaEvent = JSON.parse(msg.body)
            onEventRef.current(data)
          } catch (e) {
            console.warn('[scada-events] parse failed', e)
          }
        })
      },
      onStompError: (frame) => {
        console.warn('[scada-events] STOMP error', frame.headers?.message)
      },
      onWebSocketError: (e) => {
        console.warn('[scada-events] WebSocket error', e)
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
