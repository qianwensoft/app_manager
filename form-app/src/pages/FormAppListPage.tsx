import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type FormAppRow = {
  id: number
  code: string
  name: string
  description?: string
  updated_at?: string
  publish_status?: number
}

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

export default function FormAppListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<FormAppRow[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [createForm, setCreateForm] = useState({
    code: `form_${Date.now()}`,
    name: '新建表单应用',
    description: '',
  })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authed('/api/form-app/infos', 'GET')
      setRows(Array.isArray(res?.data) ? res.data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredRows = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return rows
    return rows.filter(r => `${r.name} ${r.code}`.toLowerCase().includes(k))
  }, [rows, keyword])

  const createAndOpen = async () => {
    if (!createForm.code.trim() || !createForm.name.trim()) {
      setError('编码和名称不能为空')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await authed('/api/form-app/infos', 'POST', {
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        mode: 'form',
      })
      const id = Number(res?.data?.id || 0)
      await load()
      if (id) navigate(`/editor/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page">
      <header className="header form-list-header">
        <div>
          <h1>Form App 列表</h1>
          <p>先定义 Form App，再进入 schema 生成和页面维护。</p>
        </div>
        <div className="form-list-actions">
          <button type="button" className="ghost" onClick={load} disabled={loading}>刷新</button>
          <button type="button" className="ghost" onClick={() => navigate('/create-wizard')}>创建向导</button>
          <Link className="ghost-link" to="/schema">Schema 文档</Link>
        </div>
      </header>

      <section className="panel form-create-panel">
        <h3>创建 Form App</h3>
        <div className="binding-row">
          <input value={createForm.code} onChange={e => setCreateForm(v => ({ ...v, code: e.target.value }))} placeholder="编码（唯一）" />
          <input value={createForm.name} onChange={e => setCreateForm(v => ({ ...v, name: e.target.value }))} placeholder="名称" />
        </div>
        <input value={createForm.description} onChange={e => setCreateForm(v => ({ ...v, description: e.target.value }))} placeholder="描述（可选）" />
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索名称或编码" style={{ maxWidth: 320 }} />
          <button type="button" onClick={createAndOpen} disabled={creating}>{creating ? '创建中...' : '创建并进入配置'}</button>
        </div>
      </section>

      <div className="form-app-table-wrap">
        <table className="form-app-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>编码</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(r => (
              <tr key={r.id}>
                <td>
                  <div>{r.name || '-'}</div>
                  <small>{r.description || ''}</small>
                </td>
                <td>{r.code}</td>
                <td>{r.publish_status ? '已发布' : '未发布'}</td>
                <td>{r.updated_at ? new Date(r.updated_at).toLocaleString() : '-'}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => navigate(`/designer-v2/${r.id}`)}>多页面设计器</button>
                    <button type="button" onClick={() => window.open(`/form-app/generated/${encodeURIComponent(r.code)}/form?editor_id=${r.id}`, '_blank')}>打开生成页</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b' }}>暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <div className="panel error-text">{error}</div>}
    </div>
  )
}
