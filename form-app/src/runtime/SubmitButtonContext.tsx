/**
 * 为运行时 SubmitButton 组件提供表单提交能力：
 * - submit()：触发 SchemaFormRenderer 的提交逻辑（form.submit 校验 + onSubmit）
 * - submitting：提交进行中的 loading 状态
 */
import { createContext, useContext } from 'react'

export interface SubmitButtonContextValue {
  submit?: () => void
  submitting?: boolean
}

export const SubmitButtonContext = createContext<SubmitButtonContextValue>({})

export function useFormSubmit(): SubmitButtonContextValue {
  return useContext(SubmitButtonContext)
}
