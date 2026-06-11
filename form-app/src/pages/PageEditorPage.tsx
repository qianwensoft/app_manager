import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Input, Select, AutoComplete, message, Modal,
  Form, Checkbox, Tag, Drawer, Divider, Tooltip,
  Switch, InputNumber, Space, Collapse,
} from 'antd'
import FieldRenderer from '@/runtime/FieldRenderer'
import type { FieldDef } from '@/runtime/types'
import { fieldDefsToSchema } from './schemaConverter'

// ── 扫码模块类型 ──────────────────────────────────────────────────────

interface ScanFilter {
  min_length?: number
  max_length?: number
  prefix?: string
  contains?: string
  not_contains?: string
  regex?: string
}

interface ScanResultMap {
  response_field: string
  form_field: string
}

interface ScanAction {
  interface_type?: 'internal' | 'third_party' | 'connector'  // 接口类型
  interface_code?: string
  third_party_endpoint_id?: number  // 第三方接口端点 ID（OutboundEndpoint）
  connector_interface_code?: string   // 连接器接口编码
  scan_param?: string
  extra_params?: Array<{ param_key: string; src: string }>
  result_map?: ScanResultMap[]
}

export interface ScannerConfig {
  enabled?: boolean
  fill_field?: string
  filters?: ScanFilter
  action?: ScanAction
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

export default function PageEditorPage() {
  const { pageId } = useParams()
  const navigate = useNavigate()

  const [page, setPage]                   = useState<any>(null)
  const [title, setTitle]                 = useState('')
  const [interfaceCode, setInterfaceCode] = useState('')
  const [pageType, setPageType]           = useState('')
  const [fields, setFields]               = useState<FieldDef[]>([])
  const [saving, setSaving]               = useState(false)
  const [scannerConfig, setScannerConfig] = useState<ScannerConfig>({ enabled: false })

  // 字段编辑 modal
  const [modalVisible, setModalVisible] = useState(false)
  const [editingField, setEditingField] = useState<any>(null)
  const [form] = Form.useForm()

  // 接口下拉
  const [interfaceOptions, setInterfaceOptions] = useState<{ value: string; label: string }[]>([])
  // 第三方接口端点下拉
  const [thirdPartyEndpointOptions, setThirdPartyEndpointOptions] = useState<{ value: string; label: string }[]>([])
  // 连接器接口下拉
  const [connectorInterfaceOptions, setConnectorInterfaceOptions] = useState<{ value: string; label: string }[]>([])

  // 预览抽屉
  const [previewOpen, setPreviewOpen] = useState(false)

  // 拖拽排序
  const dragIdx = useRef<number | null>(null)

  useEffect(() => {
    loadPage()
    loadInterfaces()
    loadThirdPartyEndpoints()
    loadConnectorInterfaces()
  }, [pageId])

  const loadInterfaces = async () => {
    try {
      const res = await authed('/api/data/interfaces?page_size=500', 'GET')
      const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.list || [])
      setInterfaceOptions(list.map((it: any) => ({
        value: it.code,
        label: `${it.code}${it.name ? `（${it.name}）` : ''}`,
      })))
    } catch { /* 静默 */ }
  }

  const loadThirdPartyEndpoints = async () => {
    try {
      // 加载外部应用的接口（OutboundEndpoint）
      const res = await authed('/api/outbound/endpoints?page_size=500', 'GET')
      const list: any[] = Array.isArray(res.data) ? res.data : []
      setThirdPartyEndpointOptions(list.map((it: any) => ({
        value: String(it.id),
        label: `${it.name}${it.app?.name ? ` [${it.app.name}]` : ''}`,
      })))
    } catch { /* 静默 */ }
  }

  const loadConnectorInterfaces = async () => {
    try {
      const res = await authed('/api/outbound/connector-interfaces', 'GET')
      const list: any[] = Array.isArray(res.data) ? res.data : []
      setConnectorInterfaceOptions(list.map((it: any) => ({
        value: it.interface_code,
        label: `${it.interface_code}${it.name ? ` - ${it.name}` : ''}`,
      })))
    } catch { /* 静默 */ }
  }

  const loadPage = async () => {
    try {
      const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
      const d = res.data
      setPage(d)
      setTitle(d.title || '')
      setInterfaceCode(d.interface_code || '')
      setPageType(d.page_type || '')
      const config = d.config_json ? JSON.parse(d.config_json) : {}
      setFields(config.field_definitions || [])
      setScannerConfig(config.scanner || { enabled: false })
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const config = { field_definitions: fields, scanner: scannerConfig }

      // 同时生成并保存 design_schema
      const designSchema = fieldDefsToSchema(fields)

      await authed(`/api/form-app/pages/${pageId}`, 'PUT', {
        title,
        interface_code: interfaceCode,
        page_type: pageType,
        config_json: JSON.stringify(config),
        design_schema: JSON.stringify(designSchema),
      })
      message.success('保存成功，设计器布局已同步')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 字段操作 ────────────────────────────────────────────────────────

  const addField = () => {
    setEditingField(null)
    form.resetFields()
    setModalVisible(true)
  }

  const editField = (field: any, index: number) => {
    setEditingField({ ...field, _index: index })
    form.setFieldsValue({
      ...field,
      listen_targets: Array.isArray(field.listen_targets)
        ? field.listen_targets.join(', ')
        : field.listen_targets,
    })
    setModalVisible(true)
  }

  const saveField = () => {
    form.validateFields().then(values => {
      if (typeof values.listen_targets === 'string') {
        values.listen_targets = values.listen_targets
          .split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      if (values.visible_when && !values.visible_when.field) delete values.visible_when
      if (editingField?._index !== undefined) {
        setFields(prev => { const n = [...prev]; n[editingField._index] = values; return n })
      } else {
        setFields(prev => [...prev, values])
      }
      setModalVisible(false)
    })
  }

  const deleteField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index))
  }

  const moveField = (from: number, to: number) => {
    setFields(prev => {
      const n = [...prev]
      const [item] = n.splice(from, 1)
      n.splice(to, 0, item)
      return n
    })
  }

  // ── 渲染 ────────────────────────────────────────────────────────────

  if (!page) return <div style={{ padding: 24 }}>加载中...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f6fa' }}>
      {/* 顶栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        flexShrink: 0,
      }}>
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          编辑页面：<code style={{ background: '#f0f4ff', padding: '1px 6px', borderRadius: 4 }}>{page.page_key}</code>
        </span>
        <Tag color={pageType === 'form' ? 'blue' : pageType === 'list' ? 'green' : 'purple'}>{pageType}</Tag>
        <span style={{ flex: 1 }} />
        <Button onClick={() => setPreviewOpen(true)}>预览</Button>
        <Button type="primary" loading={saving} onClick={save}>保存</Button>
      </div>

      {/* 主体：左侧配置 + 右侧预览 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 左侧：页面属性 + 字段列表 */}
        <div style={{
          width: 420, flexShrink: 0, overflowY: 'auto',
          background: '#fff', borderRight: '1px solid #e5e7eb', padding: 20,
        }}>
          <Divider orientation="left" style={{ fontSize: 13, color: '#64748b' }}>页面属性</Divider>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#374151', fontWeight: 500 }}>页面标题</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="页面显示标题" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#374151', fontWeight: 500 }}>页面类型</label>
            <Select value={pageType} onChange={setPageType} style={{ width: '100%' }}>
              <Select.Option value="form">表单</Select.Option>
              <Select.Option value="list">列表</Select.Option>
              <Select.Option value="detail">详情</Select.Option>
            </Select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#374151', fontWeight: 500 }}>
              接口编码
              <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>数据来源</span>
            </label>
            <AutoComplete
              style={{ width: '100%' }}
              value={interfaceCode}
              onChange={setInterfaceCode}
              options={interfaceOptions.filter(o =>
                !interfaceCode || o.value.includes(interfaceCode) || o.label.includes(interfaceCode)
              )}
              placeholder="输入或选择数据接口 code"
              allowClear
            />
          </div>

          <Divider orientation="left" style={{ fontSize: 13, color: '#64748b' }}>字段定义</Divider>

          <Button size="small" type="dashed" onClick={addField} style={{ marginBottom: 12, width: '100%' }}>
            + 添加字段
          </Button>

          {fields.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0', fontSize: 13 }}>
              暂无字段，点击上方「添加字段」
            </div>
          )}

          {fields.map((f, i) => (
            <div
              key={f.field || i}
              draggable
              onDragStart={() => { dragIdx.current = i }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragIdx.current !== null && dragIdx.current !== i) {
                  moveField(dragIdx.current, i)
                }
                dragIdx.current = null
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                marginBottom: 6, cursor: 'grab',
              }}
            >
              <span style={{ color: '#94a3b8', fontSize: 16, cursor: 'grab' }}>⠿</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#1e293b' }}>{f.label || f.field}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.field} · {f.component}{f.required ? ' · 必填' : ''}</div>
              </div>
              <Button size="small" onClick={() => editField(f, i)}>编辑</Button>
              <Button size="small" danger onClick={() => deleteField(i)}>删</Button>
            </div>
          ))}

          <Divider orientation="left" style={{ fontSize: 13, color: '#64748b', marginTop: 24 }}>扫码模块</Divider>
          <ScannerConfigSection
            scannerConfig={scannerConfig}
            onChange={setScannerConfig}
            fields={fields}
            interfaceOptions={interfaceOptions}
            thirdPartyEndpointOptions={thirdPartyEndpointOptions}
            connectorInterfaceOptions={connectorInterfaceOptions}
          />

          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <Button type="primary" loading={saving} onClick={save} style={{ flex: 1 }}>保存</Button>
            <Button onClick={() => setPreviewOpen(true)}>预览</Button>
          </div>
        </div>

        {/* 右侧：实时表单预览 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ marginBottom: 16, color: '#64748b', fontSize: 13 }}>
            实时预览 — 字段变动后立即反映
          </div>
          <FormPreview fields={fields} pageType={pageType} title={title} />
        </div>
      </div>

      {/* 字段配置 Modal */}
      <FieldConfigModal
        visible={modalVisible}
        editingField={editingField}
        form={form}
        interfaceOptions={interfaceOptions}
        onOk={saveField}
        onCancel={() => setModalVisible(false)}
      />

      {/* 全屏预览抽屉 */}
      <Drawer
        title={`预览：${title || page.page_key}`}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        width={480}
        bodyStyle={{ background: '#f5f6fa', padding: 24 }}
      >
        <FormPreview fields={fields} pageType={pageType} title={title} />
      </Drawer>
    </div>
  )
}

// ── 扫码模块配置 ──────────────────────────────────────────────────────

function ScannerConfigSection({
  scannerConfig,
  onChange,
  fields,
  interfaceOptions,
  thirdPartyEndpointOptions,
  connectorInterfaceOptions,
}: {
  scannerConfig: ScannerConfig
  onChange: (cfg: ScannerConfig) => void
  fields: FieldDef[]
  interfaceOptions: { value: string; label: string }[]
  thirdPartyEndpointOptions: { value: string; label: string }[]
  connectorInterfaceOptions: { value: string; label: string }[]
}) {
  const fieldOptions = fields.map(f => ({ value: f.field, label: f.label || f.field }))

  const upd = (patch: Partial<ScannerConfig>) =>
    onChange({ ...scannerConfig, ...patch })
  const updFilter = (patch: Partial<ScanFilter>) =>
    upd({ filters: { ...(scannerConfig.filters || {}), ...patch } })
  const updAction = (patch: Partial<ScanAction>) =>
    upd({ action: { ...(scannerConfig.action || {}), ...patch } })

  const resultMap: ScanResultMap[] = scannerConfig.action?.result_map || []
  const extraParams: Array<{ param_key: string; src: string }> = scannerConfig.action?.extra_params || []

  const addResultMap = () =>
    updAction({ result_map: [...resultMap, { response_field: '', form_field: '' }] })
  const updateResultMap = (i: number, patch: Partial<ScanResultMap>) => {
    const next = resultMap.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    updAction({ result_map: next })
  }
  const removeResultMap = (i: number) =>
    updAction({ result_map: resultMap.filter((_, idx) => idx !== i) })

  const addExtraParam = () =>
    updAction({ extra_params: [...extraParams, { param_key: '', src: '' }] })
  const updateExtraParam = (i: number, patch: { param_key?: string; src?: string }) => {
    const next = extraParams.map((p, idx) => idx === i ? { ...p, ...patch } : p)
    updAction({ extra_params: next })
  }
  const removeExtraParam = (i: number) =>
    updAction({ extra_params: extraParams.filter((_, idx) => idx !== i) })

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }
  const rowStyle: React.CSSProperties = { marginBottom: 10 }

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: scannerConfig.enabled ? 14 : 0 }}>
        <Switch
          size="small"
          checked={!!scannerConfig.enabled}
          onChange={v => upd({ enabled: v })}
        />
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
          启用扫码（PDA 头扫 / 键盘楔扫码枪）
        </span>
      </div>

      {scannerConfig.enabled && (
        <>
          {/* 填入字段 */}
          <div style={rowStyle}>
            <label style={labelStyle}>扫码结果填入字段</label>
            <Select
              value={scannerConfig.fill_field}
              onChange={v => upd({ fill_field: v })}
              placeholder="选择要填入的字段（可不填）"
              allowClear
              style={{ width: '100%' }}
              options={fieldOptions}
              size="small"
            />
          </div>

          {/* 前置过滤器 */}
          <Collapse style={{ marginBottom: 10, background: '#fff' }}>
            <Collapse.Panel key="filters" header={<span style={{ fontSize: 12, color: '#374151' }}>前置过滤器</span>}>
              <Space style={{ width: '100%' }} direction="vertical" size={6}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>最小长度</label>
                    <InputNumber
                      size="small" min={0} style={{ width: '100%' }}
                      value={scannerConfig.filters?.min_length}
                      onChange={v => updFilter({ min_length: v ?? undefined })}
                      placeholder="不限"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>最大长度</label>
                    <InputNumber
                      size="small" min={0} style={{ width: '100%' }}
                      value={scannerConfig.filters?.max_length}
                      onChange={v => updFilter({ max_length: v ?? undefined })}
                      placeholder="不限"
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>前缀匹配（必须以...开头）</label>
                  <Input
                    size="small"
                    value={scannerConfig.filters?.prefix}
                    onChange={e => updFilter({ prefix: e.target.value || undefined })}
                    placeholder="留空不限"
                    allowClear
                  />
                </div>
                <div>
                  <label style={labelStyle}>包含字符串</label>
                  <Input
                    size="small"
                    value={scannerConfig.filters?.contains}
                    onChange={e => updFilter({ contains: e.target.value || undefined })}
                    placeholder="留空不限"
                    allowClear
                  />
                </div>
                <div>
                  <label style={labelStyle}>排除包含（不能包含）</label>
                  <Input
                    size="small"
                    value={scannerConfig.filters?.not_contains}
                    onChange={e => updFilter({ not_contains: e.target.value || undefined })}
                    placeholder="留空不限"
                    allowClear
                  />
                </div>
                <div>
                  <Tooltip title="正则表达式，匹配时通过过滤。如: ^[0-9]{8,13}$">
                    <label style={labelStyle}>正则表达式（高级）</label>
                  </Tooltip>
                  <Input
                    size="small"
                    value={scannerConfig.filters?.regex}
                    onChange={e => updFilter({ regex: e.target.value || undefined })}
                    placeholder="如：^[0-9]{8,13}$"
                    allowClear
                  />
                </div>
              </Space>
            </Collapse.Panel>
          </Collapse>

          {/* 扫码触发动作 */}
          <Collapse style={{ background: '#fff' }}>
            <Collapse.Panel key="action" header={<span style={{ fontSize: 12, color: '#374151' }}>触发动作（调用接口）</span>}>
              <div>
                <div style={rowStyle}>
                  <label style={labelStyle}>接口类型</label>
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={scannerConfig.action?.interface_type || 'internal'}
                    onChange={v => updAction({ interface_type: v, interface_code: undefined, third_party_endpoint_id: undefined, connector_interface_code: undefined })}
                  >
                    <Select.Option value="internal">内部数据接口</Select.Option>
                    <Select.Option value="third_party">第三方应用接口</Select.Option>
                    <Select.Option value="connector">连接器接口</Select.Option>
                  </Select>
                </div>

                {scannerConfig.action?.interface_type === 'connector' ? (
                  <div style={rowStyle}>
                    <label style={labelStyle}>连接器接口</label>
                    <AutoComplete
                      size="small"
                      style={{ width: '100%' }}
                      value={scannerConfig.action?.connector_interface_code}
                      onChange={v => updAction({ connector_interface_code: v })}
                      options={connectorInterfaceOptions.filter(o =>
                        !scannerConfig.action?.connector_interface_code ||
                        o.value.includes(scannerConfig.action.connector_interface_code) ||
                        o.label.includes(scannerConfig.action.connector_interface_code)
                      )}
                      placeholder="选择连接器接口（留空则不调用）"
                      allowClear
                    />
                  </div>
                ) : scannerConfig.action?.interface_type === 'third_party' ? (
                  <div style={rowStyle}>
                    <label style={labelStyle}>第三方接口端点</label>
                    <AutoComplete
                      size="small"
                      style={{ width: '100%' }}
                      value={scannerConfig.action?.third_party_endpoint_id ? String(scannerConfig.action.third_party_endpoint_id) : undefined}
                      onChange={v => updAction({ third_party_endpoint_id: v ? Number(v) : undefined })}
                      options={thirdPartyEndpointOptions.filter(o => {
                        const searchValue = scannerConfig.action?.third_party_endpoint_id ? String(scannerConfig.action.third_party_endpoint_id) : ''
                        return !searchValue || o.value.includes(searchValue) || o.label.includes(searchValue)
                      })}
                      placeholder="选择第三方接口端点（留空则不调用）"
                      allowClear
                    />
                  </div>
                ) : (
                  <div style={rowStyle}>
                    <label style={labelStyle}>调用接口编码</label>
                    <AutoComplete
                      size="small"
                      style={{ width: '100%' }}
                      value={scannerConfig.action?.interface_code}
                      onChange={v => updAction({ interface_code: v })}
                      options={interfaceOptions.filter(o =>
                        !scannerConfig.action?.interface_code ||
                        o.value.includes(scannerConfig.action.interface_code) ||
                        o.label.includes(scannerConfig.action.interface_code)
                      )}
                      placeholder="接口 code（留空则不调用接口）"
                      allowClear
                    />
                  </div>
                )}

                {(scannerConfig.action?.interface_code || scannerConfig.action?.third_party_endpoint_id || scannerConfig.action?.connector_interface_code) && (
                  <>
                    <div style={rowStyle}>
                      <Tooltip title="扫码值传入接口的参数名，默认 code">
                        <label style={labelStyle}>扫码值参数名（默认：code）</label>
                      </Tooltip>
                      <Input
                        size="small"
                        value={scannerConfig.action?.scan_param}
                        onChange={e => updAction({ scan_param: e.target.value || undefined })}
                        placeholder="code"
                      />
                    </div>

                    {/* 额外参数 */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>额外参数</label>
                        <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={addExtraParam}>+ 添加</Button>
                      </div>
                      {extraParams.length > 0 && (
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8 }}>
                          {extraParams.map((ep, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                              <Input
                                size="small"
                                style={{ flex: 1 }}
                                value={ep.param_key}
                                onChange={e => updateExtraParam(i, { param_key: e.target.value })}
                                placeholder="参数名"
                              />
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>←</span>
                              <Input
                                size="small"
                                style={{ flex: 2 }}
                                value={ep.src}
                                onChange={e => updateExtraParam(i, { src: e.target.value })}
                                placeholder="$form.字段名 / $scan / 固定值"
                              />
                              <Button size="small" danger type="text" onClick={() => removeExtraParam(i)}>×</Button>
                            </div>
                          ))}
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            来源：$scan=扫码值，$form.字段名=表单字段值，其他=字面量
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 结果映射 */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>接口结果回填表单</label>
                        <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={addResultMap}>+ 添加</Button>
                      </div>
                      {resultMap.length > 0 && (
                        <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8 }}>
                          {resultMap.map((rm, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                              <Input
                                size="small"
                                style={{ flex: 2 }}
                                value={rm.response_field}
                                onChange={e => updateResultMap(i, { response_field: e.target.value })}
                                placeholder="接口返回字段（如 data.name）"
                              />
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>→</span>
                              <Select
                                size="small"
                                style={{ flex: 2 }}
                                value={rm.form_field || undefined}
                                onChange={v => updateResultMap(i, { form_field: v })}
                                placeholder="填入表单字段"
                                options={fieldOptions}
                                allowClear
                              />
                              <Button size="small" danger type="text" onClick={() => removeResultMap(i)}>×</Button>
                            </div>
                          ))}
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            接口返回字段支持点路径，如 data.employee_name
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Collapse.Panel>
          </Collapse>
        </>
      )}
    </div>
  )
}

// ── 实时表单预览 ──────────────────────────────────────────────────────

function FormPreview({ fields, pageType, title }: { fields: FieldDef[]; pageType: string; title: string }) {
  const [values, setValues] = useState<Record<string, any>>({})

  if (fields.length === 0) {
    return (
      <div style={{
        textAlign: 'center', color: '#94a3b8', padding: '60px 24px',
        background: '#fff', borderRadius: 10, border: '1px dashed #e2e8f0',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div>暂无字段，在左侧添加后实时显示</div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 24, border: '1px solid #e5e7eb', maxWidth: 520 }}>
      {title && <h3 style={{ marginTop: 0, marginBottom: 20 }}>{title}</h3>}
      {fields.map(f => (
        <div key={f.field} style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#374151', fontWeight: 500 }}>
            {f.required && <span style={{ color: '#ef4444', marginRight: 2 }}>*</span>}
            {f.label}
          </label>
          <FieldRenderer
            def={f}
            value={values[f.field]}
            onChange={v => setValues(prev => ({ ...prev, [f.field]: v }))}
          />
        </div>
      ))}
      {pageType === 'form' && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <Button type="primary" style={{ width: '100%' }}>提交</Button>
        </div>
      )}
    </div>
  )
}

// ── 字段配置 Modal ────────────────────────────────────────────────────

function FieldConfigModal({
  visible, editingField, form, interfaceOptions, onOk, onCancel,
}: {
  visible: boolean
  editingField: any
  form: any
  interfaceOptions: { value: string; label: string }[]
  onOk: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={editingField ? '编辑字段' : '新增字段'}
      visible={visible}
      onOk={onOk}
      onCancel={onCancel}
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item label="字段名 (field key)" name="field" rules={[{ required: true, message: '请输入字段名' }]}>
          <Input placeholder="如: employee_name" />
        </Form.Item>
        <Form.Item label="标签 (label)" name="label" rules={[{ required: true, message: '请输入显示标签' }]}>
          <Input placeholder="如: 员工姓名" />
        </Form.Item>
        <Form.Item label="组件类型" name="component" rules={[{ required: true, message: '请选择组件' }]}>
          <Select>
            {['Input', 'InputNumber', 'Select', 'DatePicker', 'Switch', 'Rate', 'Slider', 'Checkbox', 'Radio'].map(c => (
              <Select.Option key={c} value={c}>{c}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="必填" name="required" valuePropName="checked">
          <Checkbox />
        </Form.Item>
        <Form.Item label="占位符" name="placeholder">
          <Input placeholder="留空使用默认" />
        </Form.Item>

        <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>显示条件（可选）</Divider>
        <Form.Item label="依赖字段" name={['visible_when', 'field']}>
          <Input placeholder="字段名，如 need_remark" />
        </Form.Item>
        <Form.Item label="运算符" name={['visible_when', 'operator']}>
          <Select allowClear placeholder="留空=始终显示">
            {['eq', 'neq', 'not_empty', 'empty', 'in'].map(op => (
              <Select.Option key={op} value={op}>{op}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="条件值" name={['visible_when', 'value']}>
          <Input placeholder="eq/in 时填写" />
        </Form.Item>

        <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>动态选项（Select 类型用）</Divider>
        <Form.Item label="级联监听字段" name="listen_targets">
          <Input placeholder="逗号分隔，如 dept_id" />
        </Form.Item>
        <Form.Item label="选项查询接口" name="options_interface_code">
          <AutoComplete
            options={interfaceOptions}
            placeholder="数据接口 code"
            allowClear
            filterOption={(input, opt) =>
              !!opt?.value?.includes(input) || !!opt?.label?.toString().includes(input)
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
