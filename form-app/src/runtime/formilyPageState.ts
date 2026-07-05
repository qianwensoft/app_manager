/**
 * Formily 适配器：把 createForm() 实例适配成 StateScope。
 *
 * 现在散在 eventEngine 里的全部 Formily 细节（setFieldState recipe、
 * onFieldValueChange 订阅）集中到这里，使 eventEngine.ts 不再 import @formily/*。
 *
 * 设计说明见 docs/事件引擎脱Formily落地设计.md。
 */
import type { Form as FormilyForm } from '@formily/core'
import { onFieldValueChange } from '@formily/core'
import type { StateScope, FieldProp } from './pageState'

const truthy = (v: any): boolean => {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === '是' || s === 'on'
}

/** 点路径取值，如 data.employee.name */
function resolveNestedField(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').reduce((cur, key) => (cur == null ? cur : cur[key]), obj)
}

/**
 * @param form               createForm() 实例
 * @param getValuesSnapshot   实时值快照来源（= 渲染器的 valuesRef.current）
 * @param urlParams          URL 参数（用于表达式中的 $url.xxx）
 */
export function createFormilyPageState(
  form: FormilyForm,
  getValuesSnapshot: () => Record<string, any>,
  urlParams: Record<string, any> = {},
): StateScope {
  return {
    getValues: () => getValuesSnapshot(),
    // 与原 script.get 一致：从实时快照按点路径取（不走 form.getValuesIn 以保逐字行为）
    get: (path) => resolveNestedField(getValuesSnapshot(), path),
    set: (path, value) => { if (path) form.setValuesIn(path, value) },
    setProp: (path, prop, value) => {
      if (!path || !prop) return
      form.setFieldState(path, (state: any) => {
        switch (prop as FieldProp) {
          case 'visible':
            state.display = truthy(value) ? 'visible' : 'none'
            break
          case 'disabled':
            state.disabled = truthy(value)
            break
          case 'readOnly':
            state.readOnly = truthy(value)
            break
          case 'title':
            state.title = value == null ? '' : String(value)
            break
          case 'background':
          case 'color': {
            // 写入组件 style，运行时反映到表单控件外观
            const prevProps = state.componentProps || {}
            const prevStyle = prevProps.style || {}
            state.componentProps = {
              ...prevProps,
              style: { ...prevStyle, [prop]: value == null ? '' : String(value) },
            }
            break
          }
        }
      })
    },
    subscribe: (cb) => {
      const effectId = 'page-events-field-change'
      form.addEffects(effectId, () => {
        onFieldValueChange('*', (field: any) => {
          const addr: string = field?.address?.toString?.() || field?.path?.toString?.() || ''
          const shortName = addr.split('.').pop() || addr
          cb(shortName, field?.value)
        })
      })
      return () => form.removeEffects(effectId)
    },
    url: urlParams,
  }
}
