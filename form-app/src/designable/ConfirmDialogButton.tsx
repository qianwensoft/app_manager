import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'
import { useNodeIdProps } from '@designable/react'

export const ConfirmDialogButton: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const p = props?.['x-component-props'] || props || {}
  const text = p.text || '确认操作'
  const variant = p.variant || 'default'

  // 设计态只渲染按钮外观，不包含弹窗逻辑（避免在编辑时触发弹窗）
  return (
    <Button
      type="button"
      variant={variant as any}
      className={p.block ? 'w-full' : ''}
      {...nodeIdProps}
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
                { label: '危险', value: 'destructive' },
                { label: '轮廓', value: 'outline' },
                { label: '次要', value: 'secondary' },
                { label: '幽灵', value: 'ghost' },
                { label: '链接', value: 'link' },
              ],
            },
            block: {
              type: 'boolean',
              title: '撑满整行',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
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
            onConfirm: {
              type: 'string',
              title: '确认后动作',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: '触发事件', value: 'event' },
                { label: '提交表单', value: 'submit' },
                { label: '跳转页面', value: 'navigate' },
                { label: '调用接口', value: 'interface' },
              ],
              'x-component-props': {
                defaultValue: 'event',
              },
            },
            buttonId: {
              type: 'string',
              title: '按钮ID',
              description: '确认后触发的事件按钮ID',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.onConfirm'],
                fulfill: { state: { visible: '{{$deps[0] === "event"}}' } },
              },
            },
            targetPage: {
              type: 'string',
              title: '目标页面',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.onConfirm'],
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
                dependencies: ['.onConfirm'],
                fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
              },
            },
            interfaceCode: {
              type: 'string',
              title: '接口编码',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.onConfirm'],
                fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
              },
            },
            successText: {
              type: 'string',
              title: '成功提示',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-reactions': {
                dependencies: ['.onConfirm'],
                fulfill: { state: { visible: '{{$deps[0] === "interface"}}' } },
              },
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

