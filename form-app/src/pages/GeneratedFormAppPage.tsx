import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

async function authed(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
  return data
}

export default function GeneratedFormAppPage() {
  const navigate = useNavigate()
  const { code = 'demo', pageType = 'form' } = useParams()
  const [search] = useSearchParams()
  const [runtimeSchema, setRuntimeSchema] = useState<any>(null)
  const listCode = runtimeSchema?.pages?.list?.interface_code || search.get('list_if') || ''
  const detailCode = runtimeSchema?.pages?.detail?.interface_code || search.get('detail_if') || ''
  const submitCode = runtimeSchema?.pages?.form?.submit_interface_code || search.get('submit_if') || ''
  const editorId = search.get('editor_id') || ''

  const [rows, setRows] = useState<Array<Record<string, any>>>([])
  const [detail, setDetail] = useState<Record<string, any> | null>(null)
  const [detailID, setDetailID] = useState('')
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  const [remark, setRemark] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<Array<{ id: string; field: string; operator: string; value: string }>>([
    { id: 'f1', field: 'name', operator: 'contains', value: '' },
  ])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await authed(`/api/form-app/infos/code/${encodeURIComponent(code)}`, 'GET')
        const info = res?.data
        const runtime = info?.runtime_schema ? JSON.parse(info.runtime_schema) : null
        if (runtime) {
          setRuntimeSchema(runtime)
          const defaults = runtime?.pages?.list?.query_conditions
          if (Array.isArray(defaults) && defaults.length) {
            setFilters(defaults.map((x: any, idx: number) => ({
              id: `rf-${idx}-${Date.now()}`,
              field: String(x.field || ''),
              operator: String(x.operator || 'contains'),
              value: String(x.value || ''),
            })))
          }
          const dps = Number(runtime?.pages?.list?.pagination?.defaultPageSize || 10)
          if (dps > 0) setPageSize(dps)
        }
      } catch {
        setRuntimeSchema(null)
      }
    })()
  }, [code])

  const modeTitle = useMemo(() => {
    if (pageType === 'list') return '列表页'
    if (pageType === 'detail') return '详情页'
    return '表单页'
  }, [pageType])

  const queryList = async (targetPage = page, targetSize = pageSize) => {
    if (!listCode) return
    setError('')
    try {
      const offset = (targetPage - 1) * targetSize
      const res = await authed('/api/form-app/runtime/query', 'POST', {
        interface_code: listCode,
        form_code: code,
        page_type: 'list',
        param_values: {
          page: targetPage,
          page_size: targetSize,
          limit: targetSize,
          offset,
          ...(runtimeSchema?.datasource?.source_query_params || {}),
        },
        query_filters: filters
          .filter(f => f.field.trim() && f.operator.trim() && f.value.trim() !== '')
          .map(f => ({ field: f.field.trim(), operator: f.operator.trim(), value: f.value })),
      })
      const nextRows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res?.data) ? res.data : []
      setRows(nextRows)
      setPage(targetPage)
      setPageSize(targetSize)
      setTotal(nextRows.length ? Number(nextRows[0]?.total_count || 0) : 0)
      setResult(JSON.stringify(res, null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : '列表查询失败')
    }
  }

  const queryDetail = async (idVal = detailID) => {
    if (!detailCode) return
    setError('')
    try {
      const res = await authed('/api/form-app/runtime/query', 'POST', {
        interface_code: detailCode,
        param_values: { id: idVal },
      })
      const obj = (res?.data && !Array.isArray(res.data)) ? res.data : null
      setDetail(obj)
      setResult(JSON.stringify(res, null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : '详情查询失败')
    }
  }

  const submit = async (evt: FormEvent) => {
    evt.preventDefault()
    if (!submitCode) return
    setError('')
    try {
      const res = await authed('/api/form-app/runtime/submit', 'POST', {
        interface_code: submitCode,
        param_values: { name, dept, remark },
      })
      const recordId = String(res?.record_id || res?.last_insert_id || '')
      setResult(JSON.stringify(res, null, 2))
      setName('')
      setDept('')
      setRemark('')
      if (recordId) {
        const q = new URLSearchParams(search)
        navigate(`/generated/${encodeURIComponent(code)}/detail?${q.toString()}`)
        setDetailID(recordId)
        setTimeout(() => queryDetail(recordId), 100)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>{code} · {modeTitle}</h1>
        <p>生成页面：表单页 / 列表页 / 详情页</p>
        <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
          <Link className="card" to={`/generated/${encodeURIComponent(code)}/form?${search.toString()}`} style={{ padding: '8px 12px' }}>表单页</Link>
          <Link className="card" to={`/generated/${encodeURIComponent(code)}/list?${search.toString()}`} style={{ padding: '8px 12px' }}>列表页</Link>
          <Link className="card" to={`/generated/${encodeURIComponent(code)}/detail?${search.toString()}`} style={{ padding: '8px 12px' }}>详情页</Link>
          {!!editorId && <Link className="card" to={`/editor/${editorId}`} style={{ padding: '8px 12px' }}>返回表单配置</Link>}
        </div>
      </header>

      {pageType === 'form' && (
        <form className="panel preview-form" onSubmit={submit}>
          <div className="row"><label>姓名</label><input value={name} onChange={e => setName(e.target.value)} required /></div>
          <div className="row"><label>部门</label><input value={dept} onChange={e => setDept(e.target.value)} /></div>
          <div className="row"><label>备注</label><textarea value={remark} onChange={e => setRemark(e.target.value)} /></div>
          <div className="actions"><button type="submit">提交并进入详情</button></div>
        </form>
      )}

      {pageType === 'list' && (
        <div className="panel">
          <div style={{ marginBottom: 12, border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
            <strong>多条件查询</strong>
            {filters.map((f, idx) => (
              <div key={f.id} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={f.field}
                  onChange={e => setFilters(rows => rows.map(r => (r.id === f.id ? { ...r, field: e.target.value } : r)))}
                  placeholder="字段，如 name/dept"
                />
                <select
                  value={f.operator}
                  onChange={e => setFilters(rows => rows.map(r => (r.id === f.id ? { ...r, operator: e.target.value } : r)))}
                >
                  <option value="contains">包含</option>
                  <option value="starts_with">以开始</option>
                  <option value="ends_with">以结束</option>
                  <option value="eq">等于</option>
                  <option value="gt">大于</option>
                  <option value="lt">小于</option>
                </select>
                <input
                  value={f.value}
                  onChange={e => setFilters(rows => rows.map(r => (r.id === f.id ? { ...r, value: e.target.value } : r)))}
                  placeholder="过滤值"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (filters.length <= 1) return
                    setFilters(rows => rows.filter(r => r.id !== f.id))
                  }}
                >
                  删除
                </button>
                {idx === filters.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setFilters(rows => [...rows, { id: `f${Date.now()}`, field: '', operator: 'contains', value: '' }])}
                  >
                    新增条件
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={() => queryList(1, pageSize)}>查询列表</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => queryList(page - 1, pageSize)} disabled={page <= 1}>上一页</button>
              <button type="button" onClick={() => queryList(page + 1, pageSize)} disabled={page >= Math.max(1, Math.ceil(total / pageSize))}>下一页</button>
              <select value={String(pageSize)} onChange={e => queryList(1, Number(e.target.value))}>
                <option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页，共 {total} 条</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', padding: 8 }}>ID</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', padding: 8 }}>姓名</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', padding: 8 }}>部门</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={String(r.id ?? Math.random())}>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{String(r.id ?? '')}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{String(r.name ?? '')}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{String(r.dept ?? '')}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const q = new URLSearchParams(search)
                        q.set('detail_id', String(r.id ?? ''))
                        navigate(`/generated/${encodeURIComponent(code)}/detail?${q.toString()}`)
                      }}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageType === 'detail' && (
        <div className="panel">
          <div className="row">
            <label>记录ID</label>
            <input value={detailID || search.get('detail_id') || ''} onChange={e => setDetailID(e.target.value)} placeholder="输入ID后查询详情" />
          </div>
          <div className="actions">
            <button type="button" onClick={() => queryDetail(detailID || search.get('detail_id') || '')}>查询详情</button>
          </div>
          <pre className="result-box">{detail ? JSON.stringify(detail, null, 2) : '暂无详情数据'}</pre>
        </div>
      )}

      {error && <div className="panel error-text">{error}</div>}
      <div className="panel">
        <pre className="result-box">{result || '暂无返回'}</pre>
      </div>
    </div>
  )
}

