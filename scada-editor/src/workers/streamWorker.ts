import { decode } from '@msgpack/msgpack'

interface BatchFrame {
  points: Array<{ k: string; t: number; v: number }>
}

class TypedRingBuffer {
  times: Float64Array
  values: Float64Array
  head: number
  size: number
  cap: number

  constructor(cap: number) {
    this.cap = cap
    this.times = new Float64Array(cap)
    this.values = new Float64Array(cap)
    this.head = 0
    this.size = 0
  }

  push(t: number, v: number): void {
    this.times[this.head] = t
    this.values[this.head] = v
    this.head = (this.head + 1) % this.cap
    if (this.size < this.cap) this.size++
  }

  snapshot(): { times: Float64Array; values: Float64Array; size: number } {
    const { size, cap, head } = this
    const outT = new Float64Array(size)
    const outV = new Float64Array(size)
    if (size < cap) {
      // buffer not yet full — data starts at index 0
      outT.set(this.times.subarray(0, size))
      outV.set(this.values.subarray(0, size))
    } else {
      // oldest element is at head
      const tail = cap - head
      outT.set(this.times.subarray(head, cap), 0)
      outT.set(this.times.subarray(0, head), tail)
      outV.set(this.values.subarray(head, cap), 0)
      outV.set(this.values.subarray(0, head), tail)
    }
    return { times: outT, values: outV, size }
  }
}

let ws: WebSocket | null = null
const buffers = new Map<string, TypedRingBuffer>()
let bufCap = 100_000

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'init') {
    const { scadaCode, host, cap } = msg
    if (cap) bufCap = cap
    const proto = (self as unknown as { location: Location }).location?.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${host}/ws/scada/stream/${scadaCode}`
    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.onmessage = (ev: MessageEvent) => {
      let frame: BatchFrame
      try {
        frame = decode(new Uint8Array(ev.data as ArrayBuffer)) as BatchFrame
      } catch {
        return
      }
      if (!frame?.points?.length) return

      const updated = new Set<string>()
      for (const { k, t, v } of frame.points) {
        let buf = buffers.get(k)
        if (!buf) {
          buf = new TypedRingBuffer(bufCap)
          buffers.set(k, buf)
        }
        buf.push(t, v)
        updated.add(k)
      }

      for (const ch of updated) {
        const snap = buffers.get(ch)!.snapshot()
        self.postMessage(
          { type: 'data', channel: ch, times: snap.times, values: snap.values, size: snap.size },
          { transfer: [snap.times.buffer, snap.values.buffer] }
        )
      }

      self.postMessage({ type: 'tick', channels: Array.from(updated) })
    }

    ws.onerror = () => {
      self.postMessage({ type: 'error', message: 'WebSocket error' })
    }

    ws.onclose = () => {
      self.postMessage({ type: 'closed' })
    }
  } else if (msg.type === 'stop') {
    ws?.close()
    ws = null
    buffers.clear()
  }
}
