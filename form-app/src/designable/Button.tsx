/**
 * 通用按钮组件 — 设计态
 * 提供完整的属性配置面板，支持在右侧直接编辑按钮文本、样式、事件绑定等。
 */
import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

export const CustomButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  return (
    <Button
      variant={p.variant || 'default'}
      className={p.block ? 'w-full' : ''}
      type="button"
    >
      {p.text || '按钮'}
    </Button>
  )
}

// 按钮组件属性 schema
const ButtonComponentSchema = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
    },
    variant: {
      type: 'string',
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
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
    },
    buttonId: {
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
    },
  },
}

// 创建 void field schema（参考 @designable/formily-antd 的实现）
const createVoidFieldSchema = (component: any) => {
  return {
    type: 'object',
    properties: {
      'field-group': {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: {
          name: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          title: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          description: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input.TextArea',
          },
        },
      },
      'component-group': component && {
        type: 'void',
        'x-component': 'CollapseItem',
        properties: {
          'x-component-props': component,
        },
      },
    },
  }
}

CustomButton.Behavior = createBehavior({
  name: 'CustomButton',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'CustomButton',
  designerProps: {
    droppable: false,
    propsSchema: createVoidFieldSchema(ButtonComponentSchema),
  },
  designerLocales: {
    'zh-CN': {
      title: '通用按钮',
      settings: {
        'x-component-props': '按钮属性',
        'x-component-props.text': '按钮文本',
        'x-component-props.variant': '按钮样式',
        'x-component-props.block': '撑满整行',
        'x-component-props.buttonId': '按钮ID',
      },
    },
    'en-US': { title: 'Button' },
  },
})

CustomButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '按钮',
        'x-component': 'CustomButton',
        'x-component-props': {
          text: '按钮',
          variant: 'default',
          block: false,
          buttonId: '',
        },
      },
    },
  ],
})
