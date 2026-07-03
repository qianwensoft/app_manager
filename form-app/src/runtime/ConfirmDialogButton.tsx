/**
 * 运行时确认弹窗按钮组件（Formily 自定义组件）。
 * 由布局设计器拖入，点击后显示确认弹窗，用户确认后触发配置的动作。
 *
 * 支持的动作类型：
 * - event: 触发事件系统中的按钮事件
 * - submit: 提交表单
 * - navigate: 跳转到指定页面
 * - interface: 调用接口
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { message } from '@/lib/message'
import { useFormAction } from './FormActionContext'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type OnConfirmAction = 'event' | 'submit' | 'navigate' | 'interface'

interface ConfirmDialogButtonProps {
  // 按钮外观
  text?: string
  variant?: ButtonVariant
  block?: boolean

  // 弹窗配置
  title?: string
  content?: string
  okText?: string
  cancelText?: string

  // 确认后动作
  onConfirm?: OnConfirmAction
  buttonId?: string // event 动作时使用
  targetPage?: string // navigate 动作时使用
  interfaceType?: 'internal' | 'third_party' | 'connector'
  interfaceCode?: string // interface 动作时使用
  thirdPartyEndpointId?: number
  paramMapping?: Record<string, string>
  successText?: string
}

/** 把 "key=$form.field, k2=literal" 形式的映射解析为参数对象 */
function resolveParamMapping(
  mapping: Record<string, string> | undefined,
  formValues: Record<string, any>,
): Record<string, any> {
  if (!mapping || typeof mapping !== 'object') return {}
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(mapping)) {
    if (typeof v === 'string' && v.startsWith('$form.')) {
      out[k] = formValues[v.slice(6)]
    } else {
      out[k] = v
    }
  }
  return out
}

export default function ConfirmDialogButton(props: ConfirmDialogButtonProps) {
  const {
    text = '确认操作',
    variant = 'default',
    block,
    title = '确认',
    content = '请确认是否继续执行该操作。',
    okText = '确定',
    cancelText = '取消',
    onConfirm = 'event',
    buttonId,
    targetPage,
    interfaceType = 'internal',
    interfaceCode,
    thirdPartyEndpointId,
    paramMapping,
    successText,
  } = props

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const { submit, submitting, triggerButton, navigate, callInterface, getFormValues } = useFormAction()

  const handleConfirm = async () => {
    const values = getFormValues?.() || {}

    try {
      switch (onConfirm) {
        case 'event':
          if (buttonId) {
            triggerButton?.(buttonId)
          } else {
            message.warning('未配置按钮ID')
          }
          break

        case 'submit':
          submit?.()
          break

        case 'navigate':
          if (targetPage) {
            navigate?.(targetPage, resolveParamMapping(paramMapping, values))
          } else {
            message.warning('未配置目标页面')
          }
          break

        case 'interface':
          if (!interfaceCode && !thirdPartyEndpointId) {
            message.warning('未配置接口')
            return
          }
          if (!callInterface) {
            message.info('接口调用需在运行时环境内执行')
            return
          }
          setLoading(true)
          try {
            await callInterface(
              interfaceCode || '',
              resolveParamMapping(paramMapping, values),
              interfaceType,
              thirdPartyEndpointId,
            )
            if (successText) message.success(successText)
          } catch (e: any) {
            message.error(e?.message || '接口调用失败')
          } finally {
            setLoading(false)
          }
          break
      }

      setOpen(false)
    } catch (e: any) {
      message.error(e?.message || '操作失败')
    }
  }

  const isLoading = loading || (onConfirm === 'submit' && submitting)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          className={block ? 'w-full' : ''}
          type="button"
        >
          {text}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{content}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {okText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
