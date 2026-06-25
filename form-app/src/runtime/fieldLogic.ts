import type { FieldBinding, FieldDef, FieldOption, VisibleWhenRule } from './types'

export function isFieldVisible(def: FieldDef, values: Record<string, any>): boolean {
  if (!def.visible_when) return true
  return evalVisibleWhen(def.visible_when, values)
}

export function evalVisibleWhen(rule: VisibleWhenRule, values: Record<string, any>): boolean {
  const raw = values[rule.field]
  const op = rule.operator || 'eq'
  switch (op) {
    case 'not_empty':
      return raw !== undefined && raw !== null && String(raw).trim() !== ''
    case 'empty':
      return raw === undefined || raw === null || String(raw).trim() === ''
    case 'eq':
      return String(raw) === String(rule.value)
    case 'neq':
      return String(raw) !== String(rule.value)
    case 'in': {
      const list = Array.isArray(rule.value) ? rule.value : String(rule.value ?? '').split(',').map(s => s.trim())
      return list.map(String).includes(String(raw))
    }
    case 'gt':
      return Number(raw) > Number(rule.value)
    case 'lt':
      return Number(raw) < Number(rule.value)
    default:
      return true
  }
}

export function bindingsForField(bindings: FieldBinding[], field: string): FieldBinding[] {
  return bindings.filter(b => b.field === field)
}

export function bindingsTriggeredBy(bindings: FieldBinding[], changedField: string): FieldBinding[] {
  return bindings.filter(b => (b.listen_targets || []).includes(changedField))
}

export function buildBindingParamValues(
  binding: FieldBinding,
  values: Record<string, any>,
  extra?: Record<string, any>,
): Record<string, any> {
  const params: Record<string, any> = { ...(extra || {}) }
  const ctxKey = binding.context_key?.trim() || binding.field
  for (const target of binding.listen_targets || []) {
    if (values[target] !== undefined) {
      params[target] = values[target]
    }
  }
  if (values[binding.field] !== undefined) {
    params[binding.field] = values[binding.field]
  }
  if (ctxKey && values[ctxKey] !== undefined) {
    params[ctxKey] = values[ctxKey]
  }
  for (const target of binding.listen_targets || []) {
    if (values[target] !== undefined && ctxKey) {
      params[ctxKey] = values[target]
    }
  }
  return params
}

export function rowsToOptions(rows: unknown[]): FieldOption[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row, idx) => {
    if (row == null || typeof row !== 'object') {
      return { label: String(row ?? idx), value: String(row ?? idx) }
    }
    const r = row as Record<string, unknown>
    const value = r.value ?? r.id ?? r.code ?? r.key ?? idx
    const label = r.label ?? r.name ?? r.title ?? r.text ?? value
    return { label: String(label), value: value as string | number | boolean }
  })
}

export function parseBindingsFromRuntimeSchema(runtimeSchema?: string | null): FieldBinding[] {
  if (!runtimeSchema) return []
  try {
    const schema = JSON.parse(runtimeSchema)
    const raw = schema?.bindings
    if (!Array.isArray(raw)) return []
    return raw
      .filter((b: any) => b && typeof b.field === 'string')
      .map((b: any) => ({
        field: String(b.field),
        context_key: b.context_key ? String(b.context_key) : undefined,
        listen_targets: Array.isArray(b.listen_targets) ? b.listen_targets.map(String) : [],
        query_source_type: b.query_source_type,
        query_interface_code: b.query_interface_code ? String(b.query_interface_code) : undefined,
      }))
  } catch {
    return []
  }
}
