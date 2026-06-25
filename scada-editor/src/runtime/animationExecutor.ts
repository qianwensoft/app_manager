import type { CSSProperties } from 'react'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { resolveBindingNumericValue } from '@/runtime/bindingResolver'

export interface DrawAnimState {
  extraRotation?: number
  opacityMultiplier?: number
  flowPulse?: number
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** 从点位数据解析动画条件所用的数值 v（四模式统一） */
export function resolveAnimationValue(el: CanvasElement, pointData: PointDataMap): number {
  return resolveBindingNumericValue(el, pointData)
}

export function evalAnimationCondition(condition: string | undefined, v: number): boolean {
  const expr = condition?.trim()
  if (!expr) return true
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function('v', `return (${expr})`)(v))
  } catch {
    return false
  }
}

export function isAnimationActive(el: CanvasElement, pointData: PointDataMap): boolean {
  const anim = el.animation
  if (!anim || anim.type === 'none') return false
  return evalAnimationCondition(anim.condition, resolveAnimationValue(el, pointData))
}

export function animationKeyframeName(el: CanvasElement): string | null {
  const anim = el.animation
  if (!anim || anim.type === 'none') return null
  const id = sanitizeId(el.id)
  switch (anim.type) {
    case 'rotate': return `scada_rot_${id}`
    case 'blink': return `scada_blink_${id}`
    case 'flow': return `scada_flow_${id}`
    default: return null
  }
}

/** 注入预览页全局 @keyframes */
export function buildAnimationKeyframesCSS(elements: CanvasElement[]): string {
  const rules: string[] = []
  const seen = new Set<string>()

  for (const el of elements) {
    const anim = el.animation
    if (!anim || anim.type === 'none') continue
    const name = animationKeyframeName(el)
    if (!name || seen.has(name)) continue
    seen.add(name)

    if (anim.type === 'rotate') {
      rules.push(`@keyframes ${name}{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`)
    } else if (anim.type === 'blink') {
      rules.push(`@keyframes ${name}{0%,100%{opacity:1}50%{opacity:0.12}}`)
    } else if (anim.type === 'flow') {
      rules.push(
        `@keyframes ${name}{0%,100%{box-shadow:inset 0 0 0 0 rgba(34,197,94,0)}50%{box-shadow:inset 0 0 14px 3px rgba(34,197,94,0.55)}}`,
      )
    }
  }
  return rules.join('\n')
}

/** DOM 元件合并动画样式（需配合 AnimationStyleInjector） */
export function mergeAnimStyle(
  el: CanvasElement,
  pointData: PointDataMap,
  base: CSSProperties = {},
): CSSProperties {
  if (!isAnimationActive(el, pointData)) return base
  const anim = el.animation!
  const name = animationKeyframeName(el)
  if (!name) return base
  const dur = Math.max(anim.duration ?? 1000, 100)
  const timing = anim.type === 'rotate' ? 'linear' : 'ease-in-out'
  return {
    ...base,
    animation: `${name} ${dur}ms ${timing} infinite`,
    transformOrigin: 'center center',
  }
}

/** Canvas 2D 绘制时的动画状态（rotate / blink / flow） */
export function getCanvasAnimState(
  el: CanvasElement,
  pointData: PointDataMap,
  now: number,
): DrawAnimState | undefined {
  if (!isAnimationActive(el, pointData)) return undefined
  const anim = el.animation!
  const dur = Math.max(anim.duration ?? 1000, 100)
  const phase = (now % dur) / dur
  const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)

  switch (anim.type) {
    case 'rotate':
      return { extraRotation: phase * 360 }
    case 'blink':
      return { opacityMultiplier: 0.12 + 0.88 * wave }
    case 'flow':
      return { flowPulse: wave }
    default:
      return undefined
  }
}

export function canvasNeedsAnimationLoop(elements: CanvasElement[], pointData: PointDataMap): boolean {
  return elements.some((el) => {
    if (!el.visible || !el.animation || el.animation.type === 'none') return false
    return isAnimationActive(el, pointData)
  })
}
