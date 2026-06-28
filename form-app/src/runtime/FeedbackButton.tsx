/**
 * 一键反馈按钮 - 跳转到 Agent 端的反馈提交页面
 *
 * 可配置当前页面数据与反馈内容的绑定关系：
 * - 业务单号映射
 * - 其他编码映射
 * - 标题映射
 * - 描述映射
 * - 反馈类型指定
 */
import { Button } from '@/components/ui/button'
import { useFormAction } from './FormActionContext'
import { MessageSquareText } from 'lucide-react'

type ButtonType = 'primary' | 'default' | 'dashed' | 'link' | 'text'

interface FeedbackButtonProps {
  text?: string
  type?: ButtonType
  block?: boolean
  /** 反馈类型 code（留空则由用户在反馈页选择） */
  feedbackType?: string
  /** 业务单号字段映射（$form.xxx 引用表单字段） */
  businessNoField?: string
  /** 其他编码字段映射（$form.xxx，多个用逗号分隔） */
  otherCodesField?: string
  /** 标题字段映射（$form.xxx） */
  titleField?: string
  /** 描述字段映射（$form.xxx） */
  descriptionField?: string
}

/** antd type → shadcn variant 映射 */
function getVariant(type: ButtonType): 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' {
  switch (type) {
    case 'primary': return 'default'
    case 'dashed': return 'outline'
    case 'link': return 'link'
    case 'text': return 'ghost'
    default: return 'secondary'
  }
}

/** 从表单值中解析字段值 */
function resolveFieldValue(fieldRef: string | undefined, formValues: Record<string, any>): string {
  if (!fieldRef || typeof fieldRef !== 'string') return ''
  if (fieldRef.startsWith('$form.')) {
    const fieldName = fieldRef.slice(6)
    const value = formValues[fieldName]
    return value != null ? String(value) : ''
  }
  return fieldRef
}

export function FeedbackButton(props: FeedbackButtonProps) {
  const {
    text = '一键反馈',
    type = 'default',
    block,
    feedbackType,
    businessNoField,
    otherCodesField,
    titleField,
    descriptionField,
  } = props

  const { getFormValues } = useFormAction()

  const onClick = () => {
    const formValues = getFormValues?.() || {}

    // 构建 URL 参数
    const params = new URLSearchParams()

    if (feedbackType) {
      params.set('type', feedbackType)
    }

    const businessNo = resolveFieldValue(businessNoField, formValues)
    if (businessNo) {
      params.set('business_no', businessNo)
    }

    const otherCodes = resolveFieldValue(otherCodesField, formValues)
    if (otherCodes) {
      params.set('other_codes', otherCodes)
    }

    const title = resolveFieldValue(titleField, formValues)
    if (title) {
      params.set('title', title)
    }

    const description = resolveFieldValue(descriptionField, formValues)
    if (description) {
      params.set('description', description)
    }

    // 构建目标 URL - 跳转到 Agent 的反馈页面
    // Agent 端需要支持接收这些 URL 参数
    const targetUrl = `/agent/feedback?${params.toString()}`

    // 使用 Android WebView 的方式通知 Agent 打开反馈页
    // 1. 优先使用 Android Interface（如果可用）
    if (typeof (window as any).AndroidBridge !== 'undefined') {
      try {
        (window as any).AndroidBridge.openFeedback(params.toString())
        return
      } catch (e) {
        console.warn('AndroidBridge.openFeedback failed:', e)
      }
    }

    // 2. 备用方案：使用特殊的 URL Scheme
    window.location.href = `appmanager://feedback?${params.toString()}`
  }

  return (
    <Button
      variant={getVariant(type)}
      className={block ? 'w-full' : ''}
      type="button"
      onClick={onClick}
    >
      <MessageSquareText className="mr-2 h-4 w-4" />
      {text}
    </Button>
  )
}
