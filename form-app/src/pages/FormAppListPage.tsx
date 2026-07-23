import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStompFormAppEvents } from '@/hooks/useStompFormAppEvents'

type FormAppRow = {
  id: number
  code: string
  name: string
  description?: string
  updated_at?: string
  publish_status?: number
}

// 简单的消息提示函数
const message = {
  success: (msg: string) => alert(msg),
  error: (msg: string) => alert(msg),
}

async function authed(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: Record<string, unknown>) {
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
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deletingApp, setDeletingApp] = useState<FormAppRow | null>(null)

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

  // 实时事件订阅
  useStompFormAppEvents({
    onEvent: (event) => {
      // 显示浏览器通知
      const eventName =
        event.event === 'form_app.created' ? '新建表单应用' :
        event.event === 'form_app.deleted' ? '表单应用已删除' :
        event.event === 'form_app.published' ? '表单应用已发布' :
        event.event === 'form_app.unpublished' ? '表单应用已取消发布' : '表单应用更新'

      if (Notification.permission === 'granted') {
        new Notification(eventName, {
          body: `${event.name} (${event.code})`,
        })
      }

      // 刷新列表
      load()
    },
    enabled: true,
  })

  const filteredRows = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return rows
    return rows.filter(r => `${r.name} ${r.code} ${r.description || ''}`.toLowerCase().includes(k))
  }, [rows, keyword])

  const handleDelete = async () => {
    if (!deletingApp) return
    try {
      await authed(`/api/form-app/infos/${deletingApp.id}`, 'DELETE')
      message.success('应用已删除')
      setDeleteModalVisible(false)
      setDeletingApp(null)
      await load()
    } catch (e: any) {
      message.error(e.message || '删除失败')
    }
  }

  const confirmDelete = (app: FormAppRow) => {
    setDeletingApp(app)
    setDeleteModalVisible(true)
  }

  const handleCopy = async (app: FormAppRow) => {
    try {
      await authed(`/api/form-app/infos/${app.id}/copy`, 'POST')
      message.success('应用复制成功')
      await load()
    } catch (e: any) {
      message.error(e.message || '复制失败')
    }
  }

  const stats = {
    total: rows.length,
    published: rows.filter(r => r.publish_status).length,
    draft: rows.filter(r => !r.publish_status).length,
  }

  return (
    <div className="formapp-list-page">
      {/* Header */}
      <header className="formapp-header">
        <div className="formapp-header-content">
          <div className="formapp-header-left">
            <h1 className="formapp-title">表单应用管理</h1>
            <p className="formapp-subtitle">创建、配置和管理您的表单应用</p>
          </div>
          <div className="formapp-header-actions">
            <button
              type="button"
              className="formapp-btn formapp-btn-ghost"
              onClick={load}
              disabled={loading}
              aria-label="刷新列表"
            >
              <svg className="formapp-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新
            </button>
            <button
              type="button"
              className="formapp-btn formapp-btn-ghost"
              onClick={() => navigate('/create-wizard')}
            >
              <svg className="formapp-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              创建向导
            </button>
            <Link className="formapp-btn formapp-btn-ghost" to="/schema">
              <svg className="formapp-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Schema 文档
            </Link>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="formapp-stats">
        <div className="formapp-stat-card">
          <div className="formapp-stat-icon formapp-stat-icon-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="formapp-stat-content">
            <div className="formapp-stat-value">{stats.total}</div>
            <div className="formapp-stat-label">总应用数</div>
          </div>
        </div>
        <div className="formapp-stat-card">
          <div className="formapp-stat-icon formapp-stat-icon-success">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="formapp-stat-content">
            <div className="formapp-stat-value">{stats.published}</div>
            <div className="formapp-stat-label">已发布</div>
          </div>
        </div>
        <div className="formapp-stat-card">
          <div className="formapp-stat-icon formapp-stat-icon-warning">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div className="formapp-stat-content">
            <div className="formapp-stat-value">{stats.draft}</div>
            <div className="formapp-stat-label">草稿</div>
          </div>
        </div>
      </div>

      {/* Search and Table */}
      <section className="formapp-table-section">
        <div className="formapp-search-bar">
          <div className="formapp-search-wrapper">
            <svg className="formapp-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="formapp-search-input"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜索应用名称、编码或描述..."
              aria-label="搜索表单应用"
            />
            {keyword && (
              <button
                type="button"
                className="formapp-search-clear"
                onClick={() => setKeyword('')}
                aria-label="清除搜索"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="formapp-search-results">
            找到 <strong>{filteredRows.length}</strong> 个应用
          </div>
        </div>

        <div className="formapp-table-wrapper">
          <table className="formapp-table">
            <thead>
              <tr>
                <th>应用信息</th>
                <th>编码</th>
                <th>状态</th>
                <th>最后更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="formapp-table-loading">
                    <svg className="formapp-spinner formapp-spinner-lg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    加载中...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="formapp-table-empty">
                    <svg className="formapp-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="formapp-empty-text">
                      {keyword ? `未找到匹配"${keyword}"的应用` : '暂无表单应用'}
                    </div>
                    {keyword && (
                      <button
                        type="button"
                        className="formapp-btn formapp-btn-ghost formapp-btn-sm"
                        onClick={() => setKeyword('')}
                      >
                        清除搜索
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map(r => (
                  <tr key={r.id} className="formapp-table-row">
                    <td>
                      <div className="formapp-app-info">
                        <div className="formapp-app-name">{r.name || '-'}</div>
                        {r.description && (
                          <div className="formapp-app-desc">{r.description}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <code className="formapp-code">{r.code}</code>
                    </td>
                    <td>
                      {r.publish_status ? (
                        <span className="formapp-badge formapp-badge-success">
                          <svg className="formapp-badge-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          已发布
                        </span>
                      ) : (
                        <span className="formapp-badge formapp-badge-warning">
                          <svg className="formapp-badge-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                          </svg>
                          草稿
                        </span>
                      )}
                    </td>
                    <td>
                      <time className="formapp-time">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '-'}
                      </time>
                    </td>
                    <td>
                      <div className="formapp-row-actions">
                        <button
                          type="button"
                          className="formapp-action-btn formapp-action-btn-primary"
                          onClick={() => navigate(`/designer-v2/${r.id}`)}
                          title="配置应用"
                        >
                          <svg className="formapp-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          配置
                        </button>
                        <button
                          type="button"
                          className="formapp-action-btn formapp-action-btn-secondary"
                          onClick={() => navigate(`/designer-v2/${r.id}?step=data`)}
                          title="数据管理"
                        >
                          <svg className="formapp-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                          </svg>
                          数据
                        </button>
                        <button
                          type="button"
                          className="formapp-action-btn formapp-action-btn-success"
                          onClick={() => {
                            const debugBase = localStorage.getItem('qr_form_app_base_url')?.trim().replace(/\/$/, '') || ''
                            window.open(`${debugBase}/form-app/runtime/${encodeURIComponent(r.code)}`, '_blank')
                          }}
                          title="运行应用"
                        >
                          <svg className="formapp-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          运行
                        </button>
                        <button
                          type="button"
                          className="formapp-action-btn formapp-action-btn-info"
                          onClick={() => handleCopy(r)}
                          title="复制应用"
                        >
                          <svg className="formapp-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          复制
                        </button>
                        <button
                          type="button"
                          className="formapp-action-btn formapp-action-btn-danger"
                          onClick={() => confirmDelete(r)}
                          title="删除应用"
                        >
                          <svg className="formapp-action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="formapp-error-banner" role="alert">
          <svg className="formapp-error-icon" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
          <button
            type="button"
            className="formapp-error-close"
            onClick={() => setError('')}
            aria-label="关闭错误提示"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalVisible && deletingApp && (
        <div className="formapp-modal-overlay" onClick={() => setDeleteModalVisible(false)}>
          <div className="formapp-modal" onClick={e => e.stopPropagation()}>
            <div className="formapp-modal-header">
              <h3 className="formapp-modal-title">确认删除</h3>
              <button
                type="button"
                className="formapp-modal-close"
                onClick={() => setDeleteModalVisible(false)}
                aria-label="关闭"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="formapp-modal-body">
              <p>确定要删除应用 <strong>{deletingApp.name}</strong> ({deletingApp.code}) 吗？</p>
              <p className="formapp-modal-warning">此操作无法撤销，应用的所有配置和数据都将被删除。</p>
            </div>
            <div className="formapp-modal-footer">
              <button
                type="button"
                className="formapp-btn formapp-btn-ghost"
                onClick={() => setDeleteModalVisible(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="formapp-btn formapp-btn-danger"
                onClick={handleDelete}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
