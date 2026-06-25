import { useEffect, useState } from 'react'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { message } from '@/lib/message'
import { Loader2 } from 'lucide-react'
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
      const resultData = res.data || []
      setData(resultData)
      setTotal(res.total || 0)

      // 调试信息：如果有数据但没有列，提示用户
      if (resultData.length > 0 && fields.length === 0) {
        console.warn('ListRenderer: 数据已加载但未配置字段定义', {
          dataCount: resultData.length,
          sampleRow: resultData[0],
          availableKeys: Object.keys(resultData[0] || {})
        })
        message.warning('列表数据已加载，但未配置显示字段，请在页面编辑器中添加字段定义')
      }
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

  const renderCondInput = (cond: QueryCondition) => {
    const opts = condOptions[cond.field]
    if (cond.component === 'Select' || opts?.length) {
      return (
        <Select
          value={queryParams[cond.field] ? String(queryParams[cond.field]) : undefined}
          onValueChange={v => handleCondChange(cond.field, v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={cond.label} />
          </SelectTrigger>
          <SelectContent>
            {(opts || []).map(opt => (
              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    return (
      <Input
        key={cond.field}
        placeholder={cond.label}
        value={queryParams[cond.field] || ''}
        onChange={e => handleCondChange(cond.field, e.target.value)}
        className="w-[200px]"
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
          <Button onClick={handleSearch}>查询</Button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {onNew && (
            <Button onClick={onNew}>+ {newButtonLabel}</Button>
          )}
        </div>
      </div>

      {fields.length === 0 && !loading ? (
        <div style={{
          padding: 60,
          textAlign: 'center',
          background: '#fafafa',
          border: '1px dashed #d9d9d9',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, color: '#595959', marginBottom: 8 }}>未配置列表字段</div>
          <div style={{ fontSize: 14, color: '#8c8c8c' }}>
            请在页面编辑器中添加字段定义来显示数据列
          </div>
          {data.length > 0 && (
            <div style={{ fontSize: 12, color: '#1890ff', marginTop: 12 }}>
              已加载 {data.length} 条数据，但缺少字段配置
            </div>
          )}
        </div>
      ) : (
        <>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {fields.map(f => (
                    <TableHead key={f.field}>{f.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={fields.length} className="text-center text-muted-foreground">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row, idx) => (
                    <TableRow
                      key={row.id || idx}
                      onClick={() => onRowClick?.(row)}
                      className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                    >
                      {fields.map(f => (
                        <TableCell key={f.field}>{row[f.field] ?? '-'}</TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {total > pageSize && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => {
                  setPage(page - 1)
                  loadData(page - 1)
                }}
              >
                上一页
              </Button>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                第 {page} / {Math.ceil(total / pageSize)} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => {
                  setPage(page + 1)
                  loadData(page + 1)
                }}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
