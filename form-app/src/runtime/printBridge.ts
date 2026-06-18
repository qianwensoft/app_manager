/**
 * 打印桥接：form-app 运行在 Agent WebView 内时，通过 window.AndroidBridge 把打印
 * 指令交给原生层（蓝牙连接 + 协议生成在 Agent 端）。纯浏览器环境下为降级提示。
 *
 * 与 Agent 端约定的 payload（见 agent 的 ProtocolBuilder 注释）：
 *   {
 *     protocol: 'cpcl'|'escpos'|'tspl',
 *     gen_side: 'agent'|'frontend',
 *     content: PrintOp[],          // gen_side=agent 时结构化指令
 *     raw_base64?: string,         // gen_side=frontend 时前端已生成的协议字节
 *     paper?: PaperSpec,           // 纸张规格（标签纸 type/width_mm/height_mm/gap_mm）
 *     mac?, transport?             // 省略则用 Agent 默认打印机
 *   }
 */
import type { PrinterTemplate, PrintOp, PrintElement, PrintCondition } from './printerTypes'

interface AndroidPrintBridge {
  print?: (payloadJson: string) => string | void
  listPrinters?: () => string
  setDefaultPrinter?: (json: string) => void
}

function getBridge(): AndroidPrintBridge | null {
  if (typeof window === 'undefined') return null
  const b = (window as any).AndroidBridge as AndroidPrintBridge | undefined
  return b && typeof b.print === 'function' ? b : null
}

export function isPrintBridgeAvailable(): boolean {
  return getBridge() !== null
}

/** 渲染单个值来源占位（{{字段名}}）：优先 extra，再 form 值 */
function renderPlaceholders(
  text: string,
  values: Record<string, any>,
  extra?: Record<string, any>,
): string {
  if (!text) return text
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const fromExtra = extra && key in extra ? extra[key] : undefined
    const v = fromExtra !== undefined ? fromExtra : key.split('.').reduce((c: any, k) => (c == null ? c : c[k]), values)
    return v === undefined || v === null ? '' : String(v)
  })
}

/** 对结构化指令里的文本/数据做占位渲染 */
function renderContent(
  content: PrintOp[],
  values: Record<string, any>,
  extra?: Record<string, any>,
): PrintOp[] {
  return (content || []).map(op => {
    const next: any = { ...op }
    if (typeof next.text === 'string') next.text = renderPlaceholders(next.text, values, extra)
    if (typeof next.data === 'string') next.data = renderPlaceholders(next.data, values, extra)
    return next as PrintOp
  })
}

/** 对坐标元素里的文本/数据做占位渲染 */
function renderElements(
  elements: PrintElement[],
  values: Record<string, any>,
  extra?: Record<string, any>,
): PrintElement[] {
  return (elements || []).map(el => {
    const next: any = { ...el }
    if (typeof next.text === 'string') next.text = renderPlaceholders(next.text, values, extra)
    if (typeof next.data === 'string') next.data = renderPlaceholders(next.data, values, extra)
    return next as PrintElement
  })
}

/** 取条件字段对应的原始值：优先 extra，再 form 值（支持 a.b 路径） */
function lookupCondValue(
  field: string,
  values: Record<string, any>,
  extra?: Record<string, any>,
): any {
  if (extra && field in extra) return extra[field]
  return field.split('.').reduce((c: any, k) => (c == null ? c : c[k]), values)
}

/**
 * 判定元素打印条件是否成立。无条件 / 未设字段 → 始终打印。
 * 数值比较（gt/lt 等）按 Number 解析；长度比较按字符串长度；空判定对 null/''/undefined 生效。
 */
export function evalPrintCondition(
  cond: PrintCondition | undefined,
  values: Record<string, any>,
  extra?: Record<string, any>,
): boolean {
  if (!cond || !cond.field) return true
  const raw = lookupCondValue(cond.field, values, extra)
  const str = raw === undefined || raw === null ? '' : String(raw)
  const cmp = cond.value ?? ''
  const num = Number(str)
  const cmpNum = Number(cmp)
  const bothNumeric = str !== '' && cmp !== '' && !Number.isNaN(num) && !Number.isNaN(cmpNum)
  switch (cond.op) {
    case 'eq': return str === cmp
    case 'ne': return str !== cmp
    case 'gt': return bothNumeric ? num > cmpNum : str > cmp
    case 'gte': return bothNumeric ? num >= cmpNum : str >= cmp
    case 'lt': return bothNumeric ? num < cmpNum : str < cmp
    case 'lte': return bothNumeric ? num <= cmpNum : str <= cmp
    case 'len_eq': return str.length === (Number.isNaN(cmpNum) ? -1 : cmpNum)
    case 'len_gt': return str.length > (Number.isNaN(cmpNum) ? Infinity : cmpNum)
    case 'len_lt': return str.length < (Number.isNaN(cmpNum) ? -Infinity : cmpNum)
    case 'empty': return str.length === 0
    case 'not_empty': return str.length > 0
    case 'contains': return cmp !== '' && str.includes(cmp)
    default: return true
  }
}

/**
 * 由模板 + 表单值构建下发给 Agent 的打印 payload（与 ProtocolBuilder.build 约定一致）。
 * 既用于 WebView 桥接打印，也用于控制台远程调试打印（同一份渲染逻辑）。
 * 按 layout_mode 取其一：canvas=坐标元素 | raw=原始协议 | flow=顺序指令（默认）。
 */
export function buildPrintPayload(
  tpl: PrinterTemplate,
  values: Record<string, any>,
  extra?: Record<string, any>,
): Record<string, any> {
  const payload: Record<string, any> = {
    protocol: tpl.protocol,
    gen_side: tpl.gen_side || 'agent',
  }
  if (tpl.paper) payload.paper = tpl.paper

  // 兼容：旧 gen_side=frontend 视同 raw
  const mode = tpl.layout_mode || ((tpl.gen_side || 'agent') === 'frontend' ? 'raw' : 'flow')
  if (mode === 'canvas') {
    payload.layout_mode = 'canvas'
    // 先按打印条件过滤，再渲染占位
    const kept = (tpl.elements || []).filter(el => evalPrintCondition(el.print_when, values, extra))
    payload.elements = renderElements(kept, values, extra)
    // 附带原始字段值，供 Agent 端对 print_when 兜底再判定（服务端中转/旧前端路径）。
    // extra 覆盖表单值，与占位渲染、条件取值的优先级一致。
    payload.values = { ...values, ...(extra || {}) }
  } else if (mode === 'raw') {
    payload.layout_mode = 'raw'
    payload.raw_base64 = utf8ToBase64(renderPlaceholders(tpl.raw_template || '', values, extra))
  } else {
    payload.layout_mode = 'flow'
    payload.content = renderContent(tpl.content || [], values, extra)
  }
  return payload
}

/**
 * 执行打印。templateId 在 templates 中查找；values 为当前表单值；extra 为事件附加占位数据。
 * 返回 Promise；桥不可用时 reject。
 */
export async function doPrintViaBridge(
  templates: PrinterTemplate[],
  templateId: string,
  values: Record<string, any>,
  extra?: Record<string, any>,
): Promise<void> {
  const tpl = templates.find(t => t.id === templateId)
  if (!tpl) throw new Error(`打印模板不存在: ${templateId}`)

  const bridge = getBridge()
  if (!bridge?.print) {
    throw new Error('打印需在 Agent 客户端内运行')
  }

  const payload = buildPrintPayload(tpl, values, extra)

  const ret = bridge.print(JSON.stringify(payload))
  // 原生若同步返回 JSON 结果则解析；否则视为已受理
  if (typeof ret === 'string' && ret) {
    try {
      const r = JSON.parse(ret)
      if (r && r.success === false) throw new Error(r.error || '打印失败')
    } catch (e: any) {
      if (e?.message && e.message !== 'Unexpected end of JSON input') throw e
    }
  }
}

function utf8ToBase64(s: string): string {
  // 浏览器环境：先 UTF-8 编码再 base64
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

export function listPrintersViaBridge(): any[] {
  const bridge = getBridge()
  if (!bridge?.listPrinters) return []
  try {
    const raw = bridge.listPrinters()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
