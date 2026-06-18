/**
 * 表单动作上下文：为运行时按钮组件（ActionButton / EventButton / NavigateButton）
 * 提供统一的动作能力，由 SchemaFormRenderer 注入。
 *
 * - submit():            触发表单提交（校验 + onSubmit）
 * - submitting:          提交进行中
 * - triggerButton(id):   触发「事件系统」中 source=button、按钮ID 匹配的事件链
 * - navigate(key, p):    跳转到指定页面
 * - callInterface(...):  调用数据接口（internal / third_party / connector）
 * - getFormValues():     读取当前表单值（用于拼接接口/跳转参数）
 */
import { createContext, useContext } from 'react'

export interface FormActionContextValue {
  submit?: () => void
  submitting?: boolean
  triggerButton?: (buttonId: string) => void
  navigate?: (pageKey: string, params: Record<string, any>) => void
  callInterface?: (
    interfaceCode: string,
    paramValues: Record<string, any>,
    type?: 'internal' | 'third_party' | 'connector',
    endpointId?: number,
  ) => Promise<any>
  getFormValues?: () => Record<string, any>
}

export const FormActionContext = createContext<FormActionContextValue>({})

export function useFormAction(): FormActionContextValue {
  return useContext(FormActionContext)
}
