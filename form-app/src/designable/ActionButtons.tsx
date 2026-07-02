import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

/** 生成唯一按钮 ID */
const generateButtonId = (prefix: string) => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 5)
  return `${prefix}_${timestamp}_${random}`
}

/** 创建扁平 propsSchema（参考 LayoutComponents，避免 CollapseItem 未注册问题） */
const createButtonPropsSchema = (componentProps: any) => {
  return {
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
      'x-component-props': {
        type: 'object',
        properties: componentProps,
      },
    },
  }
}

/** 设计态共用的按钮文本/类型属性 */
const commonButtonProps = {
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
    droppable: false,
    propsSchema: createButtonPropsSchema({
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
        title: '按钮ID',
        description: '用于事件编排中匹配按钮触发源',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        'x-reactions': {
          dependencies: ['.action'],
          fulfill: { state: { visible: '{{$deps[0] === "event"}}' } },
        },
      },
      targetPage: {
        type: 'string',
        title: '目标页面',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        'x-reactions': {
          dependencies: ['.action'],
          fulfill: { state: { visible: '{{$deps[0] === "navigate"}}' } },
        },
      },
      interfaceType: {
        type: 'string',
        title: '接口类型',
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
        title: '接口编码',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        'x-reactions': {
          dependencies: ['.action'],
          fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
        },
      },
      successText: {
        type: 'string',
        title: '成功提示',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        'x-reactions': {
          dependencies: ['.action'],
          fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
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
          buttonId: generateButtonId('action'),
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
    droppable: false,
    propsSchema: createButtonPropsSchema({
      ...commonButtonProps,
      buttonId: {
        type: 'string',
        title: '按钮ID',
        description: '用于事件编排中匹配按钮触发源',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
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
          buttonId: generateButtonId('event'),
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
    droppable: false,
    propsSchema: createButtonPropsSchema({
      ...commonButtonProps,
      targetPage: {
        type: 'string',
        title: '目标页面',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
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

// ── 一键反馈按钮 ──────────────────────────────────────────────────────

export const FeedbackButton: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  return (
    <Button
      variant={p.variant || 'default'}
      className={p.block ? 'w-full' : ''}
      type="button"
    >
      {p.text || '一键反馈'}
    </Button>
  )
}

FeedbackButton.Behavior = createBehavior({
  name: 'FeedbackButton',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'FeedbackButton',
  designerProps: {
    droppable: false,
    propsSchema: createButtonPropsSchema({
      ...commonButtonProps,
      feedbackType: {
        type: 'string',
        title: '反馈类型',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
      businessNoField: {
        type: 'string',
        title: '业务单号字段',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
      otherCodesField: {
        type: 'string',
        title: '其他编码字段',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
      titleField: {
        type: 'string',
        title: '标题字段',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
      descriptionField: {
        type: 'string',
        title: '描述字段',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
      },
    }),
  },
  designerLocales: {
    'zh-CN': {
      title: '一键反馈按钮',
      settings: {
        'x-component-props': '按钮属性',
        'x-component-props.text': '按钮文本',
        'x-component-props.variant': '按钮样式',
        'x-component-props.block': '撑满整行',
        'x-component-props.feedbackType': '反馈类型code',
        'x-component-props.businessNoField': '业务单号字段（$form.xxx）',
        'x-component-props.otherCodesField': '其他编码字段（$form.xxx）',
        'x-component-props.titleField': '标题字段（$form.xxx）',
        'x-component-props.descriptionField': '描述字段（$form.xxx）',
      },
    },
    'en-US': { title: 'FeedbackButton' },
  },
})

FeedbackButton.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '一键反馈按钮',
        'x-component': 'FeedbackButton',
        'x-component-props': {
          text: '一键反馈',
          type: 'default',
          feedbackType: '',
          businessNoField: '',
          otherCodesField: '',
          titleField: '',
          descriptionField: '',
        },
      },
    },
  ],
})

