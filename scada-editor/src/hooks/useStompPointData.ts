import { useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'

export type PointDataMap = Record<string, number>

interface Options {
  scadaCode: string
  onData: (data: PointDataMap) => void
  enabled?: boolean
}

export function useStompPointData({ scadaCode, onData, enabled = true }: Options) {
  const clientRef = useRef<Client | null>(null)
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  const connect = useCallback(() => {
    if (!enabled || !scadaCode) return

    const token = localStorage.getItem('token') ?? ''
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${proto}://${window.location.host}/ws/stomp${token ? `?token=${token}` : ''}`

    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/scada/point-data/${scadaCode}`, (msg) => {
          try {
            const data: PointDataMap = JSON.parse(msg.body)
            onDataRef.current(data)
          } catch {
            // ignore malformed
          }
        })
      },
      onStompError: () => { /* silently ignore auth failures */ },
      onWebSocketError: () => { /* silently ignore */ },
    })

    client.activate()
    clientRef.current = client
  }, [enabled, scadaCode])

  useEffect(() => {
    connect()
    return () => {
      clientRef.current?.deactivate()
      clientRef.current = null
    }
  }, [connect])
}
