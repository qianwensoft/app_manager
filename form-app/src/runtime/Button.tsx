/**
 * 通用按钮组件 — 运行时
 * 读取设计器配置的 buttonId，在点击时触发对应的页面事件。
 */
import { Button as ShadcnButton } from '@/components/ui/button'
import { useFormAction } from './FormActionContext'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'

interface CustomButtonProps {
  text?: string
  variant?: ButtonVariant
  block?: boolean
  buttonId?: string
}

export function CustomButton(props: CustomButtonProps) {
  const { text = '按钮', variant = 'default', block, buttonId } = props
  const { triggerButton } = useFormAction()

  const handleClick = () => {
    if (buttonId) {
      triggerButton?.(buttonId)
    }
  }

  return (
    <ShadcnButton
      variant={variant}
      className={block ? 'w-full' : ''}
      type="button"
      onClick={handleClick}
    >
      {text}
    </ShadcnButton>
  )
}
