import type { CanvasElement, GroupParamSpec } from '@/types'

/**
 * 扫描组内子元素的 {{}} 占位符、${...} 表达式以及 extData 等可参数化位置，
 * 提取出当前组需要的参数列表（与 item.<xxx> 中的 xxx 对齐）。
 *
 * 提取来源：
 *  - text
 *  - pointBinding.textTemplate
 *  - pointBinding.staticData 中的 {{}} 字段（chart 静态数据可被 ${} 替代）
 *  - extData 中出现的 {{}}
 *  - ${...} 表达式中出现的 item.<xxx>
 *  - pointBinding.transform / conditionalStyles / events 中的 ${...}
 *
 * 不会提取：
 *  - {{ext:...}} / {{el:...}} / {{comp:...}} / {{global:...}}（这是跨组件引用，非 item 数据）
 *  - 非 item 别名的 {{xxx}}（视作全局/未知占位符，不列入参数）
 *
 * 返回的 GroupParamSpec[] 中：
 *  - name  = 参数名（即 xxx）
 *  - sample = 第一个 item 实例中读取的样本值（用于推断类型）
 *  - type   = 由 sample 推断（'number' | 'boolean' | 'object' | 'array' | 'string'）
 *  - usedIn = 出现位置
 */
export function scanElementsForTemplateParams(
  elements: CanvasElement[],
  itemAlias: string,
  sampleItem?: unknown
): GroupParamSpec[] {
  const aliasPrefix = `${itemAlias}.`
  const seen = new Map<string, GroupParamSpec>()

  const collect = (rawPath: string, location: NonNullable<GroupParamSpec['usedIn']>[number]) => {
    // 仅收集 item.xxx 形式
    const trimmed = rawPath.trim()
    if (!trimmed.startsWith(aliasPrefix)) return
    const name = trimmed.slice(aliasPrefix.length).trim()
    if (!name) return
    let spec = seen.get(name)
    if (!spec) {
      const sample = sampleItem ? extractSampleForParam(sampleItem, name) : undefined
      spec = {
        name,
        type: inferType(sample),
        usedIn: [location],
      }
      seen.set(name, spec)
    } else {
      const usedIn = spec.usedIn ?? (spec.usedIn = [])
      if (!usedIn.includes(location)) usedIn.push(location)
    }
  }

  for (const el of elements) {
    if (el.text) scanTemplate(el.text, itemAlias, (p) => collect(p, 'text'))
    if (el.pointBinding?.textTemplate) {
      scanTemplate(el.pointBinding.textTemplate, itemAlias, (p) => collect(p, 'textTemplate'))
    }
    if (el.pointBinding?.transform) {
      scanExpression(el.pointBinding.transform, itemAlias, (p) => collect(p, 'expression'))
    }
    if (el.pointBinding?.staticData) {
      scanStaticDataForPlaceholders(el.pointBinding.staticData, itemAlias, (p) => collect(p, 'pointBinding'))
    }
    if (el.conditionalStyles) {
      for (const list of [
        el.conditionalStyles.fontColor,
        el.conditionalStyles.fill,
        el.conditionalStyles.stroke,
        el.conditionalStyles.backgroundColor,
      ]) {
        if (!list) continue
        for (const rule of list) {
          if (rule.condition) scanExpression(rule.condition, itemAlias, (p) => collect(p, 'expression'))
        }
      }
    }
    if (el.events?.length) {
      for (const ev of el.events) {
        if (typeof ev.script === 'string') scanExpression(ev.script, itemAlias, (p) => collect(p, 'expression'))
        if (typeof ev.workflowId !== 'undefined') {
          // 工作流调用无法静态解析，但 ${item.xxx} 仍可出现在参数中；忽略具体路径
        }
      }
    }
    if (el.extData) {
      for (const v of Object.values(el.extData)) {
        if (typeof v === 'string') scanTemplate(v, itemAlias, (p) => collect(p, 'extData'))
      }
    }
  }

  return Array.from(seen.values())
}

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

/**
 * 提取字符串中所有 {{ ... }} 内的内容（非贪婪），
 * 排除 ext: / el: / comp: / global: 这四种跨组件 scheme。
 */
export function scanTemplate(text: string, itemAlias: string, cb: (path: string) => void): void {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const inside = m[1].trim()
    if (!inside) continue
    const scheme = inside.split(':')[0]
    if (scheme === 'ext' || scheme === 'el' || scheme === 'comp' || scheme === 'global') continue
    // 兼容 ${} 嵌入在 {{}} 中的写法（一般不会，但保守处理）
    cb(inside)
  }
}

/**
 * 在 JS 表达式中查找 item.xxx / item['xxx'] / item["xxx"] 引用。
 * 不解析完整 JS，只扫描标识符与中括号下标；足以覆盖 el() / params.xxx / 简单表达式。
 */
export function scanExpression(expr: string, itemAlias: string, cb: (path: string) => void): void {
  // 1. item.xxx / item_xxx
  const idRe = new RegExp(`\\b${escapeRegex(itemAlias)}\\.([A-Za-z_$][\\w$]*)`, 'g')
  let m: RegExpExecArray | null
  while ((m = idRe.exec(expr)) !== null) {
    cb(`${itemAlias}.${m[1]}`)
  }
  // 2. item['xxx'] / item["xxx"]
  const bracketRe = new RegExp(`\\b${escapeRegex(itemAlias)}\\[['"]([^'"]+)['"]\\]`, 'g')
  while ((m = bracketRe.exec(expr)) !== null) {
    cb(`${itemAlias}.${m[1]}`)
  }
}

function scanStaticDataForPlaceholders(
  obj: unknown,
  itemAlias: string,
  cb: (path: string) => void,
  path: (string | number)[] = []
): void {
  if (obj == null) return
  if (typeof obj === 'string') {
    scanTemplate(obj, itemAlias, cb)
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanStaticDataForPlaceholders(v, itemAlias, cb, [...path, i]))
    return
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      scanStaticDataForPlaceholders(v, itemAlias, cb, [...path, k])
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSampleForParam(item: unknown, name: string): unknown {
  if (item == null) return undefined
  return name.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k]
    return undefined
  }, item)
}

function inferType(sample: unknown): GroupParamSpec['type'] {
  if (sample === undefined || sample === null) return 'string'
  if (typeof sample === 'number') return Number.isInteger(sample) ? 'integer' : 'number'
  if (typeof sample === 'boolean') return 'boolean'
  if (Array.isArray(sample)) return 'array'
  if (typeof sample === 'object') return 'object'
  return 'string'
}
