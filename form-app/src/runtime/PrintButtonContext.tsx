/**
 * 为字段级 PrintButton 组件提供运行时能力：
 * - print(templateId, extra?)：直接触发某打印模板
 * - triggerButton(buttonId)：触发 source.kind==='button' 的页面事件链
 * 设计器预览/纯浏览器环境下这些能力可能为空（doPrint 未注入）。
 */
import { createContext, useContext } from 'react'

export interface PrintButtonContextValue {
  /** 直接打印某模板（使用当前表单值 + extra 占位数据） */
  print?: (templateId: string, extra?: Record<string, any>) => Promise<void>
  /** 触发 button 事件源 */
  triggerButton?: (buttonId: string) => void
}

export const PrintButtonContext = createContext<PrintButtonContextValue>({})

export function usePrintButton(): PrintButtonContextValue {
  return useContext(PrintButtonContext)
}
