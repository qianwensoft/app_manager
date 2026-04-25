import type { CanvasElement } from '@/types'

interface Props {
  el: CanvasElement
  zoom: number
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
          borderImageSource: `url(${el.imageUrl})`,
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
      src={el.imageUrl}
      draggable={false}
      style={{
        ...baseStyle,
        objectFit: 'fill',
      }}
    />
  )
}
