import { useEffect, useMemo, useState } from 'react'
import type { CanvasElement } from '@/types'

/**
 * 为“当前系统时间”日期时间元件提供周期性刷新。
 * 仅当画布存在启用了 dateTime.source=current 的元件时才启动定时器，
 * 刷新间隔取所有该类元件配置的最小 refreshMs（默认 1000ms，下限 200ms）。
 * 返回值在每次 tick 递增，可作为渲染 effect 的依赖触发重绘。
 */
export function useDateTimeTick(elements: CanvasElement[]): number {
  const intervalMs = useMemo(() => {
    let min = Infinity
    for (const el of elements) {
      const dt = el.dateTime
      if (dt?.enabled && (dt.source ?? 'current') === 'current') {
        min = Math.min(min, dt.refreshMs ?? 1000)
      }
    }
    if (!Number.isFinite(min)) return 0
    return Math.max(200, min)
  }, [elements])

  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (intervalMs <= 0) return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return tick
}
