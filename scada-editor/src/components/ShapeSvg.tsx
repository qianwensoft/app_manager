import type { CanvasElement } from '@/types'

interface ShapeSvgProps {
  el: CanvasElement
  zoom: number
  isSelected?: boolean
  conditionalStyles?: { fill?: string; stroke?: string }
}

/**
 * SVG 基础图形渲染组件
 * 每个图形元素用独立的 SVG 渲染，替代 Canvas 绘制
 */
export default function ShapeSvg({ el, zoom, isSelected, conditionalStyles }: ShapeSvgProps) {
  if (!el.visible) return null

  const x = el.x * zoom
  const y = el.y * zoom
  const w = el.width * zoom
  const h = el.height * zoom
  const fill = conditionalStyles?.fill ?? el.fill ?? 'transparent'
  const stroke = conditionalStyles?.stroke ?? el.stroke ?? 'transparent'
  const strokeWidth = (el.strokeWidth ?? 1) * zoom
  const opacity = el.opacity ?? 1

  const commonProps = {
    fill: fill && fill !== 'transparent' && fill !== '' ? fill : 'none',
    stroke: stroke && stroke !== 'transparent' && stroke !== '' ? stroke : 'none',
    strokeWidth,
    opacity,
  }

  const renderShape = () => {
    switch (el.type) {
      case 'rect':
        return (
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={el.borderRadius ? el.borderRadius * zoom : 0}
            {...commonProps}
          />
        )

      case 'circle':
      case 'ellipse':
        return (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={w / 2}
            ry={h / 2}
            {...commonProps}
          />
        )

      case 'line':
        return (
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            {...commonProps}
            fill="none"
          />
        )

      case 'polyline':
        // polyline/polygon 使用 pathPoints
        if (!el.pathPoints || el.pathPoints.length < 2) return null
        const polylinePoints = el.pathPoints.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')
        return (
          <polyline
            points={polylinePoints}
            {...commonProps}
            fill="none"
          />
        )

      case 'polygon':
        if (!el.pathPoints || el.pathPoints.length < 3) return null
        const polygonPoints = el.pathPoints.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')
        return (
          <polygon
            points={polygonPoints}
            {...commonProps}
          />
        )

      case 'path':
      case 'pencil':
        // 钢笔工具 / 铅笔工具：使用 pathData（SVG path d 属性）
        if (!el.pathData) return null
        return (
          <path
            d={el.pathData}
            transform={`scale(${zoom})`}
            {...commonProps}
            fill={el.pathClosed ? commonProps.fill : 'none'}
          />
        )

      default:
        return null
    }
  }

  return (
    <svg
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: el.zIndex,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: 'center',
      }}
    >
      {renderShape()}
      {isSelected && (
        <rect
          x={-4}
          y={-4}
          width={w + 8}
          height={h + 8}
          fill="none"
          stroke="#4a9eff"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
    </svg>
  )
}

