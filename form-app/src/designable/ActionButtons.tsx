import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

/** 设计态共用的按钮文本/类型属性（中文标签由 designerLocales 处理） */
const commonButtonProps: Record<string, any> = {
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
      { label: '默认(default)', value: 'default' },
      { label: '次要(secondary)', value: 'secondary' },
      { label: '轮廓(outline)', value: 'outline' },
      { label: '幽灵(ghost)', value: 'ghost' },
      { label: '链接(link)', value: 'link' },
      { label: '危险(destructive)', value: 'destructive' },
    ],
  },
  block: {
    type: 'boolean',
    title: '撑满整行',
    'x-decorator': 'FormItem',
    'x-component': 'Switch',
  },
}

// ── 通用动作按钮 ──────────────────────────────────────────────────────

export const ActionButton: DnFC<any> = (props) => {
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

ActionButton.Behavior = createBehavior({
  name: 'ActionButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'ActionButton',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            ...commonButtonProps,
            action: {
              type: 'string',
              title: '动作类型',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: '提交表单', value: 'submit' },
                { label: '触发事件', value: 'event' },
                { label: '跳转页面', value: 'navigate' },
                { label: '调用接口', value: 'interface' },
              ],
            },
            buttonId: {
              type: 'string',
              title: '事件按钮ID（action=触发事件）',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.action'],
                fulfill: { state: { visible: '{{$deps[0] === "event"}}' } },
              },
            },
            targetPage: {
              type: 'string',
              title: '目标页面 key（action=跳转）',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.action'],
                fulfill: { state: { visible: '{{$deps[0] === "navigate"}}' } },
              },
            },
            interfaceType: {
              type: 'string',
              title: '接口类型（action=调用接口）',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: '内部接口', value: 'internal' },
                { label: '第三方接口', value: 'third_party' },
                { label: '连接器接口', value: 'connector' },
              ],
              'x-reactions': {
                dependencies: ['.action'],
                fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
              },
            },
            interfaceCode: {
              type: 'string',
              title: '接口编码（action=调用接口）',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.action'],
                fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
              },
            },
            successText: {
              type: 'string',
              title: '调用成功提示（可选）',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.action'],
                fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
              },
            },
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': { title: '动作按钮' },
    'en-US': { title: 'ActionButton' },
  },
})

ActionButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '动作按钮',
        'x-component': 'ActionButton',
        'x-component-props': {
          text: '提交',
          type: 'primary',
          block: true,
          action: 'submit',
        },
      },
    },
  ],
})

// ── 事件触发按钮 ──────────────────────────────────────────────────────

export const EventButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  return (
    <Button
      variant={p.variant || 'default'}
      className={p.block ? 'w-full' : ''}
      type="button"
    >
      {p.text || '触发事件'}
    </Button>
  )
}

EventButton.Behavior = createBehavior({
  name: 'EventButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'EventButton',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            ...commonButtonProps,
            buttonId: {
              type: 'string',
              title: '事件按钮ID',
              description: '匹配「事件系统」中 source=按钮、按钮ID 相同的事件链',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': { title: '事件触发按钮' },
    'en-US': { title: 'EventButton' },
  },
})

EventButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '事件触发按钮',
        'x-component': 'EventButton',
        'x-component-props': {
          text: '触发事件',
          type: 'default',
          buttonId: '',
        },
      },
    },
  ],
})

// ── 跳转按钮 ──────────────────────────────────────────────────────────

export const NavigateButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  return (
    <Button
      variant={p.variant || 'default'}
      className={p.block ? 'w-full' : ''}
      type="button"
    >
      {p.text || '跳转'}
    </Button>
  )
}

NavigateButton.Behavior = createBehavior({
  name: 'NavigateButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'NavigateButton',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            ...commonButtonProps,
            targetPage: {
              type: 'string',
              title: '目标页面 key',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': { title: '跳转按钮' },
    'en-US': { title: 'NavigateButton' },
  },
})

NavigateButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '跳转按钮',
        'x-component': 'NavigateButton',
        'x-component-props': {
          text: '跳转',
          type: 'default',
          targetPage: '',
        },
      },
    },
  ],
})
