import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

/** 创建 void field schema（与标准 Formily 组件一致） */
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

/** 设计态共用的按钮文本/类型属性 */
const commonButtonProps = {
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
    propsSchema: createVoidFieldSchema({
      type: 'object',
      properties: {
        ...commonButtonProps,
        action: {
          type: 'string',
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
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-reactions': {
            dependencies: ['.action'],
            fulfill: { state: { visible: '{{$deps[0] === "event"}}' } },
          },
        },
        targetPage: {
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-reactions': {
            dependencies: ['.action'],
            fulfill: { state: { visible: '{{$deps[0] === "navigate"}}' } },
          },
        },
        interfaceType: {
          type: 'string',
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
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-reactions': {
            dependencies: ['.action'],
            fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
          },
        },
        successText: {
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-reactions': {
            dependencies: ['.action'],
            fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
          },
        },
      },
    }),
  },
  designerLocales: {
    'zh-CN': {
      title: '动作按钮',
      settings: {
        'x-component-props': '按钮属性',
        'x-component-props.text': '按钮文本',
        'x-component-props.variant': '按钮样式',
        'x-component-props.block': '撑满整行',
        'x-component-props.action': '动作类型',
        'x-component-props.buttonId': '事件按钮ID',
        'x-component-props.targetPage': '目标页面key',
        'x-component-props.interfaceType': '接口类型',
        'x-component-props.interfaceCode': '接口编码',
        'x-component-props.successText': '成功提示',
      },
    },
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
    propsSchema: createVoidFieldSchema({
      type: 'object',
      properties: {
        ...commonButtonProps,
        buttonId: {
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
      },
    }),
  },
  designerLocales: {
    'zh-CN': {
      title: '事件触发按钮',
      settings: {
        'x-component-props': '按钮属性',
        'x-component-props.text': '按钮文本',
        'x-component-props.variant': '按钮样式',
        'x-component-props.block': '撑满整行',
        'x-component-props.buttonId': '事件按钮ID',
      },
    },
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
    propsSchema: createVoidFieldSchema({
      type: 'object',
      properties: {
        ...commonButtonProps,
        targetPage: {
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
      },
    }),
  },
  designerLocales: {
    'zh-CN': {
      title: '跳转按钮',
      settings: {
        'x-component-props': '按钮属性',
        'x-component-props.text': '按钮文本',
        'x-component-props.variant': '按钮样式',
        'x-component-props.block': '撑满整行',
        'x-component-props.targetPage': '目标页面key',
      },
    },
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
