import React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'

export const TableList: DnFC<any> = (props) => {
  const p = props?.['x-component-props'] || props || {}
  const columns = (p.columns || []).map((col: any) => ({
    title: col.title || col.dataIndex,
    dataIndex: col.dataIndex || col.key,
    key: col.key || col.dataIndex,
  }))

  const displayColumns = columns.length > 0 ? columns : [{ title: '列1', dataIndex: 'col1', key: 'col1' }]

  return (
    <div className="border border-dashed p-3 rounded-md">
      <div className="text-xs text-muted-foreground mb-2">
        Table — 查询接口: {p.interface_code || '(从页面配置读取)'} | 列数: {displayColumns.length}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {displayColumns.map((col: any) => (
              <TableHead key={col.key}>{col.title}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={displayColumns.length} className="text-center text-muted-foreground">
              暂无数据
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
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
