import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, Switch, Table, Modal, Drawer, message } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from './api'
import AiChatPanel from '@/pages/AiChatPanel'
import { fieldDefsToSchema } from '@/pages/schemaConverter'
import type { FieldDef } from '@/runtime/types'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
  links: any[]
  reload: () => void
}

export default function PagesPanel({ app, pages, links, reload }: Props) {
  const navigate = useNavigate()
  const [selectedPage, setSelectedPage] = useState<FormAppPage | null>(null)
  const [showAddPage, setShowAddPage] = useState(false)
  const [newPage, setNewPage] = useState({ page_key: '', page_type: 'custom', title: '' })

  const [showGenerator, setShowGenerator] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [dataSources, setDataSources] = useState<any[]>([])
  const [selectedDataSourceID, setSelectedDataSourceID] = useState('')
  const [sourceTables, setSourceTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [primaryKey, setPrimaryKey] = useState('id')
  const [tableColumns, setTableColumns] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [regenerateTarget, setRegenerateTarget] = useState<'form' | 'list' | 'detail' | null>(null)

  useEffect(() => {
    if (pages.length > 0) {
      setSelectedPage(prev => (prev ? pages.find(p => p.id === prev.id) || pages[0] : pages[0]))
    } else {
      setSelectedPage(null)
    }
  }, [pages])

  useEffect(() => {
    authed('/api/data/sources', 'GET').then(res => setDataSources(res?.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedDataSourceID) { setSourceTables([]); setSelectedTable(''); return }
    authed(`/api/data/sources/${selectedDataSourceID}/tables`, 'GET')
      .then(res => {
        const tables = Array.isArray(res?.data) ? res.data.map((x: any) => String(x)) : []
        setSourceTables(tables)
        if (tables.length) setSelectedTable(tables[0])
      })
      .catch(() => setSourceTables([]))
  }, [selectedDataSourceID])

  useEffect(() => {
    if (!selectedDataSourceID || !selectedTable) { setTableColumns([]); return }
    authed(`/api/data/sources/${selectedDataSourceID}/tables/${encodeURIComponent(selectedTable)}/columns`, 'GET')
      .then(res => {
        const cols = Array.isArray(res?.data) ? res.data.map((x: any) => ({ name: String(x.name || ''), primary_key: !!x.primary_key })) : []
        setTableColumns(cols)
        setPrimaryKey(cols.find((x: any) => x.primary_key)?.name || 'id')
      })
      .catch(() => setTableColumns([]))
  }, [selectedDataSourceID, selectedTable])

  const addPage = async () => {
    if (!newPage.page_key.trim() || !newPage.title.trim()) { message.warning('页面标识和标题不能为空'); return }
    try {
      await authed(`/api/form-app/infos/${app.id}/pages`, 'POST', { ...newPage, design_schema: '{}', config_json: '{}' })
      setShowAddPage(false)
      setNewPage({ page_key: '', page_type: 'custom', title: '' })
      reload()
      message.success('页面已创建')
    } catch (e: any) { message.error(e.message) }
  }

  const deletePage = async (pageId: number) => {
    try {
      await authed(`/api/form-app/pages/${pageId}`, 'DELETE')
      setSelectedPage(null)
      reload()
      message.success('页面已删除')
    } catch (e: any) { message.error(e.message) }
  }

  // 当前选中页面已有字段（供 AI 参考）
  const currentFields: FieldDef[] = (() => {
    if (!selectedPage?.config_json) return []
    try { return JSON.parse(selectedPage.config_json).field_definitions || [] } catch { return [] }
  })()

  // 当前选中页面已有事件（供 AI 参考）
  const currentEvents = (() => {
    if (!selectedPage?.config_json) return []
    try { const e = JSON.parse(selectedPage.config_json).events; return Array.isArray(e) ? e : [] } catch { return [] }
  })()

  // 当前选中页面已有打印模板（供 AI 参考）
  const currentPrinters = (() => {
    if (!selectedPage?.config_json) return []
    try { const p = JSON.parse(selectedPage.config_json).printers; return Array.isArray(p) ? p : [] } catch { return [] }
  })()

  // AI 生成的字段/事件/打印模板直接保存到当前页面
  const saveFieldsToPage = async (f: FieldDef[], source?: string, events?: any[], printers?: any[]) => {
    if (!selectedPage) return
    let config: any = {}
    try { config = JSON.parse(selectedPage.config_json || '{}') } catch { config = {} }
    config.field_definitions = f
    if (events !== undefined) config.events = events
    if (printers !== undefined) config.printers = printers
    const designSchema = fieldDefsToSchema(f)
    await authed(`/api/form-app/pages/${selectedPage.id}/ai-save`, 'POST', {
      config_json: JSON.stringify(config),
      design_schema: JSON.stringify(designSchema),
      source: source || '',
    })
    reload()
  }

  const doRegenerate = async () => {
    if (!selectedDataSourceID || !selectedTable) { message.warning('请选择数据源和数据表'); return }
    if (!regenerateTarget) { message.warning('请选择要生成的页面类型'); return }
    setGenerating(true)
    try {
      await authed(`/api/form-app/infos/${app.id}/pages/regenerate`, 'POST', {
        page_type: regenerateTarget,
        data_source_id: Number(selectedDataSourceID),
        table: selectedTable,
        primary_key: primaryKey,
      })
      setShowGenerator(false)
      reload()
      message.success('页面生成成功')
    } catch (e: any) { message.error(e.message) } finally { setGenerating(false) }
  }

  if (showGenerator) {
    return (
      <div className="panel" style={{ maxWidth: 600 }}>
        <h2>从数据表生成页面</h2>
        <p style={{ color: '#64748b' }}>选择数据源和数据表，自动生成表单 / 列表 / 详情页及其数据接口。</p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>数据源</label>
          <Select style={{ width: '100%' }} value={selectedDataSourceID} onChange={v => { setSelectedDataSourceID(v); setSelectedTable('') }} placeholder="选择数据源">
            {dataSources.map((s: any) => <Select.Option key={s.id} value={String(s.id)}>{s.name} ({s.code})</Select.Option>)}
          </Select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>数据表</label>
          <Select style={{ width: '100%' }} value={selectedTable} onChange={setSelectedTable} placeholder="选择数据表">
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
              <Button key={t} type={regenerateTarget === t ? 'primary' : 'default'} onClick={() => setRegenerateTarget(t)}>
                {t === 'form' ? '表单页' : t === 'list' ? '列表页' : '详情页'}
              </Button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" loading={generating} onClick={doRegenerate} disabled={!selectedDataSourceID || !selectedTable || !regenerateTarget}>确认生成</Button>
          <Button onClick={() => setShowGenerator(false)}>取消</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 220, borderRight: '1px solid #e5e7eb', paddingRight: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Button type="primary" size="small" onClick={() => setShowAddPage(true)}>新增页面</Button>
          <Button size="small" onClick={() => setShowGenerator(true)}>从表生成</Button>
        </div>
        {pages.map(p => (
          <div
            key={p.id}
            onClick={() => setSelectedPage(p)}
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
            <div style={{ fontSize: 12, color: '#666' }}>{p.page_key} ({p.page_type})</div>
          </div>
        ))}
        {pages.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: 8 }}>暂无页面</div>}
      </div>

      <div style={{ flex: 1 }}>
        {selectedPage ? (
          <>
            <h2>{selectedPage.title}</h2>
            <p>页面类型: {selectedPage.page_type}　接口编码: {selectedPage.interface_code || '未绑定'}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Button type="primary" onClick={() => navigate(`/page-editor/${selectedPage.id}`)}>字段配置</Button>
              <Button onClick={() => navigate(`/page-designer/${selectedPage.id}`)}>布局编辑</Button>
              <Button onClick={() => navigate(`/page-events/${selectedPage.id}`)}>事件编排</Button>
              <Button onClick={() => setAiOpen(true)}>AI 对话编辑</Button>
              <Button danger onClick={() => deletePage(selectedPage.id)}>删除页面</Button>
            </div>

            {/* list 页专属配置 */}
            {selectedPage.page_type === 'list' && (
              <ListPageConfig
                app={app}
                page={selectedPage}
                pages={pages}
                links={links}
                reload={reload}
              />
            )}

            <h3 style={{ marginTop: 24 }}>该页面的跳转</h3>
            <Table
              size="small"
              rowKey="id"
              dataSource={links.filter(l => l.from_page_key === selectedPage.page_key)}
              columns={[
                { title: '目标页面', dataIndex: 'to_page_key' },
                { title: '触发类型', dataIndex: 'trigger_type' },
                { title: '按钮文字', dataIndex: 'trigger_config' },
              ]}
              pagination={false}
              locale={{ emptyText: '无跳转（在「跳转与事件」中配置）' }}
            />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <h3>暂无页面</h3>
            <p style={{ color: '#666', marginBottom: 24 }}>请先创建页面或从数据表自动生成</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button type="primary" onClick={() => setShowAddPage(true)}>手动创建页面</Button>
              <Button onClick={() => setShowGenerator(true)}>从数据表生成</Button>
            </div>
          </div>
        )}
      </div>

      <Modal title="新增页面" visible={showAddPage} onOk={addPage} onCancel={() => setShowAddPage(false)}>
        <div style={{ marginBottom: 12 }}>
          <label>页面标识</label>
          <Input value={newPage.page_key} onChange={e => setNewPage({ ...newPage, page_key: e.target.value })} placeholder="如: report" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>页面类型</label>
          <Select value={newPage.page_type} onChange={v => setNewPage({ ...newPage, page_type: v })} style={{ width: '100%' }}>
            <Select.Option value="form">表单</Select.Option>
            <Select.Option value="list">列表</Select.Option>
            <Select.Option value="detail">详情</Select.Option>
            <Select.Option value="custom">自定义</Select.Option>
          </Select>
        </div>
        <div>
          <label>页面标题</label>
          <Input value={newPage.title} onChange={e => setNewPage({ ...newPage, title: e.target.value })} placeholder="如: 报表页" />
        </div>
      </Modal>
      <Drawer
        title={selectedPage ? `AI 对话编辑：${selectedPage.title}` : 'AI 对话编辑'}
        visible={aiOpen}
        onClose={() => setAiOpen(false)}
        width={480}
        bodyStyle={{ padding: 16, height: '100%' }}
      >
        {selectedPage && (
          <AiChatPanel
            currentFields={currentFields}
            currentEvents={currentEvents}
            currentPrinters={currentPrinters}
            pageId={selectedPage.id}
            onApplyFields={() => { /* 向导内无内嵌编辑器，直接走保存到页面 */ }}
            onSaveToPage={saveFieldsToPage}
            onAfterRollback={() => reload()}
          />
        )}
      </Drawer>
    </div>
  )
}
function ListPageConfig({
  app,
  page,
  pages,
  links,
  reload,
}: {
  app: FormAppInfo
  page: FormAppPage
  pages: FormAppPage[]
  links: any[]
  reload: () => void
}) {
  const config = (() => { try { return JSON.parse(page.config_json || '{}') } catch { return {} } })()
  const [blockGlobal, setBlockGlobal] = useState<boolean>(!!config.block_global_events)
  const [saving, setSaving] = useState(false)

  // button_click links from this page
  const btnLinks = links.filter(l => l.from_page_key === page.page_key && l.trigger_type === 'button_click')
  const [btnLabel, setBtnLabel] = useState('新增')
  const [btnTarget, setBtnTarget] = useState('')
  const [addingBtn, setAddingBtn] = useState(false)

  const saveBlockGlobal = async (val: boolean) => {
    setSaving(true)
    try {
      const newCfg = { ...config, block_global_events: val }
      await authed(`/api/form-app/pages/${page.id}`, 'PUT', { config_json: JSON.stringify(newCfg) })
      setBlockGlobal(val)
      reload()
      message.success(val ? '已开启：在此页扫码时屏蔽全局自定义事件' : '已关闭全局事件屏蔽')
    } catch (e: any) { message.error(e.message) } finally { setSaving(false) }
  }

  const addNewButton = async () => {
    if (!btnTarget) { message.warning('请选择目标页面'); return }
    setAddingBtn(true)
    try {
      await authed(`/api/form-app/infos/${app.id}/links`, 'POST', {
        from_page_key: page.page_key,
        to_page_key: btnTarget,
        trigger_type: 'button_click',
        trigger_config: btnLabel || '新增',
        param_mapping: '{}',
      })
      reload()
      message.success('新增按钮已配置')
    } catch (e: any) { message.error(e.message) } finally { setAddingBtn(false) }
  }

  const removeLink = async (id: number) => {
    try { await authed(`/api/form-app/links/${id}`, 'DELETE'); reload() } catch (e: any) { message.error(e.message) }
  }

  const formPages = pages.filter(p => p.page_type === 'form' && p.page_key !== page.page_key)

  return (
    <div style={{ marginTop: 20, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <h4 style={{ marginBottom: 12 }}>列表页配置</h4>

      {/* 新增按钮 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>「新增」按钮跳转</div>
        {btnLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {btnLinks.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#e6f7ff', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>
                  {l.trigger_config || '新增'} → {l.to_page_key}
                </span>
                <Button size="small" danger onClick={() => removeLink(l.id)}>删除</Button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              style={{ width: 100 }}
              placeholder="按钮文字"
              value={btnLabel}
              onChange={e => setBtnLabel(e.target.value)}
            />
            <Select
              style={{ width: 180 }}
              placeholder="选择跳转目标（表单页）"
              value={btnTarget || undefined}
              onChange={setBtnTarget}
            >
              {formPages.map(p => (
                <Select.Option key={p.page_key} value={p.page_key}>{p.title} ({p.page_key})</Select.Option>
              ))}
            </Select>
            <Button type="primary" size="small" loading={addingBtn} onClick={addNewButton}>添加</Button>
          </div>
        )}
      </div>

      {/* 扫码阻塞全局事件 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Switch checked={blockGlobal} loading={saving} onChange={saveBlockGlobal} />
        <span>
          在此页扫码时阻塞全局自定义事件
          <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>
            开启后扫码只触发页内路由，不上报到 Custom Event 系统
          </span>
        </span>
      </div>
    </div>
  )
}
