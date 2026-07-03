/**
 * 运行时提交按钮组件（Formily 自定义组件）。
 * 由布局设计器拖入，或自动生成表单时由 fieldDefsToSchema 末尾追加。
 * 通过 x-component-props 配置：
 *   - text:  按钮文案（默认「提交」）
 *   - variant:  按钮样式
 *   - block: 是否撑满整行
 *   - buttonId: 提交成功后触发的事件按钮ID（可选）
 * 点击后调用表单级 submit()，统一走 SchemaFormRenderer 的提交逻辑（校验 + onSubmit）。
 * 提交成功后，如果配置了 buttonId，则触发对应的按钮事件流。
 */
import { Button } from '@/components/ui/button'
import { useFormSubmit } from './SubmitButtonContext'
import { useFormAction } from './FormActionContext'
import { Loader2 } from 'lucide-react'

interface SubmitButtonProps {
  text?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  block?: boolean
  buttonId?: string
}

export default function SubmitButton(props: SubmitButtonProps) {
  const { text = '提交', variant = 'default', block, buttonId } = props
  const { submit, submitting } = useFormSubmit()
  const { triggerButton } = useFormAction()

  const handleSubmit = async () => {
    if (!submit) return

    try {
      await submit()
      // 提交成功后，如果配置了 buttonId，触发对应的按钮事件
      if (buttonId) {
        triggerButton?.(buttonId)
      }
    } catch (e) {
      // 提交失败，不触发事件
      console.error('Submit failed:', e)
    }
  }

  return (
    <Button
      variant={variant}
      className={block ? 'w-full' : ''}
      type="button"
      disabled={submitting}
      onClick={handleSubmit}
    >
      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {text}
    </Button>
  )
}
