import { useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'

export type PointDataMap = Record<string, unknown>

interface Options {
  scadaCode: string
  onData: (data: PointDataMap) => void
  enabled?: boolean
  /** 免登分享模式：走 /ws/stomp-scada?share_token=，不需要 JWT */
  shareToken?: string
}

export function useStompPointData({ scadaCode, onData, enabled = true, shareToken }: Options) {
  const clientRef = useRef<Client | null>(null)
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  const connect = useCallback(() => {
    if (!enabled || !scadaCode) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = shareToken
      ? `${proto}://${window.location.host}/ws/stomp-scada?share_token=${encodeURIComponent(shareToken)}`
      : `${proto}://${window.location.host}/ws/stomp${(() => { const t = localStorage.getItem('token') ?? ''; return t ? `?token=${t}` : '' })()}`

    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/scada/point-data/${scadaCode}`, (msg) => {
          try {
            const data: PointDataMap = JSON.parse(msg.body)
            const iface = data.__scada_interface as { binding_id?: string; rows?: unknown; error?: string } | undefined
            if (iface?.binding_id) {
              const rows = iface.rows
              const first = Array.isArray(rows) ? rows[0] : rows
              onDataRef.current({
                ...data,
                ...Object.fromEntries(Object.entries(first && typeof first === 'object' ? first as Record<string, unknown> : {}).map(([key, value]) => [`__iface_${key}`, value])),
              })
            } else {
              onDataRef.current(data)
            }
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
  }, [enabled, scadaCode, shareToken])

  useEffect(() => {
    connect()
    return () => {
      clientRef.current?.deactivate()
      clientRef.current = null
    }
  }, [connect])
}
