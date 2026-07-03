import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Input, Select, AutoComplete, message, Modal,
  Form, Checkbox, Tag, Drawer, Divider, Tooltip,
  Switch, InputNumber, Space, Collapse,
} from 'antd'
import FieldRenderer from '@/runtime/FieldRenderer'
import type { FieldDef } from '@/runtime/types'
import type { PageEvent } from '@/runtime/eventTypes'
import type { PrinterTemplate } from '@/runtime/printerTypes'
import { PrintButtonContext } from '@/runtime/PrintButtonContext'
import { fieldDefsToSchema } from './schemaConverter'
import { useInterfaceOptions } from './useInterfaceOptions'
import EventsConfigSection from './EventsConfigSection'
import PrintersConfigSection from './PrintersConfigSection'
import AiChatPanel from './AiChatPanel'

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

/**
 * 字段配置与 design_schema 增量合并：
 * 只更新字段定义相关属性（label、component、required 等），
 * 保留编辑器设定的布局、样式、容器结构。
 */
function mergeFieldDefsIntoDesignSchema(fieldDefs: FieldDef[], existingSchema: any): any {
  const properties = existingSchema?.schema?.properties || {}
  const fieldMap = new Map<string, FieldDef>()
  fieldDefs.forEach(f => fieldMap.set(f.field, f))

  // 组件映射（与 schemaConverter 保持一致）
  const COMP_MAP: Record<string, string> = {
    Input: 'Input',
    InputNumber: 'NumberPicker',
    Select: 'Select',
    DatePicker: 'DatePicker',
    Switch: 'Switch',
    Rate: 'Rate',
    Slider: 'Slider',
    Checkbox: 'Checkbox',
    Radio: 'Radio',
    PrintButton: 'PrintButton',
  }

  // 递归更新字段属性，保留布局容器和非字段节点
  const updateProperties = (props: Record<string, any>): Record<string, any> => {
    const updated: Record<string, any> = {}

    for (const [key, node] of Object.entries(props)) {
      if (!node || typeof node !== 'object') {
        updated[key] = node
        continue
      }

      const component = node['x-component']

      // 容器节点：保留自身，递归更新子节点
      const CONTAINER = ['Form', 'FormLayout', 'FormGrid', 'FormTab', 'FormTab.TabPane',
        'Card', 'Space', 'FormCollapse', 'FormCollapse.CollapsePanel',
        'Section', 'ArrayCards', 'ArrayTable']

      if (CONTAINER.includes(component)) {
        updated[key] = { ...node }
        if (node.properties) {
          updated[key].properties = updateProperties(node.properties)
        }
        if (node.items?.properties) {
          updated[key].items = {
            ...node.items,
            properties: updateProperties(node.items.properties),
          }
        }
        continue
      }

      // 非字段展示组件：原样保留
      const NON_FIELD = ['Text', 'SubmitButton', 'ConfirmDialogButton', 'ScanTrigger',
        'CardList', 'ActionButton', 'EventButton', 'NavigateButton', 'FeedbackButton',
        'PageHeader', 'Divider', 'StaticImage', 'StaticText']

      if (NON_FIELD.includes(component)) {
        updated[key] = node
        continue
      }

      // 打印按钮
      if (component === 'PrintButton') {
        const fieldName = node.name || key
        const fieldDef = fieldMap.get(fieldName)
        if (fieldDef) {
          updated[key] = {
            ...node,
            title: fieldDef.label || node.title,
            'x-component-props': {
              ...node['x-component-props'],
              templateId: fieldDef.print_template_id,
              buttonId: fieldDef.button_id,
              text: fieldDef.button_text || fieldDef.label || '打印',
              type: (fieldDef as any).button_type || node['x-component-props']?.type,
              block: (fieldDef as any).button_block ?? node['x-component-props']?.block ?? true,
            },
          }
        } else {
          updated[key] = node // 字段已删除，保留原节点
        }
        continue
      }

      // 输入字段：更新定义，保留布局/样式
      const fieldName = node.name || key
      const fieldDef = fieldMap.get(fieldName)

      if (fieldDef) {
        updated[key] = {
          ...node, // 保留所有编辑器属性（x-index、位置、样式等）
          title: fieldDef.label || fieldName,
          'x-component': COMP_MAP[fieldDef.component] || 'Input',
          'x-component-props': {
            ...node['x-component-props'],
            ...(fieldDef.placeholder ? { placeholder: fieldDef.placeholder } : {}),
          },
          'x-validator': fieldDef.required
            ? [{ required: true, message: '此项为必填' }]
            : (node['x-validator'] || []).filter((v: any) => !v.required),
        }
      } else {
        // 字段已从 field_definitions 中删除，保留原节点（用户可在编辑器中手动删除）
        updated[key] = node
      }
    }

    // 添加新字段（存在于 fieldDefs 但不在 schema 中）
    for (const fieldDef of fieldDefs) {
      if (!Object.values(updated).some((n: any) => n?.name === fieldDef.field || n === fieldDef.field)) {
        // 新增字段：生成默认节点
        if (fieldDef.component === 'PrintButton') {
          updated[fieldDef.field] = {
            type: 'void',
            name: fieldDef.field,
            title: fieldDef.label || '',
            'x-component': 'PrintButton',
            'x-component-props': {
              templateId: fieldDef.print_template_id,
              buttonId: fieldDef.button_id,
              text: fieldDef.button_text || fieldDef.label || '打印',
              type: (fieldDef as any).button_type || 'default',
              block: (fieldDef as any).button_block ?? true,
            },
            'x-index': Object.keys(updated).length,
          }
        } else {
          updated[fieldDef.field] = {
            name: fieldDef.field,
            type: 'string',
            title: fieldDef.label || fieldDef.field,
            'x-decorator': 'FormItem',
            'x-decorator-props': {},
            'x-component': COMP_MAP[fieldDef.component] || 'Input',
            'x-component-props': {
              ...(fieldDef.placeholder ? { placeholder: fieldDef.placeholder } : {}),
            },
            ...(fieldDef.required ? { 'x-validator': [{ required: true, message: '此项为必填' }] } : {}),
            'x-index': Object.keys(updated).length,
          }
        }
      }
    }

    return updated
  }

  return {
    ...existingSchema,
    schema: {
      ...existingSchema.schema,
      properties: updateProperties(properties),
    },
  }
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
  const [showDefaultSubmit, setShowDefaultSubmit] = useState(false)
  const [enableDraft, setEnableDraft] = useState(false)
  const [pageEvents, setPageEvents] = useState<PageEvent[]>([])
  const [printers, setPrinters] = useState<PrinterTemplate[]>([])
  const [paramSchema, setParamSchema] = useState('')

  // 字段编辑 modal
  const [modalVisible, setModalVisible] = useState(false)
  const [editingField, setEditingField] = useState<any>(null)
  const [form] = Form.useForm()

  // 接口/第三方/连接器下拉与返回 schema（共用 hook）
  const {
    interfaceOptions,
    thirdPartyEndpointOptions,
    connectorInterfaceOptions,
    interfaceSchemas,
    thirdPartySchemas,
    connectorSchemas,
  } = useInterfaceOptions()

  // 预览抽屉
  const [previewOpen, setPreviewOpen] = useState(false)

  // AI 助手抽屉
  const [aiOpen, setAiOpen] = useState(false)

  // 拖拽排序
  const dragIdx = useRef<number | null>(null)

  useEffect(() => {
    loadPage()
  }, [pageId])

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
      setShowDefaultSubmit(!!config.show_default_submit)
      setEnableDraft(!!config.enable_draft)
      setPageEvents(Array.isArray(config.events) ? config.events : [])
      setPrinters(Array.isArray(config.printers) ? config.printers : [])
      setParamSchema(config.param_schema || '')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const config = { field_definitions: fields, scanner: scannerConfig, events: pageEvents, printers, show_default_submit: showDefaultSubmit, enable_draft: enableDraft, param_schema: paramSchema }

      // 读取当前页面的完整数据，包括现有的 design_schema
      const pageRes = await authed(`/api/form-app/pages/${pageId}`, 'GET')
      const currentPage = pageRes.data

      // 增量更新 design_schema：保留编辑器设定的布局/样式，只更新字段定义
      let finalDesignSchema = currentPage?.design_schema ? JSON.parse(currentPage.design_schema) : null

      if (finalDesignSchema?.schema?.properties) {
        // 已有 design_schema，执行交叉比对合并
        finalDesignSchema = mergeFieldDefsIntoDesignSchema(fields, finalDesignSchema)
      } else {
        // 无有效 design_schema，全量生成（首次创建页面场景）
        finalDesignSchema = fieldDefsToSchema(fields)
      }

      await authed(`/api/form-app/pages/${pageId}`, 'PUT', {
        title,
        interface_code: interfaceCode,
        page_type: pageType,
        config_json: JSON.stringify(config),
        design_schema: JSON.stringify(finalDesignSchema),
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
        <Button onClick={() => navigate(`/page-events/${pageId}`)}>事件编排</Button>
        <Button onClick={() => setAiOpen(true)}>AI 助手</Button>
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

          {(pageType === 'form' || pageType === 'custom') && (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Switch size="small" checked={showDefaultSubmit} onChange={setShowDefaultSubmit} />
              <div style={{ fontSize: 13, color: '#374151' }}>
                显示默认提交按钮
                <div style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                  关闭时表单底部不再自动渲染提交按钮，请在「布局编辑」中拖入提交/动作按钮
                </div>
              </div>
            </div>
          )}

          {(pageType === 'form' || pageType === 'custom') && (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Switch size="small" checked={enableDraft} onChange={setEnableDraft} />
              <div style={{ fontSize: 13, color: '#374151' }}>
                自动保存草稿
                <div style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                  默认关闭。开启后表单填写过程中会自动把未提交内容暂存到本地与服务端，下次进入页面自动恢复
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: '#374151' }}>
              页面入参 Schema (JSON)
              <Tooltip title="定义此页面接收的 URL 参数，用于跳转时的参数映射和页面内部引用">
                <span style={{ marginLeft: 4, color: '#94a3b8', cursor: 'help' }}>ⓘ</span>
              </Tooltip>
            </label>
            <Input.TextArea
              value={paramSchema}
              onChange={e => setParamSchema(e.target.value)}
              rows={3}
              placeholder='{"id": {"type": "string", "description": "设备ID"}, "status": {"type": "string"}}'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              定义页面接收的参数，可在参数映射中使用 $url.xxx 引用
            </div>
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
          />

          <Divider orientation="left" style={{ fontSize: 13, color: '#64748b', marginTop: 24 }}>蓝牙打印模板</Divider>
          <PrintersConfigSection
            printers={printers}
            onChange={setPrinters}
            fields={fields}
            pageId={pageId}
            onOpenAI={() => setAiOpen(true)}
          />

          <Divider orientation="left" style={{ fontSize: 13, color: '#64748b', marginTop: 24 }}>事件系统（高级）</Divider>
          <EventsConfigSection
            events={pageEvents}
            onChange={setPageEvents}
            fields={fields}
            printers={printers}
            buttons={fields
              .filter(f => f.component === 'PrintButton' || f.button_id)
              .map(f => ({
                buttonId: f.button_id || f.field,
                text: f.button_text || f.label || f.field,
                component: f.component,
              }))}
            interfaceOptions={interfaceOptions}
            thirdPartyEndpointOptions={thirdPartyEndpointOptions}
            connectorInterfaceOptions={connectorInterfaceOptions}
            interfaceSchemas={interfaceSchemas}
            thirdPartySchemas={thirdPartySchemas}
            connectorSchemas={connectorSchemas}
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
        printers={printers}
        onOk={saveField}
        onCancel={() => setModalVisible(false)}
      />

      {/* 全屏预览抽屉 */}
      <Drawer
        title={`预览：${title || page.page_key}`}
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        width={480}
        bodyStyle={{ background: '#f5f6fa', padding: 24 }}
      >
        <FormPreview fields={fields} pageType={pageType} title={title} />
      </Drawer>

      {/* AI 助手抽屉 */}
      <Drawer
        title="AI 助手 — 对话生成表单字段"
        visible={aiOpen}
        onClose={() => setAiOpen(false)}
        width={480}
        bodyStyle={{ padding: 16, height: '100%' }}
        destroyOnClose={false}
      >
        <AiChatPanel
          currentFields={fields}
          currentEvents={pageEvents}
          currentPrinters={printers}
          pageId={pageId ? Number(pageId) : undefined}
          onApplyFields={(f) => { setFields(f); message.success('已应用 AI 生成的字段') }}
          onApplyEvents={(e) => { setPageEvents(e); message.success('已应用 AI 生成的事件') }}
          onApplyPrinters={(p) => { setPrinters(p); message.success('已应用 AI 生成的打印模板') }}
          onSaveToPage={async (f, source, events, prn) => {
            const config = { field_definitions: f, scanner: scannerConfig, events: events ?? pageEvents, printers: prn ?? printers, show_default_submit: showDefaultSubmit, enable_draft: enableDraft, param_schema: paramSchema }
            const designSchema = fieldDefsToSchema(f)
            await authed(`/api/form-app/pages/${pageId}/ai-save`, 'POST', {
              config_json: JSON.stringify(config),
              design_schema: JSON.stringify(designSchema),
              source: source || '',
            })
          }}
          onAfterRollback={() => { loadPage() }}
        />
      </Drawer>
    </div>
  )
}

// ── 扫码模块配置 ──────────────────────────────────────────────────────

function ScannerConfigSection({
  scannerConfig,
  onChange,
  fields,
}: {
  scannerConfig: ScannerConfig
  onChange: (cfg: ScannerConfig) => void
  fields: FieldDef[]
}) {
  const fieldOptions = fields.map(f => ({ value: f.field, label: f.label || f.field }))

  const upd = (patch: Partial<ScannerConfig>) =>
    onChange({ ...scannerConfig, ...patch })

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

          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            过滤条件与扫码后调用接口，请在下方「事件系统（高级）」中配置 source=扫码 的事件。
          </div>
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

  // 为预览提供一个模拟的 PrintButtonContext（按钮可见但不执行）
  const mockPrintButtonContext = {
    print: undefined,
    triggerButton: (buttonId: string) => {
      console.log('[Preview] Button triggered:', buttonId)
    },
  }

  return (
    <PrintButtonContext.Provider value={mockPrintButtonContext}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, border: '1px solid #e5e7eb', maxWidth: 520 }}>
        {title && <h3 style={{ marginTop: 0, marginBottom: 20 }}>{title}</h3>}
        {fields.map(f => (
          <FieldRenderer
            key={f.field}
            def={f}
            value={values[f.field]}
            onChange={v => setValues(prev => ({ ...prev, [f.field]: v }))}
          />
        ))}
        {pageType === 'form' && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Button type="primary" style={{ width: '100%' }}>提交</Button>
          </div>
        )}
      </div>
    </PrintButtonContext.Provider>
  )
}

// ── 字段配置 Modal ────────────────────────────────────────────────────

function FieldConfigModal({
  visible, editingField, form, interfaceOptions, printers, onOk, onCancel,
}: {
  visible: boolean
  editingField: any
  form: any
  interfaceOptions: { value: string; label: string }[]
  printers: PrinterTemplate[]
  onOk: () => void
  onCancel: () => void
}) {
  const component = Form.useWatch('component', form)
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
            {['Input', 'InputNumber', 'Select', 'DatePicker', 'Switch', 'Rate', 'Slider', 'Checkbox', 'Radio', 'PrintButton'].map(c => (
              <Select.Option key={c} value={c}>{c}</Select.Option>
            ))}
          </Select>
        </Form.Item>

        {component === 'PrintButton' ? (
          <>
            <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>打印按钮</Divider>
            <Form.Item label="绑定打印模板" name="print_template_id">
              <Select allowClear placeholder="选择页面打印模板">
                {printers.map(p => (
                  <Select.Option key={p.id} value={p.id}>{p.name}（{p.protocol}）</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="按钮文案" name="button_text">
              <Input placeholder="如: 打印小票" />
            </Form.Item>
            <Form.Item label="触发事件 ID（可选）" name="button_id" tooltip="填写后点击按钮会触发「事件系统」中 source=按钮、按钮ID 匹配的事件链">
              <Input placeholder="如: print_receipt" />
            </Form.Item>
          </>
        ) : (
          <>
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
          </>
        )}
      </Form>
    </Modal>
  )
}
