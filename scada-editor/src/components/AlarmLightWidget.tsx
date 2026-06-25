import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { mergeAnimStyle } from '@/runtime/animationExecutor'

interface Props {
  el: CanvasElement
  zoom: number
  isPreview?: boolean
  pointData?: PointDataMap
}

type AlarmLevel = 'normal' | 'warning' | 'danger'

function readNumericValue(el: CanvasElement, pointData: PointDataMap): number {
  const pb = el.pointBinding
  const key = pb?.pointKey ?? pb?.simLinkName ?? pb?.chartSeriesKeys?.[0]?.[0]
  if (!key) return 0
  const raw = pointData[key]
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

function resolveLevel(value: number, warn: number, danger: number): AlarmLevel {
  if (value >= danger) return 'danger'
  if (value >= warn) return 'warning'
  return 'normal'
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    osc.onended = () => { void ctx.close() }
  } catch {
    /* ignore */
  }
}

export default function AlarmLightWidget({ el, zoom, isPreview = false, pointData = {} }: Props) {
  const warnAt = el.alarmThresholdWarning ?? 70
  const dangerAt = el.alarmThresholdDanger ?? 90
  const blinkMs = el.alarmBlinkMs ?? 500
  const value = readNumericValue(el, pointData)
  const level = resolveLevel(value, warnAt, dangerAt)
  const color = level === 'danger'
    ? (el.alarmDangerColor ?? '#ef4444')
    : level === 'warning'
      ? (el.alarmWarningColor ?? '#f59e0b')
      : (el.alarmNormalColor ?? '#22c55e')

  const [blinkOn, setBlinkOn] = useState(true)
  const prevLevel = useRef<AlarmLevel>('normal')

  useEffect(() => {
    if (!isPreview || level === 'normal') {
      setBlinkOn(true)
      return
    }
    const t = setInterval(() => setBlinkOn(v => !v), Math.max(120, blinkMs))
    return () => clearInterval(t)
  }, [isPreview, level, blinkMs])

  useEffect(() => {
    if (!isPreview || !el.alarmSoundEnabled) return
    if (level === 'danger' && prevLevel.current !== 'danger') {
      playBeep()
    }
    prevLevel.current = level
  }, [isPreview, level, el.alarmSoundEnabled])

  const size = Math.min(el.width, el.height) * zoom
  const visibleOpacity = useMemo(() => {
    if (!isPreview || level === 'normal') return 1
    return blinkOn ? 1 : 0.35
  }, [isPreview, level, blinkOn])

  const w = el.width * zoom
  const h = el.height * zoom

  return (
    <div
      style={mergeAnimStyle(el, pointData, {
        position: 'absolute',
        left: el.x * zoom,
        top: el.y * zoom,
        width: w,
        height: h,
        zIndex: el.zIndex,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4 * zoom,
        pointerEvents: 'none',
        opacity: el.opacity ?? 1,
      })}
    >
      <div style={{
        width: size * 0.72,
        height: size * 0.72,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${color}, ${color}88 55%, ${color}33 100%)`,
        boxShadow: level !== 'normal'
          ? `0 0 ${12 * zoom}px ${color}, 0 0 ${24 * zoom}px ${color}66`
          : `0 0 ${6 * zoom}px ${color}55`,
        opacity: visibleOpacity,
        transition: 'opacity 0.12s',
        border: `2px solid ${color}`,
      }} />
      {el.text && (
        <span style={{
          fontSize: (el.fontSize ?? 11) * zoom,
          color: el.fontColor || '#ccc',
          userSelect: 'none',
        }}>
          {el.text}
        </span>
      )}
      {isPreview && (
        <span style={{ fontSize: 9 * zoom, color: 'rgba(255,255,255,0.45)' }}>
          {value.toFixed(1)}
        </span>
      )}
    </div>
  )
}
