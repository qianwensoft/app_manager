/** 组态画布 JSON（与后端 canvas_data 文本字段对应） */

export const CANVAS_VERSION = 1

export function emptyCanvas () {
  return {
    version: CANVAS_VERSION,
    width: 1200,
    height: 800,
    background: '#1a2332',
    widgets: []
  }
}

/**
 * @param {string} raw
 * @returns {{ version: number, width: number, height: number, background: string, widgets: object[] }}
 */
export function parseCanvas (raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return emptyCanvas()
  }
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return emptyCanvas()
    const base = emptyCanvas()
    base.version = typeof o.version === 'number' ? o.version : CANVAS_VERSION
    base.width = Math.max(400, Number(o.width) || 1200)
    base.height = Math.max(300, Number(o.height) || 800)
    base.background = typeof o.background === 'string' ? o.background : base.background
    base.widgets = Array.isArray(o.widgets) ? o.widgets.map(normalizeWidget) : []
    return base
  } catch {
    return emptyCanvas()
  }
}

export function stringifyCanvas (canvas) {
  return JSON.stringify(canvas, null, 2)
}

function normalizeWidget (w) {
  const id = typeof w.id === 'string' && w.id ? w.id : newId()
  const type = ['text', 'value', 'rect'].includes(w.type) ? w.type : 'value'
  const x = Number(w.x) || 0
  const y = Number(w.y) || 0
  const width = Math.max(24, Number(w.w ?? w.width) || 120)
  const height = Math.max(24, Number(w.h ?? w.height) || 48)
  const common = { id, type, x, y, w: width, h: height }
  if (type === 'text') {
    return {
      ...common,
      text: String(w.text ?? ''),
      fontSize: Math.max(10, Number(w.fontSize) || 14),
      color: String(w.color ?? '#e8eaed')
    }
  }
  if (type === 'rect') {
    return {
      ...common,
      fill: String(w.fill ?? 'transparent'),
      stroke: String(w.stroke ?? '#3d4f66'),
      borderWidth: Math.max(0, Number(w.borderWidth) || 1),
      radius: Math.max(0, Number(w.radius) || 4)
    }
  }
  // value
  return {
    ...common,
    label: String(w.label ?? '测点'),
    linkName: String(w.linkName ?? '').trim(),
    unit: String(w.unit ?? ''),
    decimals: Math.min(6, Math.max(0, Number(w.decimals) ?? 2)),
    fontSize: Math.max(10, Number(w.fontSize) || 16),
    color: String(w.color ?? '#e8eaed'),
    valueColor: String(w.valueColor ?? '#4fc3f7')
  }
}

export function newId () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `w_${crypto.randomUUID().slice(0, 8)}`
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function createWidget (type) {
  const id = newId()
  if (type === 'text') {
    return normalizeWidget({ id, type: 'text', x: 48, y: 48, w: 200, h: 36, text: '文本', fontSize: 14, color: '#e8eaed' })
  }
  if (type === 'rect') {
    return normalizeWidget({ id, type: 'rect', x: 48, y: 48, w: 280, h: 160, fill: 'rgba(0,0,0,0.15)', stroke: '#3d4f66', borderWidth: 1, radius: 6 })
  }
  return normalizeWidget({
    id,
    type: 'value',
    x: 48,
    y: 48,
    w: 200,
    h: 64,
    label: '数值',
    linkName: 'point1',
    unit: '',
    decimals: 2,
    fontSize: 16,
    color: '#aeb8c7',
    valueColor: '#4fc3f7'
  })
}
