/**
 * 运行时提交按钮组件（Formily 自定义组件）。
 * 由布局设计器拖入，或自动生成表单时由 fieldDefsToSchema 末尾追加。
 * 通过 x-component-props 配置：
 *   - text:  按钮文案（默认「提交」）
 *   - type:  按钮类型
 *   - block: 是否撑满整行
 * 点击后调用表单级 submit()，统一走 SchemaFormRenderer 的提交逻辑（校验 + onSubmit）。
 */
import { Button } from '@/components/ui/button'
import { useFormSubmit } from './SubmitButtonContext'
import { Loader2 } from 'lucide-react'

interface SubmitButtonProps {
  text?: string
  type?: 'primary' | 'default' | 'dashed'
  block?: boolean
}

export default function SubmitButton(props: SubmitButtonProps) {
  const { text = '提交', type = 'primary', block } = props
  const { submit, submitting } = useFormSubmit()

  // antd type → shadcn variant 映射
  const variant = type === 'primary' ? 'default' : type === 'dashed' ? 'outline' : 'secondary'

  return (
    <Button
      variant={variant}
      className={block ? 'w-full' : ''}
      type="button"
      disabled={submitting}
      onClick={() => submit?.()}
    >
      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {text}
    </Button>
  )
}
