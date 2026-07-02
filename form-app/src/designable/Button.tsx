/**
 * 通用按钮组件 — 设计态
 * 提供完整的属性配置面板，支持在右侧直接编辑按钮文本、样式、事件绑定等。
 */
import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

/** 生成唯一按钮 ID */
const generateButtonId = () => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 5)
  return `btn_${timestamp}_${random}`
}

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
      description: '用于事件编排中匹配按钮触发源',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
    },
  },
}

CustomButton.Behavior = createBehavior({
  name: 'CustomButton',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'CustomButton',
  designerProps: {
    droppable: false,
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段名',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        'x-component-props': ButtonComponentSchema,
      },
    },
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
          buttonId: generateButtonId(),
        },
      },
    },
  ],
})
