import { useEffect, useState } from 'react'
import { Table, Input, Button, message } from 'antd'

type FieldDef = {
  field: string
  label: string
}

type QueryCondition = {
  field: string
  label: string
  component: string
}

type ListRendererProps = {
  fields: FieldDef[]
  queryConditions?: QueryCondition[]
  onQuery: (params: Record<string, any>) => Promise<{ data: any[]; total: number }>
  onRowClick?: (row: any) => void
  pageSize?: number
}

export default function ListRenderer({ fields, queryConditions = [], onQuery, onRowClick, pageSize = 10 }: ListRendererProps) {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [queryParams, setQueryParams] = useState<Record<string, any>>({})

  const loadData = async (p: number = page) => {
    setLoading(true)
    try {
      const res = await onQuery({ ...queryParams, page: p, page_size: pageSize })
      setData(res.data || [])
      setTotal(res.total || 0)
    } catch (e: any) {
      message.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(1)
  }, [])

  const handleSearch = () => {
    setPage(1)
    loadData(1)
  }

  const columns = fields.map(f => ({
    title: f.label,
    dataIndex: f.field,
    key: f.field,
  }))

  return (
    <div style={{ padding: 24 }}>
      {queryConditions.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          {queryConditions.map(cond => (
            <Input
              key={cond.field}
              placeholder={cond.label}
              value={queryParams[cond.field] || ''}
              onChange={e => setQueryParams(prev => ({ ...prev, [cond.field]: e.target.value }))}
              style={{ width: 200 }}
            />
          ))}
          <Button type="primary" onClick={handleSearch}>查询</Button>
        </div>
      )}
      <Table
        dataSource={data}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: p => {
            setPage(p)
            loadData(p)
          },
        }}
        onRow={record => ({
          onClick: () => onRowClick?.(record),
          style: { cursor: onRowClick ? 'pointer' : 'default' },
        })}
      />
    </div>
  )
}
