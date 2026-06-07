import { useMemo } from 'react'
import type { CanvasElement } from '@/types'
import { buildAnimationKeyframesCSS } from '@/runtime/animationExecutor'

interface Props {
  elements: CanvasElement[]
}

/** 向文档注入组态元件动画 @keyframes（预览/runtime） */
export default function AnimationStyleInjector({ elements }: Props) {
  const css = useMemo(() => buildAnimationKeyframesCSS(elements), [elements])
  if (!css) return null
  return <style data-scada-animations="">{css}</style>
}
