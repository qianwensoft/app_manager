import React from 'react'
import { Button } from '@/components/ui/button'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'
import { useNodeIdProps } from '@designable/react'

export const ScanTrigger: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const p = props?.['x-component-props'] || props || {}
  return (
    <Button variant="outline" {...nodeIdProps}>
      <span className="mr-2">📷</span>
      {p.text || '扫码'}
    </Button>
  )
}

ScanTrigger.Behavior = createBehavior({
  name: 'ScanTrigger',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'ScanTrigger',
  designerProps: {
    draggable: true,
    droppable: false,
    selectable: true,
    selfRenderChildren: false,
    inlineChildrenLayout: true,
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              title: '按钮文本',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            fill_field: {
              type: 'string',
              title: '扫码值写入字段',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            interface_code: {
              type: 'string',
              title: '触发接口编码',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            scan_param: {
              type: 'string',
              title: '扫码参数名（默认 code）',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            result_field: {
              type: 'string',
              title: '接口结果写入字段',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': { title: '扫码触发' },
    'en-US': { title: 'ScanTrigger' },
  },
})

ScanTrigger.Resource = createResource({
  icon: 'TextSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '扫码触发',
        'x-component': 'ScanTrigger',
        'x-component-props': {
          text: '扫码',
          fill_field: '',
          interface_code: '',
          scan_param: 'code',
          result_field: '',
        },
      },
    },
  ],
})
