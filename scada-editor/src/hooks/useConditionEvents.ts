import { useEffect, useRef } from 'react'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { EventRuntimeContext } from '@/runtime/eventExecutor'
import { runConditionEdgeEvents } from '@/runtime/eventExecutor'

type EdgeState = Record<string, boolean[]>

/**
 * 监听点位变化，在条件触发器（trigger=condition）满足时执行动作（上升沿）。
 */
export function useConditionEvents(
  elements: CanvasElement[],
  pointData: PointDataMap,
  ctx: Omit<EventRuntimeContext, 'element'>,
): void {
  const edgeRef = useRef<EdgeState>({})

  const openModal = ctx.openModal
  const closeModal = ctx.closeModal
  const switchCanvas = ctx.switchCanvas
  const onSwitchCanvas = ctx.onSwitchCanvas

  useEffect(() => {
    for (const el of elements) {
      if (!el.visible || !el.events?.some((e) => e.trigger === 'condition')) continue
      const prev = edgeRef.current[el.id] ?? new Array(el.events!.length).fill(false)
      edgeRef.current[el.id] = runConditionEdgeEvents(
        el,
        { pointData, openModal, closeModal, switchCanvas, onSwitchCanvas, element: el },
        prev,
      )
    }
  }, [elements, pointData, openModal, closeModal, switchCanvas, onSwitchCanvas])
}
