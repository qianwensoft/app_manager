/**
 * 运行时通用按钮组件（Formily 自定义组件），由布局设计器拖入。
 *
 * - ActionButton：可配置动作 = 提交表单 / 触发事件 / 跳转页面 / 调用接口
 * - EventButton：  仅触发「事件系统」中 source=button、按钮ID 匹配的事件链
 * - NavigateButton：仅跳转到指定页面
 *
 * 三者均通过 FormActionContext 拿到运行时能力（submit / triggerButton /
 * navigate / callInterface / getFormValues）。
 */
import { useState } from 'react'
import { Button, message } from 'antd'
import { useFormAction } from './FormActionContext'

type ButtonType = 'primary' | 'default' | 'dashed' | 'link' | 'text'
type ActionKind = 'submit' | 'event' | 'navigate' | 'interface'

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

// ── 通用动作按钮 ──────────────────────────────────────────────────────

interface ActionButtonProps {
  text?: string
  type?: ButtonType
  block?: boolean
  /** 动作类型 */
  action?: ActionKind
  /** action=event 时触发的按钮事件 ID */
  buttonId?: string
  /** action=navigate 时的目标页面 key */
  targetPage?: string
  /** action=interface 时调用的接口配置 */
  interfaceType?: 'internal' | 'third_party' | 'connector'
  interfaceCode?: string
  thirdPartyEndpointId?: number
  /** 跳转 / 接口调用的参数映射（值以 $form. 前缀引用表单字段） */
  paramMapping?: Record<string, string>
  /** 接口调用成功后的提示文案（留空不提示） */
  successText?: string
}

export function ActionButton(props: ActionButtonProps) {
  const {
    text = '按钮',
    type = 'default',
    block,
    action = 'submit',
    buttonId,
    targetPage,
    interfaceType = 'internal',
    interfaceCode,
    thirdPartyEndpointId,
    paramMapping,
    successText,
  } = props
  const { submit, submitting, triggerButton, navigate, callInterface, getFormValues } = useFormAction()
  const [loading, setLoading] = useState(false)

  const onClick = async () => {
    const values = getFormValues?.() || {}
    switch (action) {
      case 'submit':
        submit?.()
        break
      case 'event':
        if (buttonId) triggerButton?.(buttonId)
        break
      case 'navigate':
        if (targetPage) navigate?.(targetPage, resolveParamMapping(paramMapping, values))
        break
      case 'interface':
        if (!interfaceCode && !thirdPartyEndpointId) return
        if (!callInterface) { message.info('接口调用需在运行时环境内执行'); return }
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
  }

  return (
    <Button
      type={type}
      block={block}
      htmlType="button"
      loading={action === 'submit' ? submitting : loading}
      onClick={onClick}
    >
      {text}
    </Button>
  )
}

// ── 事件触发按钮 ──────────────────────────────────────────────────────

interface EventButtonProps {
  text?: string
  type?: ButtonType
  block?: boolean
  buttonId?: string
}

export function EventButton(props: EventButtonProps) {
  const { text = '触发事件', type = 'default', block, buttonId } = props
  const { triggerButton } = useFormAction()
  return (
    <Button
      type={type}
      block={block}
      htmlType="button"
      onClick={() => { if (buttonId) triggerButton?.(buttonId) }}
    >
      {text}
    </Button>
  )
}

// ── 跳转按钮 ──────────────────────────────────────────────────────────

interface NavigateButtonProps {
  text?: string
  type?: ButtonType
  block?: boolean
  targetPage?: string
  paramMapping?: Record<string, string>
}

export function NavigateButton(props: NavigateButtonProps) {
  const { text = '跳转', type = 'default', block, targetPage, paramMapping } = props
  const { navigate, getFormValues } = useFormAction()
  return (
    <Button
      type={type}
      block={block}
      htmlType="button"
      onClick={() => {
        if (targetPage) navigate?.(targetPage, resolveParamMapping(paramMapping, getFormValues?.() || {}))
      }}
    >
      {text}
    </Button>
  )
}
