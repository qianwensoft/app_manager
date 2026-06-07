import { useEffect, useRef, useState } from 'react'

export interface ChannelSnapshot {
  times: Float64Array
  values: Float64Array
  size: number
}

export function useStreamData(
  scadaCode: string,
  enabled: boolean,
  cap?: number,
): {
  getChannel: (key: string) => ChannelSnapshot | undefined
  tick: number
} {
  const workerRef = useRef<Worker | null>(null)
  const dataRef = useRef<Map<string, ChannelSnapshot>>(new Map())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) {
      workerRef.current?.postMessage({ type: 'stop' })
      workerRef.current?.terminate()
      workerRef.current = null
      dataRef.current.clear()
      return
    }

    const worker = new Worker(
      new URL('../workers/streamWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'data') {
        dataRef.current.set(msg.channel, {
          times: msg.times,
          values: msg.values,
          size: msg.size,
        })
        setTick(t => t + 1)
      }
    }

    worker.postMessage({
      type: 'init',
      scadaCode,
      host: window.location.host,
      ...(cap !== undefined ? { cap } : {}),
    })

    return () => {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      workerRef.current = null
    }
  }, [scadaCode, enabled, cap])

  const getChannel = (key: string): ChannelSnapshot | undefined =>
    dataRef.current.get(key)

  return { getChannel, tick }
}
