import { useEffect, useState } from 'react'
import { Table, Input, Button, message, Select } from 'antd'
import type { FieldBinding, FieldDef, FieldOption, QueryCondition } from './types'
import { bindingsTriggeredBy, buildBindingParamValues, rowsToOptions } from './fieldLogic'

type ListRendererProps = {
  fields: FieldDef[]
  queryConditions?: QueryCondition[]
  bindings?: FieldBinding[]
  onQuery: (params: Record<string, any>) => Promise<{ data: any[]; total: number }>
  onRowClick?: (row: any) => void
  onNew?: () => void
  newButtonLabel?: string
  onFetchOptions?: (interfaceCode: string, paramValues: Record<string, any>) => Promise<FieldOption[]>
  pageSize?: number
}

export default function ListRenderer({
  fields,
  queryConditions = [],
  bindings = [],
  onQuery,
  onRowClick,
  onNew,
  newButtonLabel = '新增',
  onFetchOptions,
  pageSize = 10,
}: ListRendererProps) {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [queryParams, setQueryParams] = useState<Record<string, any>>({})
  const [condOptions, setCondOptions] = useState<Record<string, FieldOption[]>>({})

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

  const reloadCondOptions = async (cond: QueryCondition) => {
    if (!onFetchOptions || !cond.options_interface_code) return
    const params: Record<string, any> = {}
    for (const t of cond.listen_targets || []) {
      if (queryParams[t] !== undefined) params[t] = queryParams[t]
    }
    const opts = await onFetchOptions(cond.options_interface_code, params)
    setCondOptions(prev => ({ ...prev, [cond.field]: opts }))
  }

  const handleCondChange = async (field: string, value: any) => {
    setQueryParams(prev => ({ ...prev, [field]: value }))

    const triggeredBindings = bindingsTriggeredBy(bindings, field)
    for (const b of triggeredBindings) {
      if (!onFetchOptions || !b.query_interface_code) continue
      try {
        const params = buildBindingParamValues(b, { ...queryParams, [field]: value })
        const opts = await onFetchOptions(b.query_interface_code, params)
        setCondOptions(prev => ({ ...prev, [b.field]: opts }))
        setQueryParams(prev => ({ ...prev, [b.field]: undefined }))
      } catch { /* ignore */ }
    }

    for (const cond of queryConditions) {
      if ((cond.listen_targets || []).includes(field)) {
        try {
          await reloadCondOptions(cond)
          setQueryParams(prev => ({ ...prev, [cond.field]: undefined }))
        } catch { /* ignore */ }
      }
    }
  }

  const handleSearch = () => {
    setPage(1)
    loadData(1)
  }

  const columns = fields.map(f => ({
    title: f.label,
    dataIndex: f.field,
    key: f.field,
  }))

  const renderCondInput = (cond: QueryCondition) => {
    const opts = condOptions[cond.field]
    if (cond.component === 'Select' || opts?.length) {
      return (
        <Select
          allowClear
          placeholder={cond.label}
          value={queryParams[cond.field]}
          onChange={v => handleCondChange(cond.field, v)}
          style={{ width: 200 }}
        >
          {(opts || []).map(opt => (
            <Select.Option key={String(opt.value)} value={opt.value}>{opt.label}</Select.Option>
          ))}
        </Select>
      )
    }
    return (
      <Input
        key={cond.field}
        placeholder={cond.label}
        value={queryParams[cond.field] || ''}
        onChange={e => handleCondChange(cond.field, e.target.value)}
        style={{ width: 200 }}
      />
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {queryConditions.map(cond => (
          <div key={cond.field}>{renderCondInput(cond)}</div>
        ))}
        {queryConditions.length > 0 && (
          <Button type="primary" onClick={handleSearch}>查询</Button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {onNew && (
            <Button type="primary" onClick={onNew}>+ {newButtonLabel}</Button>
          )}
        </div>
      </div>
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
