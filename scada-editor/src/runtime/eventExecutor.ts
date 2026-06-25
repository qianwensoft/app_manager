import type { CanvasElement, ElementEvent } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { evalAnimationCondition, resolveAnimationValue } from '@/runtime/animationExecutor'

export interface EventRuntimeContext {
  element: CanvasElement
  pointData: PointDataMap
  openModal: (id: string) => void
  closeModal: (id: string) => void
  switchCanvas: (id: number) => void
  onSwitchCanvas?: (canvasId: number) => void
}

export function eventConditionMet(el: CanvasElement, ev: ElementEvent, pointData: PointDataMap): boolean {
  return evalAnimationCondition(ev.condition, resolveAnimationValue(el, pointData))
}

export function executeEventAction(ev: ElementEvent, ctx: EventRuntimeContext): void {
  const v = resolveAnimationValue(ctx.element, ctx.pointData)
  const { element } = ctx

  switch (ev.action) {
    case 'open-modal':
      if (ev.target) ctx.openModal(ev.target)
      break
    case 'close-modal':
      if (ev.target) ctx.closeModal(ev.target)
      break
    case 'navigate-canvas': {
      if (!ev.target) break
      const id = Number(ev.target)
      if (!Number.isFinite(id)) break
      if (ctx.onSwitchCanvas) ctx.onSwitchCanvas(id)
      else ctx.switchCanvas(id)
      break
    }
    case 'navigate':
      if (ev.target) window.open(ev.target, '_blank')
      break
    case 'popup':
      if (ev.target) window.open(ev.target, '_blank', 'width=800,height=600')
      break
    case 'script':
      if (ev.script) {
        try {
          // eslint-disable-next-line no-new-func
          new Function('v', 'el', ev.script)(v, element)
        } catch {
          /* ignore script errors in preview */
        }
      }
      break
    default:
      break
  }
}

/** 执行匹配 trigger 且满足条件的事件链（按配置顺序） */
export function runTriggeredEvents(
  element: CanvasElement,
  trigger: ElementEvent['trigger'],
  ctx: EventRuntimeContext,
): void {
  for (const ev of element.events ?? []) {
    if (ev.trigger !== trigger) continue
    if (!eventConditionMet(element, ev, ctx.pointData)) continue
    executeEventAction(ev, ctx)
  }
}

/** 数据驱动：条件从 false→true 时触发一次 */
export function runConditionEdgeEvents(
  element: CanvasElement,
  ctx: EventRuntimeContext,
  prevMet: boolean[],
): boolean[] {
  const events = element.events ?? []
  const nextMet = [...prevMet]
  events.forEach((ev, i) => {
    if (ev.trigger !== 'condition') return
    const met = eventConditionMet(element, ev, ctx.pointData)
    if (met && !prevMet[i]) executeEventAction(ev, ctx)
    nextMet[i] = met
  })
  return nextMet
}
