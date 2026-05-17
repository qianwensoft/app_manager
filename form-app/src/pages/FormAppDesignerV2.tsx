import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Input, Select, Table, Modal, message } from 'antd'

type Page = {
  id: number
  page_key: string
  page_type: string
  title: string
  interface_code: string
  sort_order: number
}

type Link = {
  id: number
  from_page_key: string
  to_page_key: string
  trigger_type: string
}

async function authed(path: string, method: string, body?: any) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
  return data
}

export default function FormAppDesignerV2() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [app, setApp] = useState<any>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [selectedPage, setSelectedPage] = useState<Page | null>(null)
  const [showAddPage, setShowAddPage] = useState(false)
  const [newPage, setNewPage] = useState({ page_key: '', page_type: 'custom', title: '' })
  const [generatedReady, setGeneratedReady] = useState(false)
  const [flowStage, setFlowStage] = useState<'define' | 'schema' | 'actions'>('define')
  const [showGenerator, setShowGenerator] = useState(false)
  const [dataSources, setDataSources] = useState<any[]>([])
  const [selectedDataSourceID, setSelectedDataSourceID] = useState('')
  const [sourceTables, setSourceTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [primaryKey, setPrimaryKey] = useState('id')
  const [tableColumns, setTableColumns] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [regenerateTarget, setRegenerateTarget] = useState<'form' | 'list' | 'detail' | null>(null)

  useEffect(() => {
    loadData()
    loadDataSources()
  }, [id])

  useEffect(() => {
    if (!id) return
    const pageIdFromUrl = searchParams.get('page')
    if (pageIdFromUrl && pages.length > 0) {
      const found = pages.find(p => String(p.id) === pageIdFromUrl)
      if (found) setSelectedPage(found)
    }
  }, [searchParams, pages, id])

  const loadDataSources = async () => {
    try {
      const res = await authed('/api/data/sources', 'GET')
      setDataSources(res?.data || [])
    } catch {}
  }

  const loadData = async () => {
    try {
      const [appRes, pagesRes, linksRes] = await Promise.all([
        authed(`/api/form-app/infos/${id}`, 'GET'),
        authed(`/api/form-app/infos/${id}/pages`, 'GET'),
        authed(`/api/form-app/infos/${id}/links`, 'GET'),
      ])
      setApp(appRes.data)
      const loadedPages = pagesRes.data || []
      setPages(loadedPages)
      setLinks(linksRes.data || [])
      const hasGenerated = loadedPages.some((p: any) => ['form', 'list', 'detail'].includes(p.page_key))
      setGeneratedReady(hasGenerated)
      setFlowStage(hasGenerated ? 'actions' : 'define')
      if (loadedPages.length > 0) {
        const pageIdFromUrl = searchParams.get('page')
        const found = pageIdFromUrl ? loadedPages.find((p: any) => String(p.id) === pageIdFromUrl) : null
        setSelectedPage(found || loadedPages[0])
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  useEffect(() => {
    if (!selectedDataSourceID) { setSourceTables([]); setSelectedTable(''); return }
    ;(async () => {
      try {
        const res = await authed(`/api/data/sources/${selectedDataSourceID}/tables`, 'GET')
        const tables = Array.isArray(res?.data) ? res.data.map((x: any) => String(x)) : []
        setSourceTables(tables)
        if (tables.length && !selectedTable) setSelectedTable(tables[0])
      } catch { setSourceTables([]) }
    })()
  }, [selectedDataSourceID])

  useEffect(() => {
    if (!selectedDataSourceID || !selectedTable) { setTableColumns([]); return }
    ;(async () => {
      try {
        const res = await authed(`/api/data/sources/${selectedDataSourceID}/tables/${encodeURIComponent(selectedTable)}/columns`, 'GET')
        const cols = Array.isArray(res?.data) ? res.data.map((x: any) => ({ name: String(x.name || ''), primary_key: !!x.primary_key })) : []
        setTableColumns(cols)
        const pk = cols.find((x: any) => x.primary_key)?.name || 'id'
        setPrimaryKey(pk)
      } catch { setTableColumns([]) }
    })()
  }, [selectedDataSourceID, selectedTable])

  const addPage = async () => {
    try {
      await authed(`/api/form-app/infos/${id}/pages`, 'POST', {
        ...newPage,
        design_schema: '{}',
        config_json: '{}',
      })
      setShowAddPage(false)
      setNewPage({ page_key: '', page_type: 'custom', title: '' })
      loadData()
      message.success('页面已创建')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const deletePage = async (pageId: number) => {
    try {
      await authed(`/api/form-app/pages/${pageId}`, 'DELETE')
      const remaining = pages.filter(p => p.id !== pageId)
      const next = remaining.length > 0 ? remaining[0] : null
      setSelectedPage(next)
      if (next) {
        navigate(`?page=${next.id}`, { replace: true })
      } else {
        navigate('', { replace: true })
      }
      loadData()
      message.success('页面已删除')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const resetGenerate = async () => {
    setShowGenerator(true)
    setRegenerateTarget(null)
  }

  const doRegenerate = async () => {
    if (!selectedDataSourceID || !selectedTable) { message.warning('请选择数据源和数据表'); return }
    if (!regenerateTarget) { message.warning('请选择要生成的页面类型'); return }
    setGenerating(true)
    setSaveMsg('')
    try {
      await authed(`/api/form-app/infos/${id}/pages/regenerate`, 'POST', {
        page_type: regenerateTarget,
        data_source_id: Number(selectedDataSourceID),
        table: selectedTable,
        primary_key: primaryKey,
      })
      setShowGenerator(false)
      await loadData()
      setSaveMsg(`${regenerateTarget === 'form' ? '表单页' : regenerateTarget === 'list' ? '列表页' : '详情页'}重新生成成功`)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 250, borderRight: '1px solid #e5e7eb', padding: 16, overflow: 'auto' }}>
        <h3>{app?.name}</h3>
        <Button type="primary" size="small" onClick={() => setShowAddPage(true)} style={{ marginBottom: 12 }}>
          新增页面
        </Button>
        {pages.map(p => (
          <div
            key={p.id}
            onClick={() => {
              setSelectedPage(p)
              navigate(`?page=${p.id}`, { replace: true })
            }}
            style={{
              padding: 8,
              cursor: 'pointer',
              background: selectedPage?.id === p.id ? '#e6f7ff' : 'transparent',
              border: selectedPage?.id === p.id ? '1px solid #40a9ff' : '1px solid transparent',
              borderRadius: 4,
              marginBottom: 4,
            }}
          >
            <div style={{ fontWeight: 500 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {p.page_key} ({p.page_type})
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        {showGenerator ? (
          <div className="panel" style={{ maxWidth: 600 }}>
            <h2>重新生成页面</h2>
            <p style={{ color: '#666' }}>选择数据源和数据表，然后选择要重新生成的页面类型（表单 / 列表 / 详情）。</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>数据源</label>
              <Select
                style={{ width: '100%' }}
                value={selectedDataSourceID}
                onChange={v => { setSelectedDataSourceID(v); setSelectedTable('') }}
                placeholder="选择数据源"
              >
                {dataSources.map((s: any) => <Select.Option key={s.id} value={String(s.id)}>{s.name} ({s.code})</Select.Option>)}
              </Select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>数据表</label>
              <Select
                style={{ width: '100%' }}
                value={selectedTable}
                onChange={setSelectedTable}
                placeholder="选择数据表"
              >
                {sourceTables.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
              </Select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>主键字段</label>
              <Select style={{ width: '100%' }} value={primaryKey} onChange={setPrimaryKey}>
                {tableColumns.map(c => <Select.Option key={c.name} value={c.name}>{c.name}{c.primary_key ? ' ★' : ''}</Select.Option>)}
              </Select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>页面类型</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['form', 'list', 'detail'] as const).map(t => (
                  <Button
                    key={t}
                    type={regenerateTarget === t ? 'primary' : 'default'}
                    onClick={() => setRegenerateTarget(t)}
                  >
                    {t === 'form' ? '表单页' : t === 'list' ? '列表页' : '详情页'}
                  </Button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="primary" onClick={doRegenerate} disabled={generating || !selectedDataSourceID || !selectedTable || !regenerateTarget}>
                {generating ? '生成中...' : '确认生成'}
              </Button>
              <Button onClick={() => setShowGenerator(false)}>取消</Button>
            </div>
            {saveMsg && <div style={{ marginTop: 8, color: '#1677ff' }}>{saveMsg}</div>}
          </div>
        ) : selectedPage ? (
          <>
            <h2>{selectedPage.title}</h2>
            <div style={{ marginBottom: 16 }}>
              <Button onClick={() => navigate(`/forms`)}>返回列表</Button>
              <Button type="primary" onClick={() => window.open(`/form-app/runtime/${encodeURIComponent(app?.code || '')}`, '_blank')} style={{ marginLeft: 8 }}>
                打开运行时页面
              </Button>
              <Button onClick={() => deletePage(selectedPage.id)} danger style={{ marginLeft: 8 }}>
                删除页面
              </Button>
              {generatedReady && (
                <Button danger onClick={resetGenerate} style={{ marginLeft: 8 }}>
                  重新生成
                </Button>
              )}
            </div>
            <div>
              <p>页面类型: {selectedPage.page_type}</p>
              <p>接口编码: {selectedPage.interface_code || '未绑定'}</p>
              <p>排序: {selectedPage.sort_order}</p>
              <div style={{ marginTop: 8 }}>
                <Button type="primary" onClick={() => navigate(`/page-editor/${selectedPage.id}`)}>
                  字段配置
                </Button>
                <Button onClick={() => navigate(`/page-designer/${selectedPage.id}`)} style={{ marginLeft: 8 }}>
                  布局编辑
                </Button>
              </div>
            </div>

            <h3 style={{ marginTop: 24 }}>页面跳转</h3>
            <Table
              size="small"
              rowKey="id"
              dataSource={links.filter(l => l.from_page_key === selectedPage.page_key)}
              columns={[
                { title: '目标页面', dataIndex: 'to_page_key' },
                { title: '触发类型', dataIndex: 'trigger_type' },
              ]}
              pagination={false}
            />
          </>
        ) : pages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <h3>暂无页面</h3>
            <p style={{ color: '#666', marginBottom: 24 }}>
              该应用还没有任何页面，请先创建页面或从数据表自动生成
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button type="primary" onClick={() => setShowAddPage(true)}>手动创建页面</Button>
              <Button onClick={() => setShowGenerator(true)}>从数据表生成</Button>
            </div>
          </div>
        ) : (
          <div>请选择页面</div>
        )}
      </div>

      <Modal
        title="新增页面"
        visible={showAddPage}
        onOk={addPage}
        onCancel={() => setShowAddPage(false)}
      >
        <div style={{ marginBottom: 12 }}>
          <label>页面标识</label>
          <Input
            value={newPage.page_key}
            onChange={e => setNewPage({ ...newPage, page_key: e.target.value })}
            placeholder="如: report"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>页面类型</label>
          <Select
            value={newPage.page_type}
            onChange={v => setNewPage({ ...newPage, page_type: v })}
            style={{ width: '100%' }}
          >
            <Select.Option value="form">表单</Select.Option>
            <Select.Option value="list">列表</Select.Option>
            <Select.Option value="detail">详情</Select.Option>
            <Select.Option value="custom">自定义</Select.Option>
          </Select>
        </div>
        <div>
          <label>页面标题</label>
          <Input
            value={newPage.title}
            onChange={e => setNewPage({ ...newPage, title: e.target.value })}
            placeholder="如: 报表页"
          />
        </div>
      </Modal>
    </div>
  )
}
