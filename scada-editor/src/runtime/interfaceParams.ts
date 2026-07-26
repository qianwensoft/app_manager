import type { CanvasElement, InterfaceParamBinding, ParamSpec, PointBinding } from '@/types'
import { getPath, parseBindingValue } from './bindingData'
import type { PointDataMap } from '@/hooks/useStompPointData'

export interface InterfaceParamContext {
  scadaCode: string
  pointData: PointDataMap
  elements: CanvasElement[]
  objectContext?: Record<string, unknown>
  urlSearch?: string
}

function coerceParamValue(value: unknown, spec?: ParamSpec): unknown {
  if (value === undefined || value === null || !spec || spec.type === 'any') return value
  if (spec.type === 'string') return String(value)
  if (spec.type === 'boolean') return value === true || value === 'true' || value === 1 || value === '1'
  if (spec.type === 'number' || spec.type === 'integer') {
    const number = Number(value)
    return Number.isFinite(number) ? (spec.type === 'integer' ? Math.trunc(number) : number) : undefined
  }
  return value
}

function resolveBinding(binding: InterfaceParamBinding | undefined, context: InterfaceParamContext): unknown {
  if (!binding || binding.source === 'constant') return parseBindingValue(binding?.value)
  if (binding.source === 'url') return new URLSearchParams(context.urlSearch ?? window.location.search).get(binding.path ?? '') ?? undefined
  if (binding.source === 'context') return getPath({ scadaCode: context.scadaCode, pointData: context.pointData }, binding.path)
  if (binding.source === 'point') return getPath(context.pointData, binding.path)
  if (binding.source === 'object') return getPath(context.objectContext, binding.path)
  if (binding.source === 'element') {
    const [elementId, ...propertyPath] = (binding.elementId ? [binding.elementId, binding.property ?? binding.path ?? ''] : (binding.path ?? '').split('.'))
    const element = context.elements.find((item) => item.id === elementId)
    return getPath(element, propertyPath.join('.'))
  }
  return undefined
}

export function resolveInterfaceParams(binding: PointBinding, specs: ParamSpec[] = [], context: InterfaceParamContext): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const bindings = binding.ifaceParamBindings ?? {}
  const legacy = binding.ifaceParamValues ?? {}
  const names = new Set([...Object.keys(legacy), ...Object.keys(bindings), ...specs.map((spec) => spec.name)])

  for (const name of names) {
    const spec = specs.find((item) => item.name === name)
    const value = bindings[name]
      ? resolveBinding(bindings[name], context)
      : parseBindingValue(legacy[name])
    const resolved = coerceParamValue(value === undefined ? spec?.default : value, spec)
    if (resolved !== undefined && resolved !== '') result[name] = resolved
  }
  return result
}
