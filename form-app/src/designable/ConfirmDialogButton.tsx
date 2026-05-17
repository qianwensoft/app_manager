import React from 'react'
import { Button, Modal } from 'antd'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

export const ConfirmDialogButton: DnFC<any> = (props) => {
  const p = props || {}
  const text = p.text || '确认操作'
  const title = p.title || '确认'
  const content = p.content || '请确认是否继续执行该操作。'
  const okText = p.okText || '确定'
  const cancelText = p.cancelText || '取消'

  return (
    <Button
      htmlType="button"
      onClick={() =>
        Modal.confirm({
          title,
          content,
          okText,
          cancelText,
        })
      }
    >
      {text}
    </Button>
  )
}

ConfirmDialogButton.Behavior = createBehavior({
  name: 'ConfirmDialogButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'ConfirmDialogButton',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: '标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        'x-component-props': {
          type: 'object',
          title: '组件属性',
          properties: {
            text: {
              type: 'string',
              title: '按钮文本',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            title: {
              type: 'string',
              title: '弹窗标题',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            content: {
              type: 'string',
              title: '弹窗内容',
              'x-decorator': 'FormItem',
              'x-component': 'Input.TextArea',
            },
            okText: {
              type: 'string',
              title: '确认按钮文案',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            cancelText: {
              type: 'string',
              title: '取消按钮文案',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': {
      title: '消息确认弹窗',
    },
    'en-US': {
      title: 'ConfirmDialogButton',
    },
  },
})

ConfirmDialogButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '确认弹窗',
        'x-component': 'ConfirmDialogButton',
        'x-component-props': {
          text: '确认操作',
          title: '确认',
          content: '请确认是否继续执行该操作。',
          okText: '确定',
          cancelText: '取消',
        },
      },
    },
  ],
})

