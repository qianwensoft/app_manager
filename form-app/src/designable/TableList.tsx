import React from 'react'
import { Table } from 'antd'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

export const TableList: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  const columns = (p.columns || []).map((col: any) => ({
    title: col.title || col.dataIndex,
    dataIndex: col.dataIndex || col.key,
    key: col.key || col.dataIndex,
  }))

  return (
    <div style={{ border: '1px dashed #d9d9d9', padding: 12, borderRadius: 6 }}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
        Table — 查询接口: {p.interface_code || '(从页面配置读取)'} | 列数: {columns.length}
      </div>
      <Table
        size="small"
        columns={columns.length > 0 ? columns : [{ title: '列1', dataIndex: 'col1', key: 'col1' }]}
        dataSource={[]}
        pagination={{ simple: true, pageSize: 10, total: 0 }}
      />
    </div>
  )
}

TableList.Behavior = createBehavior({
  name: 'Table',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'Table',
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
          },
        },
      },
    },
  },
  designerLocales: {
    'zh-CN': { title: '表格' },
    'en-US': { title: 'Table' },
  },
})

TableList.Resource = createResource({
  icon: 'ArrayTableSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        title: '表格',
        'x-component': 'Table',
        'x-component-props': {
          columns: [],
        },
      },
    },
  ],
})
