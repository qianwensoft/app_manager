import { useEffect, useRef, useState } from 'react'
import { useStreamData } from './useStreamData'
import { scadaApi } from '@/api/scada'
import type { CanvasElement, ScadaSimPoint } from '@/types'

/**
 * For text/button elements whose simLinkName maps to a high-frequency point
 * (interval_ms < 1000), subscribe via the binary stream channel instead of STOMP.
 *
 * Returns a PointDataMap-compatible object with the latest value for each
 * high-frequency key, updated on every stream tick.
 */
export function useHighFreqTextData(
  elements: CanvasElement[],
  scadaCode: string,
  enabled: boolean,
): Record<string, number> {
  const [simPoints, setSimPoints] = useState<ScadaSimPoint[]>([])
  const resultRef = useRef<Record<string, number>>({})
  const [, setTick] = useState(0)

  // Load sim points once per scadaCode
  useEffect(() => {
    if (!scadaCode || !enabled) return
    scadaApi.listSimPoints(scadaCode).then((res) => {
      setSimPoints(res.data ?? [])
    }).catch(() => {})
  }, [scadaCode, enabled])

  // Derive the set of high-frequency link_names (interval_ms < 1000)
  const highFreqKeys = new Set(
    simPoints
      .filter((p) => p.interval_ms > 0 && p.interval_ms < 1000)
      .map((p) => p.link_name)
  )

  // Collect keys actually used by text/button elements
  const activeKeys = elements
    .filter((el) => (el.type === 'text' || el.type === 'button') && el.pointBinding?.simLinkName)
    .map((el) => el.pointBinding!.simLinkName!)
    .filter((k) => highFreqKeys.has(k))

  const streamEnabled = enabled && !!scadaCode && activeKeys.length > 0

  const { getChannel, tick } = useStreamData(scadaCode, streamEnabled)

  // On every stream tick, read latest value for each active key
  useEffect(() => {
    if (!streamEnabled) return
    let changed = false
    for (const key of activeKeys) {
      const snap = getChannel(key)
      if (!snap || snap.size === 0) continue
      // latest value is the last element in the chronological snapshot
      const latest = snap.values[snap.size - 1]
      if (resultRef.current[key] !== latest) {
        resultRef.current = { ...resultRef.current, [key]: latest }
        changed = true
      }
    }
    if (changed) setTick((t) => t + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, streamEnabled])

  // Clear when disabled
  useEffect(() => {
    if (!enabled) {
      resultRef.current = {}
      setTick((t) => t + 1)
    }
  }, [enabled])

  return resultRef.current
}
