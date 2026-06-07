import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { EventRuntimeContext } from '@/runtime/eventExecutor'
import { runTriggeredEvents } from '@/runtime/eventExecutor'

interface Props {
  elements: CanvasElement[]
  zoom: number
  pointData: PointDataMap
  ctx: Omit<EventRuntimeContext, 'element'>
  /** 已由 DOM 覆盖层处理点击的元件类型 */
  excludeTypes?: string[]
}

const DEFAULT_EXCLUDE = new Set(['text', 'button'])

export default function ElementEventHitLayer({
  elements,
  zoom,
  pointData,
  ctx,
  excludeTypes,
}: Props) {
  const excluded = excludeTypes ? new Set(excludeTypes) : DEFAULT_EXCLUDE

  const targets = elements
    .filter((el) => el.visible && el.events?.length && !excluded.has(el.type))
    .sort((a, b) => a.zIndex - b.zIndex)

  if (!targets.length) return null

  const makeCtx = (el: CanvasElement): EventRuntimeContext => ({
    ...ctx,
    element: el,
    pointData,
  })

  return (
    <>
      {targets.map((el) => (
        <div
          key={`hit-${el.id}`}
          onClick={() => runTriggeredEvents(el, 'click', makeCtx(el))}
          onDoubleClick={() => runTriggeredEvents(el, 'dblclick', makeCtx(el))}
          onMouseEnter={() => runTriggeredEvents(el, 'hover', makeCtx(el))}
          style={{
            position: 'absolute',
            left: el.x * zoom,
            top: el.y * zoom,
            width: el.width * zoom,
            height: el.height * zoom,
            zIndex: el.zIndex + 1,
            cursor: 'pointer',
            background: 'transparent',
            pointerEvents: 'auto',
          }}
          aria-hidden
        />
      ))}
    </>
  )
}
