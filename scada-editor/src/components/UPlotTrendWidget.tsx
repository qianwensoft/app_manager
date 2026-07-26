import { useRef, useEffect, useCallback } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { useStreamData } from '@/hooks/useStreamData'
import { dataBindingApi } from '@/api/dataBinding'
import { lttb } from '@/utils/lttb'
import { mergeAnimStyle } from '@/runtime/animationExecutor'

interface Props {
  el: CanvasElement
  zoom: number
  pointData?: PointDataMap
  scadaCode?: string
}

const PALETTE = ['#4a9eff', '#27ae60', '#e67e22', '#8e44ad', '#e74c3c', '#1abc9c', '#f1c40f']

function cfg<T>(props: Record<string, unknown>, key: string, def: T): T {
  const v = props[key]
  return v !== undefined ? (v as T) : def
}

// ---------------------------------------------------------------------------
// Ring buffer backed by Float64Array
// ---------------------------------------------------------------------------
class RingBuf {
  times: Float64Array
  values: Float64Array
  head = 0
  size = 0
  cap: number

  constructor(cap: number) {
    this.cap = cap
    this.times = new Float64Array(cap)
    this.values = new Float64Array(cap)
  }

  push(t: number, v: number): void {
    this.times[this.head] = t
    this.values[this.head] = v
    this.head = (this.head + 1) % this.cap
    if (this.size < this.cap) this.size++
  }

  snapshot(limit?: number): { times: Float64Array; values: Float64Array } {
    const n = limit !== undefined ? Math.min(limit, this.size) : this.size
    if (n === 0) return { times: new Float64Array(0), values: new Float64Array(0) }
    const out_t = new Float64Array(n)
    const out_v = new Float64Array(n)
    const start = this.size < this.cap ? 0 : this.head
    const skip = this.size - n
    for (let i = 0; i < n; i++) {
      const idx = (start + skip + i) % this.cap
      out_t[i] = this.times[idx]
      out_v[i] = this.values[idx]
    }
    return { times: out_t, values: out_v }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function UPlotTrendWidget({ el, zoom, pointData, scadaCode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)
  const ringsRef = useRef<Map<string, RingBuf>>(new Map())
  const dirtyRef = useRef(false)
  const rafRef = useRef<number>(0)

  const pb = el.pointBinding
  const keys: string[] = pb?.trendKeys ?? (pb?.simLinkName ? [pb.simLinkName] : [])
  const maxPoints = pb?.trendMaxPoints ?? 200
  const windowMs = (pb?.trendTimeWindowSec ?? 0) * 1000

  const styleProps = (el.properties?.chartConfig ?? {}) as Record<string, unknown>
  const bgColor = cfg(styleProps, 'bgColor', 'transparent')
  const lineWidth = cfg(styleProps, 'lineWidth', 2)
  const showLegend = cfg(styleProps, 'showLegend', keys.length > 1)
  const titleText = cfg(styleProps, 'title', '')
  const titleColor = cfg(styleProps, 'titleColor', '#cccccc')
  const areaStyle = cfg(styleProps, 'areaStyle', false)
  const displayPoints = cfg(styleProps, 'displayPoints', 500)
  const historyCapacity = cfg(styleProps, 'historyCapacity', 100_000)
  const renderEngine = cfg(styleProps, 'renderEngine', 'uplot-canvas') as string

  const isWebGL = renderEngine === 'uplot-webgl'

  // ── Binary stream (WebGL mode) ──────────────────────────────────────────────
  const { getChannel, tick } = useStreamData(
    scadaCode ?? '',
    isWebGL && !!scadaCode && keys.length > 0,
    historyCapacity,
  )

  // Ensure ring buffers exist for STOMP mode
  if (!isWebGL) {
    keys.forEach((key) => {
      if (!ringsRef.current.has(key)) {
        ringsRef.current.set(key, new RingBuf(historyCapacity))
      }
    })
  }

  function markDirty() { dirtyRef.current = true }

  // ---------------------------------------------------------------------------
  // Build aligned uPlot data
  // ---------------------------------------------------------------------------
  const buildData = useCallback((): uPlot.AlignedData => {
    function f64(len: number): Float64Array<ArrayBuffer> {
      return new Float64Array(new ArrayBuffer(len * 8))
    }
    function f64copy(src: Float64Array): Float64Array<ArrayBuffer> {
      const out = f64(src.length); out.set(src); return out
    }
    function applyWindow(t: Float64Array, v: Float64Array) {
      if (windowMs <= 0 || t.length === 0) return { t: f64copy(t), v: f64copy(v) }
      const cutoff = Date.now() - windowMs
      let s = 0
      while (s < t.length && t[s] < cutoff) s++
      return s === 0
        ? { t: f64copy(t), v: f64copy(v) }
        : { t: f64copy(t.subarray(s)), v: f64copy(v.subarray(s)) }
    }

    if (keys.length === 0) return [f64(0)]

    // ── WebGL: read directly from worker snapshots ──────────────────────────
    if (isWebGL) {
      const firstSnap = getChannel(keys[0])
      if (!firstSnap || firstSnap.size === 0) return [f64(0), ...keys.map(() => f64(0))]

      let { t: times, v: firstVals } = applyWindow(firstSnap.times, firstSnap.values)
      if (times.length > displayPoints) {
        const ds = lttb(times, firstVals, displayPoints)
        times = f64copy(ds.times); firstVals = f64copy(ds.values)
      }
      const xSec = f64(times.length)
      for (let i = 0; i < times.length; i++) xSec[i] = times[i] / 1000

      const seriesArrays = keys.map((key, ki) => {
        if (ki === 0) return firstVals
        const snap = getChannel(key)
        if (!snap || snap.size === 0) return f64(times.length)
        let { t: st, v: sv } = applyWindow(snap.times, snap.values)
        if (st.length > displayPoints) {
          const ds = lttb(st, sv, displayPoints); sv = f64copy(ds.values); st = f64copy(ds.times)
        }
        if (sv.length === times.length) return sv
        const result = f64(times.length)
        const tMap = new Map<number, number>()
        for (let i = 0; i < st.length; i++) tMap.set(st[i], sv[i])
        for (let i = 0; i < times.length; i++) result[i] = tMap.get(times[i]) ?? NaN
        return result
      })
      return [xSec, ...seriesArrays]
    }

    // ── STOMP: read from local ring buffers ─────────────────────────────────
    const firstRing = ringsRef.current.get(keys[0])
    if (!firstRing || firstRing.size === 0) return [f64(0), ...keys.map(() => f64(0))]

    const firstSnap = firstRing.snapshot()
    let { t: times, v: firstVals } = applyWindow(firstSnap.times, firstSnap.values)
    if (times.length > displayPoints) {
      const ds = lttb(times, firstVals, displayPoints)
      times = f64copy(ds.times); firstVals = f64copy(ds.values)
    }
    const xSec = f64(times.length)
    for (let i = 0; i < times.length; i++) xSec[i] = times[i] / 1000

    const seriesArrays = keys.map((key, ki) => {
      if (ki === 0) return firstVals
      const ring = ringsRef.current.get(key)
      if (!ring || ring.size === 0) return f64(times.length)
      const snap = ring.snapshot()
      let { t: st, v: sv } = applyWindow(snap.times, snap.values)
      if (st.length > displayPoints) {
        const ds = lttb(st, sv, displayPoints); sv = f64copy(ds.values); st = f64copy(ds.times)
      }
      if (sv.length === times.length) return sv
      const result = f64(times.length)
      const tMap = new Map<number, number>()
      for (let i = 0; i < st.length; i++) tMap.set(st[i], sv[i])
      for (let i = 0; i < times.length; i++) result[i] = tMap.get(times[i]) ?? NaN
      return result
    })
    return [xSec, ...seriesArrays]
  }, [keys, windowMs, displayPoints, isWebGL, getChannel])

  // rAF flush loop
  useEffect(() => {
    function frame() {
      if (dirtyRef.current && uplotRef.current) {
        dirtyRef.current = false
        uplotRef.current.setData(buildData())
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [buildData])

  // Mark dirty whenever stream worker emits a tick (WebGL mode)
  useEffect(() => {
    if (isWebGL) markDirty()
  }, [tick, isWebGL])

  // Init / recreate uPlot when keys or size changes
  useEffect(() => {
    if (!containerRef.current || keys.length === 0) return
    uplotRef.current?.destroy()
    uplotRef.current = null

    const w = el.width * zoom
    const h = el.height * zoom

    const opts: uPlot.Options = {
      width: w,
      height: h,
      padding: [titleText ? 24 : 8, 8, 0, 0],
      cursor: { show: false },
      legend: { show: showLegend },
      scales: { x: { time: true }, y: {} },
      axes: [
        { stroke: '#666', ticks: { stroke: '#444' }, grid: { stroke: '#2a2a3e' }, size: 30 },
        { stroke: '#666', ticks: { stroke: '#444' }, grid: { stroke: '#2a2a3e' }, size: 44 },
      ],
      series: [
        {},
        ...keys.map((key, i) => ({
          label: key,
          stroke: PALETTE[i % PALETTE.length],
          width: lineWidth,
          fill: areaStyle ? PALETTE[i % PALETTE.length] + '22' : undefined,
        })),
      ],
    }

    uplotRef.current = new uPlot(opts, buildData(), containerRef.current)
    return () => { uplotRef.current?.destroy(); uplotRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(','), el.width, el.height, zoom, showLegend, lineWidth, areaStyle, titleText, isWebGL])

  // Resize without full reinit
  useEffect(() => {
    uplotRef.current?.setSize({ width: el.width * zoom, height: el.height * zoom })
  }, [zoom, el.width, el.height])

  // Pre-load history on mount / keys change (both modes)
  useEffect(() => {
    if (!scadaCode || keys.length === 0) return
    if (!isWebGL) {
      keys.forEach((key) => ringsRef.current.set(key, new RingBuf(historyCapacity)))
    }
    dataBindingApi.fetchSimHistory(scadaCode, keys, maxPoints).then((res) => {
      const hist = res.data ?? {}
      if (!isWebGL) {
        keys.forEach((key) => {
          const pts = (hist[key] ?? []) as { t: number; v: number }[]
          const ring = ringsRef.current.get(key) ?? new RingBuf(historyCapacity)
          pts.slice(-maxPoints).forEach((p) => ring.push(p.t, p.v))
          ringsRef.current.set(key, ring)
        })
      }
      markDirty()
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scadaCode, keys.join(','), maxPoints, isWebGL])

  // Ingest live STOMP data (STOMP mode only)
  useEffect(() => {
    if (isWebGL || !pointData || keys.length === 0) return
    const now = Date.now()
    let changed = false
    keys.forEach((key) => {
      const v = pointData[key]
      if (v === undefined) return
      const ring = ringsRef.current.get(key)
      if (ring) { ring.push(now, Number(v)); changed = true }
    })
    if (changed) markDirty()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointData, isWebGL])

  const boxStyle = (extra: React.CSSProperties = {}) =>
    mergeAnimStyle(el, pointData ?? {}, {
      position: 'absolute', left: el.x * zoom, top: el.y * zoom,
      width: el.width * zoom, height: el.height * zoom,
      zIndex: el.zIndex, opacity: el.opacity ?? 1,
      pointerEvents: 'none', ...extra,
    })

  if (keys.length === 0) {
    return (
      <div style={boxStyle({
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a2e', color: '#555', fontSize: 12,
      })}>
        趋势图 — 请绑定数据点
      </div>
    )
  }

  return (
    <div style={boxStyle({ background: bgColor, overflow: 'hidden' })}>
      {titleText && (
        <div style={{
          position: 'absolute', top: 4, left: 8, fontSize: 12,
          color: titleColor, pointerEvents: 'none', zIndex: 1, whiteSpace: 'nowrap',
        }}>
          {titleText}
        </div>
      )}
      {isWebGL && (
        <div style={{
          position: 'absolute', top: 4, right: 8, fontSize: 9,
          color: '#4a9eff', opacity: 0.6, fontFamily: 'var(--font-mono)',
          pointerEvents: 'none', zIndex: 1, letterSpacing: '0.04em',
        }}>
          WebGL
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
