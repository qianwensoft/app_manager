import type { CanvasElement } from '@/types'

interface Props {
  el: CanvasElement
  zoom: number
}

// 兼容旧数据：/images/... → {BASE}images/...
const BASE = import.meta.env.BASE_URL
function resolveUrl(url?: string) {
  if (!url) return url
  if (url.startsWith('/images/')) return `${BASE}images/${url.slice(8)}`
  return url
}

export default function ImageWidget({ el, zoom }: Props) {
  const isBorderBox = el.type === 'image-border-box'
  const bc = el.borderImageConfig

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: el.x * zoom,
    top: el.y * zoom,
    width: el.width * zoom,
    height: el.height * zoom,
    zIndex: el.zIndex,
    opacity: el.opacity ?? 1,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    pointerEvents: 'none',
    userSelect: 'none',
  }

  if (isBorderBox && bc && el.imageUrl) {
    // Scale border-image widths by zoom
    const scaleWidth = (w: string) =>
      w.replace(/(\d+(?:\.\d+)?)(px)/g, (_, n) => `${parseFloat(n) * zoom}px`)

    return (
      <div
        style={{
          ...baseStyle,
          borderStyle: 'solid',
          borderWidth: scaleWidth(bc.width),
          borderImageSource: `url(${resolveUrl(el.imageUrl)})`,
          borderImageSlice: bc.slice,
          borderImageRepeat: bc.repeat,
          borderImageOutset: bc.outset ?? '0',
          boxSizing: 'border-box',
        }}
      />
    )
  }

  return (
    <img
      src={resolveUrl(el.imageUrl)}
      draggable={false}
      style={{
        ...baseStyle,
        objectFit: 'fill',
      }}
    />
  )
}
