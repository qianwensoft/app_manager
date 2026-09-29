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

const KNOWN_FIELD_PROPS: readonly FieldProp[] = ['visible', 'disabled', 'readOnly', 'background', 'color', 'title']

const isDev = (() => {
  try { return Boolean((import.meta as any)?.env?.DEV) } catch { return false }
})()

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
            // 写入 FormItem 容器（decoratorProps.style）。
            // Formily 的 ReactiveField 渲染 FormItem 时：toJS(field.decoratorProps) → 整个对象展开传给 FormItem
            // → FormItem 外层 div 拿到 style.background 生效。
            // 同步也写入 componentProps.style 兜底（无装饰器字段或想同时影响内部组件时仍然有效）。
            const cssValue = value == null ? '' : String(value)
            const prevDeco = state.decoratorProps || {}
            state.decoratorProps = {
              ...prevDeco,
              style: { ...(prevDeco.style || {}), [prop]: cssValue },
            }
            const prevComp = state.componentProps || {}
            state.componentProps = {
              ...prevComp,
              style: { ...(prevComp.style || {}), [prop]: cssValue },
            }
            // eslint-disable-next-line no-console
            console.debug(
              `[form-app] setProp: ${prop}="${value}" → field="${path}"`,
              { decoratorStyle: state.decoratorProps.style, componentStyle: state.componentProps.style },
            )
            break
          }
          default: {
            // 未知 prop（拼写错误最常见，例如 "backgroud" → "background"）：
            // 静默吞掉会让事件看上去"不生效"，开发期主动报出来。
            // 不抛错，避免线上脚本带错 prop 时整个页面崩。
            if (isDev) {
              // eslint-disable-next-line no-console
              console.warn(
                `[form-app] setProp: 未知字段属性 "${prop}"（path=${path}）。`
                  + `可用值：${KNOWN_FIELD_PROPS.join(', ')}。`,
              )
            }
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
