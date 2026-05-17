import React from 'react'
import { Button } from 'antd'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

export const SubmitButton: DnFC<any> = (props) => {
  const text = props?.text || props?.children || '提交'
  return (
    <Button type="primary" htmlType="button">
      {text}
    </Button>
  )
}

SubmitButton.Behavior = createBehavior({
  name: 'SubmitButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'SubmitButton',
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
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': {
      title: '提交按钮',
      settings: {
        'x-component-props.text': '按钮文本',
      },
    },
    'en-US': {
      title: 'SubmitButton',
    },
  },
})

SubmitButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '提交',
        'x-component': 'SubmitButton',
        'x-component-props': {
          text: '提交',
        },
      },
    },
  ],
})

