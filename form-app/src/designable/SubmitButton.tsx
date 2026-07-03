import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'
import { useNodeIdProps } from '@designable/react'

export const SubmitButton: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const p = props?.['x-component-props'] || props || {}
  const text = p.text || props?.text || props?.children || '提交'
  return (
    <Button
      type="button"
      {...nodeIdProps}
    >
      {text}
    </Button>
  )
}

SubmitButton.Behavior = createBehavior({
  name: 'SubmitButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'SubmitButton',
  designerProps: {
    draggable: true,
    droppable: false,
    selectable: true,
    selfRenderChildren: false,
    inlineChildrenLayout: true,
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
            variant: {
              type: 'string',
              title: '按钮样式',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: '默认', value: 'default' },
                { label: '次要', value: 'secondary' },
                { label: '轮廓', value: 'outline' },
                { label: '幽灵', value: 'ghost' },
                { label: '链接', value: 'link' },
                { label: '危险', value: 'destructive' },
              ],
            },
            block: {
              type: 'boolean',
              title: '撑满整行',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            buttonId: {
              type: 'string',
              title: '按钮ID',
              description: '提交成功后可触发以此ID为源的事件流',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-component-props': {
                placeholder: '留空则不触发事件',
              },
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

