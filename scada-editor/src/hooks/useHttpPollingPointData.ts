import { useEffect, useRef, useCallback } from 'react'

export type PointDataMap = Record<string, number>

interface Options {
  scadaCode: string
  dataInterfaceCode?: string
  intervalMs?: number
  onData: (data: PointDataMap) => void
  enabled?: boolean
}

export function useHttpPollingPointData({
  scadaCode,
  dataInterfaceCode,
  intervalMs = 3000,
  onData,
  enabled = true,
}: Options) {
  const onDataRef = useRef(onData)
  onDataRef.current = onData
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    const code = dataInterfaceCode ?? `scada-sim-${scadaCode}`
    const token = localStorage.getItem('token') ?? ''
    try {
      const res = await fetch(`/api/scada/sim-points/snapshot/${scadaCode}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) return
      const json = await res.json()
      const payload = json?.data ?? json
      if (payload && typeof payload === 'object') {
        onDataRef.current(payload as PointDataMap)
      }
    } catch {
      // ignore transient errors
    }
  }, [scadaCode, dataInterfaceCode])

  useEffect(() => {
    if (!enabled || !scadaCode) return
    fetchData()
    timerRef.current = setInterval(fetchData, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, scadaCode, intervalMs, fetchData])
}
