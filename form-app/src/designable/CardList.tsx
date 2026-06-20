import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    <div className="border border-dashed rounded-md p-3">
      <div className="text-xs text-muted-foreground mb-2">
        CardList — 接口: {p.interface_code || '(未配置)'} | 每页: {p.page_size || 10}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {DEMO_ITEMS.map(item => (
          <Card key={item.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{item[title as keyof typeof item] ?? item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {item[desc as keyof typeof item] ?? item.desc}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="text-right mt-2">
        <div className="inline-flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>上一页</Button>
          <span className="text-sm text-muted-foreground">1 / 2</span>
          <Button variant="outline" size="sm">下一页</Button>
        </div>
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
