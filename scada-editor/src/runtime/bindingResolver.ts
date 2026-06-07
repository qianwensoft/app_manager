import type { CanvasElement, PointBinding } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { applyFormatter } from '@/hooks/useInterfaceBindingData'

function applyTransform(raw: number, transform?: string): number {
  if (!transform) return raw
  try {
    // eslint-disable-next-line no-new-func
    return Number(new Function('v', `return (${transform})`)(raw))
  } catch {
    return raw
  }
}

/** 各绑定模式用于查找 pointData 的主键 */
export function bindingDataKey(binding?: PointBinding): string {
  if (!binding) return ''
  const mode = binding.mode ?? 'point'
  switch (mode) {
    case 'simulation':
      return binding.simLinkName ?? ''
    case 'static':
      return '__static_value'
    case 'interface':
      return '__iface_value'
    case 'trend':
      return binding.trendKeys?.[0] ?? ''
    case 'point':
    default:
      return binding.pointKey ?? binding.linkName ?? ''
  }
}

/** 解析绑定点位数值 v（动画/事件条件） */
export function resolveBindingNumericValue(el: CanvasElement, pointData: PointDataMap): number {
  const pb = el.pointBinding
  if (!pb) return 0
  const mode = pb.mode ?? 'point'

  switch (mode) {
    case 'static': {
      const sd = pb.staticData ?? {}
      const raw = sd.value ?? sd[pb.pointKey ?? 'value']
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
      return applyTransform(Number.isFinite(n) ? n : 0, pb.transform)
    }
    case 'simulation': {
      const key = pb.simLinkName
      if (!key) return 0
      return applyTransform(Number(pointData[key] ?? 0), pb.transform)
    }
    case 'interface': {
      const raw = pointData.__iface_value ?? pointData.__iface_text
      return applyTransform(Number(raw ?? 0), pb.transform)
    }
    case 'trend': {
      const key = pb.trendKeys?.[0]
      if (!key) return 0
      return applyTransform(Number(pointData[key] ?? 0), pb.transform)
    }
    case 'point':
    default: {
      const key = pb.pointKey ?? pb.linkName
      if (!key) return 0
      return applyTransform(Number(pointData[key] ?? 0), pb.transform)
    }
  }
}

/** 解析元件显示文本（text/button 等） */
export function resolveElementDisplayValue(el: CanvasElement, pointData: PointDataMap): string | undefined {
  const binding = el.pointBinding
  if (!binding) return el.text

  const fmt = binding.formatter

  switch (binding.mode ?? 'point') {
    case 'static': {
      const v = (binding.staticData ?? {}).value ?? (binding.staticData ?? {})[binding.pointKey ?? '']
      if (v === undefined) return el.text
      return applyFormatter(typeof v === 'number' ? v : String(v), fmt)
    }
    case 'simulation': {
      const key = binding.simLinkName
      if (!key) return el.text
      const raw = pointData[key]
      if (raw === undefined) return el.text
      return applyFormatter(applyTransform(raw, binding.transform), fmt)
    }
    case 'interface': {
      const mapped = pointData.__iface_value ?? pointData.__iface_text
      if (mapped === undefined) return el.text
      return applyFormatter(typeof mapped === 'number' ? mapped : String(mapped), fmt)
    }
    case 'trend': {
      const key = binding.trendKeys?.[0]
      if (!key) return el.text
      const raw = pointData[key]
      if (raw === undefined) return el.text
      return applyFormatter(applyTransform(raw, binding.transform), fmt)
    }
    case 'point':
    default: {
      const key = binding.pointKey ?? binding.linkName
      if (!key) return el.text
      const raw = pointData[key]
      if (raw === undefined) return el.text
      return applyFormatter(applyTransform(raw, binding.transform), fmt)
    }
  }
}
