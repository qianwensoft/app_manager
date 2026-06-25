/**
 * 字段级打印按钮组件（Formily 自定义组件）。
 * 通过 x-component-props 配置：
 *   - templateId: 绑定的打印模板 id（config_json.printers[].id）
 *   - buttonId:   可选，触发 source.kind==='button' 的页面事件链
 *   - text:       按钮文案
 * 点击后优先走绑定模板的 print；若配置了 buttonId 则同时触发对应事件。
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { message } from '@/lib/message'
import { usePrintButton } from './PrintButtonContext'
import { Loader2 } from 'lucide-react'

interface PrintButtonProps {
  templateId?: string
  buttonId?: string
  text?: string
  type?: 'primary' | 'default' | 'dashed'
  block?: boolean
}

export default function PrintButton(props: PrintButtonProps) {
  const { templateId, buttonId, text = '打印', type = 'default', block } = props
  const { print, triggerButton } = usePrintButton()
  const [loading, setLoading] = useState(false)

  const onClick = async () => {
    if (buttonId && triggerButton) {
      triggerButton(buttonId)
    }
    if (templateId) {
      if (!print) {
        message.info('打印需在 Agent 客户端内运行')
        return
      }
      setLoading(true)
      try {
        await print(templateId)
      } catch (e: any) {
        message.error(e?.message || '打印失败')
      } finally {
        setLoading(false)
      }
    }
  }

  const variant = type === 'primary' ? 'default' : type === 'dashed' ? 'outline' : 'secondary'

  return (
    <Button
      variant={variant}
      className={block ? 'w-full' : ''}
      disabled={loading}
      onClick={onClick}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {text}
    </Button>
  )
}
