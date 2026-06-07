import { useEffect, useState } from 'react'

/** 预览/runtime 动画：在存在活跃动画时以 rAF 驱动时间戳 */
export function useAnimationTick(active: boolean): number {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!active) return
    let id = 0
    const tick = (t: number) => {
      setNow(t)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [active])

  return now
}
