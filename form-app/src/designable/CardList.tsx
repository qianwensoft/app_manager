import React, { useEffect, useState } from 'react'
import { Card, Pagination, Empty, Spin } from 'antd'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

const DEMO_ITEMS = [
  { id: 1, title: '示例卡片 1', desc: '字段值预览' },
  { id: 2, title: '示例卡片 2', desc: '字段值预览' },
]

export const CardList: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  const title = p.title_field || 'title'
  const desc = p.desc_field || 'desc'

  return (
    <div style={{ border: '1px dashed #d9d9d9', borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
        CardList — 接口: {p.interface_code || '(未配置)'} | 每页: {p.page_size || 10}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {DEMO_ITEMS.map(item => (
          <Card key={item.id} size="small" title={item[title as keyof typeof item] ?? item.title}>
            <div style={{ fontSize: 13, color: '#666' }}>{item[desc as keyof typeof item] ?? item.desc}</div>
          </Card>
        ))}
      </div>
      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <Pagination simple current={1} total={20} pageSize={p.page_size || 10} />
      </div>
    </div>
  )
}

CardList.Behavior = createBehavior({
  name: 'CardList',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'CardList',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            interface_code: {
              type: 'string',
              title: '查询接口编码',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            page_size: {
              type: 'number',
              title: '每页条数',
              default: 10,
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
            },
            title_field: {
              type: 'string',
              title: '卡片标题字段',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            desc_field: {
              type: 'string',
              title: '卡片描述字段',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            image_field: {
              type: 'string',
              title: '图片字段',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            extra_fields: {
              type: 'string',
              title: '额外显示字段（逗号分隔）',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            grid_cols: {
              type: 'number',
              title: '列数（0=自适应）',
              default: 0,
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
            },
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': { title: '卡片列表' },
    'en-US': { title: 'CardList' },
  },
})

CardList.Resource = createResource({
  icon: 'CardSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '卡片列表',
        'x-component': 'CardList',
        'x-component-props': {
          interface_code: '',
          page_size: 10,
          title_field: 'name',
          desc_field: 'description',
          image_field: '',
          extra_fields: '',
          grid_cols: 0,
        },
      },
    },
  ],
})
