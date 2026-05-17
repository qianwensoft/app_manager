import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ComponentTreeWidget,
  CompositePanel,
  Designer,
  DesignerToolsWidget,
  HistoryWidget,
  OutlineTreeWidget,
  ResourceWidget,
  SettingsPanel,
  StudioPanel,
  ToolbarPanel,
  ViewPanel,
  ViewToolsWidget,
  ViewportPanel,
  Workbench,
  WorkspacePanel,
} from '@designable/react'
import { createDesigner } from '@designable/core'
import { transformToSchema, transformToTreeNode } from '@designable/formily'
import { SettingsForm } from '@designable/react-settings-form'
import {
  ArrayCards,
  ArrayTable,
  Card,
  Cascader,
  Checkbox,
  DatePicker,
  Field,
  Form,
  FormCollapse,
  FormGrid,
  FormLayout,
  FormTab,
  Input,
  NumberPicker,
  ObjectContainer,
  Password,
  Radio,
  Rate,
  Select,
  Slider,
  Space,
  Switch,
  Text,
  TimePicker,
  Transfer,
  TreeSelect,
  Upload,
} from '@designable/formily-antd'
import { SubmitButton } from '@/designable/SubmitButton'
import { ConfirmDialogButton } from '@/designable/ConfirmDialogButton'
import { Modal } from 'antd'

const componentMap = {
  Form,
  Field,
  Input,
  Select,
  TreeSelect,
  Cascader,
  Radio,
  Checkbox,
  Slider,
  Rate,
  NumberPicker,
  Transfer,
  Password,
  DatePicker,
  TimePicker,
  Upload,
  Switch,
  Text,
  Card,
  ArrayCards,
  ArrayTable,
  Space,
  FormTab,
  FormCollapse,
  FormGrid,
  FormLayout,
  ObjectContainer,
  SubmitButton,
  ConfirmDialogButton,
  // Add Designable prefixed components
  DesignableForm: Form,
  DesignableField: Field,
}
const CompositeItem = CompositePanel.Item as any

type Option = { label: string; value: string }
type DataSourceOption = { id: number; code: string; name: string; type: string; readOnly: boolean }
type BindingRow = {
  id: string
  field: string
  contextKey: string
  listenTargets: string
  querySourceType: 'data_interface' | 'app_interface'
  queryCode: string
}

type QueryConditionRow = {
  id: string
  field: string
  operator: string
  value: string
}
type TableColumn = { name: string; primary_key?: boolean }
type PageNodeConfig = { key: string; title: string; interfaceCode?: string; pageType: string }

const QUERY_OPERATORS = [
  { value: 'contains', label: '包含' },
  { value: 'starts_with', label: '以...开始' },
  { value: 'ends_with', label: '以...结束' },
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'between', label: '区间' },
  { value: 'in', label: '集合(in)' },
]

async function authed(path: string, method: 'GET' | 'POST' | 'PUT', body?: Record<string, unknown>) {
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
  if (!resp.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  return data
}

export default function FormDesignerPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataInterfaces, setDataInterfaces] = useState<Option[]>([])
  const [appInterfaces, setAppInterfaces] = useState<Option[]>([])
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([])
  const [selectedDataSourceID, setSelectedDataSourceID] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [createdFormID, setCreatedFormID] = useState('')
  const [flowStage, setFlowStage] = useState<'define' | 'schema' | 'actions'>('define')
  const [step, setStep] = useState(1)
  const [confirmStep, setConfirmStep] = useState<{ [k: number]: boolean }>({ 1: false, 2: false, 3: false })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [schemaMode, setSchemaMode] = useState<'select_schema' | 'create_schema'>('select_schema')
  const [ddlSQL, setDdlSQL] = useState('')
  const [sourceTables, setSourceTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [tableColumns, setTableColumns] = useState<TableColumn[]>([])
  const [primaryKey, setPrimaryKey] = useState('id')
  const [generatedReady, setGeneratedReady] = useState(false)
  const [runtimeSchemaState, setRuntimeSchemaState] = useState<any>(null)
  const [pageTree, setPageTree] = useState<PageNodeConfig[]>([])
  const [loadedDesignSchema, setLoadedDesignSchema] = useState<any>(null)
  const [showCreateSource, setShowCreateSource] = useState(false)
  const [newSource, setNewSource] = useState({
    code: '',
    name: '',
    dsn: './data/app_demo.db',
    type: 'sqlite',
  })
  const [queryConditions, setQueryConditions] = useState<QueryConditionRow[]>([
    { id: `q-${Date.now()}`, field: '', operator: 'contains', value: '' },
  ])
  const [paginationConfig, setPaginationConfig] = useState({
    pageParam: 'page',
    pageSizeParam: 'page_size',
    limitParam: 'limit',
    offsetParam: 'offset',
    defaultPageSize: 10,
  })
  const [listInterfaceCode, setListInterfaceCode] = useState('')
  const [detailInterfaceCode, setDetailInterfaceCode] = useState('')
  const [bindings, setBindings] = useState<BindingRow[]>([
    {
      id: `b-${Date.now()}`,
      field: '',
      contextKey: '',
      listenTargets: '',
      querySourceType: 'data_interface',
      queryCode: '',
    },
  ])
  const [submitBinding, setSubmitBinding] = useState({
    sourceType: 'data_interface' as 'data_interface' | 'app_interface',
    submitCode: '',
    payloadPath: '$form',
  })

  const engine = useMemo(
    () => {
      const eng = createDesigner({
        rootComponentName: 'Form',
      })
      // Debug: expose engine globally
      ;(window as any).__designable_engine__ = eng
      return eng
    },
    []
  )

  const currentDesignSchemaJSON = () => {
    try {
      return JSON.stringify((transformToSchema as any)(engine.getCurrentTree()))
    } catch {
      return JSON.stringify({ schema: { type: 'object', properties: {} } })
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const [diRes, appRes, srcRes, infoRes, pagesRes] = await Promise.all([
          authed('/api/data/interfaces', 'GET'),
          authed('/api/outbound/apps', 'GET'),
          authed('/api/data/sources', 'GET'),
          id && id !== 'new' ? authed(`/api/form-app/infos/${id}`, 'GET') : Promise.resolve({ data: null }),
          id && id !== 'new' ? authed(`/api/form-app/infos/${id}/pages`, 'GET') : Promise.resolve({ data: [] }),
        ])
        const dis = (diRes?.data || []).map((x: any) => ({
          label: `${x.name || x.code || '未命名'} (${x.code || x.id})`,
          value: String(x.code || x.id || ''),
        }))
        const apps = (appRes?.data || []).map((x: any) => ({
          label: `${x.name || x.app_name || '未命名'} (${x.code || x.id})`,
          value: String(x.code || x.id || ''),
        }))
        const srcs = (srcRes?.data || []).map((x: any) => ({
          id: Number(x.id),
          code: String(x.code || ''),
          name: String(x.name || ''),
          type: String(x.type || ''),
          readOnly: !!x.read_only,
        }))
        setDataInterfaces(dis)
        setAppInterfaces(apps)
        setDataSources(srcs)
        if (!listInterfaceCode && dis[0]) setListInterfaceCode(dis[0].value)
        if (!detailInterfaceCode && dis[0]) setDetailInterfaceCode(dis[0].value)
        if (!submitBinding.submitCode && dis[0]) setSubmitBinding(v => ({ ...v, submitCode: dis[0].value }))
        const info = infoRes?.data
        if (info) {
          setFormCode(String(info.code || ''))
          setFormName(String(info.name || ''))
          if (info.group_id) setSelectedDataSourceID(String(info.group_id))

          const pagesArray = pagesRes?.data || []
          const formPage = pagesArray.find((p: any) => p.page_key === 'form')
          const listPage = pagesArray.find((p: any) => p.page_key === 'list')
          const detailPage = pagesArray.find((p: any) => p.page_key === 'detail')

          try {
            if (listPage?.interface_code) setListInterfaceCode(String(listPage.interface_code))
            if (detailPage?.interface_code) setDetailInterfaceCode(String(detailPage.interface_code))
            if (formPage?.interface_code) {
              setSubmitBinding(v => ({ ...v, submitCode: String(formPage.interface_code || '') }))
            }

            const listConfig = listPage?.config_json ? JSON.parse(listPage.config_json) : {}
            if (listConfig?.pagination) {
              setPaginationConfig(v => ({ ...v, ...listConfig.pagination }))
            }
            if (Array.isArray(listConfig?.query_conditions) && listConfig.query_conditions.length) {
              setQueryConditions(listConfig.query_conditions.map((x: any, idx: number) => ({
                id: `q-load-${idx}-${Date.now()}`,
                field: String(x.field || ''),
                operator: String(x.operator || 'contains'),
                value: String(x.value || ''),
              })))
            }
            setGeneratedReady(!!(listPage?.interface_code && detailPage?.interface_code))
            const runtime = info.runtime_schema ? JSON.parse(info.runtime_schema) : null
            setRuntimeSchemaState(runtime)
            buildPageTree(runtime)
            setFlowStage(!!(listPage?.interface_code && detailPage?.interface_code) ? 'actions' : 'schema')
            setCreatedFormID(String(info.id || ''))
            const design = formPage?.design_schema ? JSON.parse(formPage.design_schema) : null
            if (design) setLoadedDesignSchema(design)
          } catch {
            setGeneratedReady(false)
            setFlowStage('schema')
          }
        } else {
          setFormCode(`form_${Date.now()}`)
          setFormName('新建表单')
          setFlowStage('define')
        }
      } catch (e) {
        setSaveMsg(e instanceof Error ? e.message : '加载配置失败')
      }
    })()
  }, [id])

  useEffect(() => {
    if (!loadedDesignSchema) return
    const timer = setTimeout(() => {
      try {
        const sanitized = JSON.parse(JSON.stringify(loadedDesignSchema), (k, v) => {
          if (k === 'enum' && Array.isArray(v)) return v.filter(x => x != null)
          return v
        })
        const tree = (transformToTreeNode as any)(sanitized)
        engine.setCurrentTree(tree)
      } catch (e) {
        console.error('[FormDesigner] Failed to load schema:', e)
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [loadedDesignSchema, engine])

  useEffect(() => {
    if (!selectedDataSourceID) {
      setSourceTables([])
      setSelectedTable('')
      setTableColumns([])
      return
    }
    ;(async () => {
      try {
        const res = await authed(`/api/data/sources/${selectedDataSourceID}/tables`, 'GET')
        const tables = Array.isArray(res?.data) ? res.data.map((x: any) => String(x)) : []
        setSourceTables(tables)
        if (tables.length && !selectedTable) setSelectedTable(tables[0])
      } catch {
        setSourceTables([])
      }
    })()
  }, [selectedDataSourceID, selectedTable])

  useEffect(() => {
    if (!selectedDataSourceID || !selectedTable) {
      setTableColumns([])
      return
    }
    ;(async () => {
      try {
        const res = await authed(`/api/data/sources/${selectedDataSourceID}/tables/${encodeURIComponent(selectedTable)}/columns`, 'GET')
        const cols = Array.isArray(res?.data)
          ? res.data.map((x: any) => ({ name: String(x.name || ''), primary_key: !!x.primary_key || !!x.primaryKey }))
          : []
        setTableColumns(cols)
        const pk = cols.find((x: TableColumn) => x.primary_key)?.name || 'id'
        setPrimaryKey(pk)
        setQueryConditions(cols.slice(0, 6).map((x: TableColumn, idx: number) => ({
          id: `q-auto-${idx}-${Date.now()}`,
          field: x.name,
          operator: 'contains',
          value: '',
        })))
      } catch {
        setTableColumns([])
      }
    })()
  }, [selectedDataSourceID, selectedTable])

  const optionsByType = (t: 'data_interface' | 'app_interface') =>
    t === 'data_interface' ? dataInterfaces : appInterfaces

  const updateBinding = (id: string, patch: Partial<BindingRow>) => {
    setBindings(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addBinding = () => {
    setBindings(rows => [
      ...rows,
      {
        id: `b-${Date.now()}-${rows.length}`,
        field: '',
        contextKey: '',
        listenTargets: '',
        querySourceType: 'data_interface',
        queryCode: '',
      },
    ])
  }

  const removeBinding = (id: string) => {
    setBindings(rows => rows.filter(r => r.id !== id))
  }

  const addQueryCondition = () => {
    setQueryConditions(rows => [...rows, { id: `q-${Date.now()}-${rows.length}`, field: '', operator: 'contains', value: '' }])
  }

  const updateQueryCondition = (id: string, patch: Partial<QueryConditionRow>) => {
    setQueryConditions(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeQueryCondition = (id: string) => {
    setQueryConditions(rows => rows.filter(r => r.id !== id))
  }

  const createDataSource = async () => {
    const code = newSource.code.trim()
    if (!code) {
      setSaveMsg('新数据源 code 不能为空')
      return
    }
    try {
      const res = await authed('/api/data/sources', 'POST', {
        code,
        name: newSource.name || code,
        type: newSource.type,
        dsn: newSource.dsn,
        read_only: false,
      })
      const created = res?.data
      if (created?.id) {
        const next: DataSourceOption = {
          id: Number(created.id),
          code: String(created.code || code),
          name: String(created.name || code),
          type: String(created.type || newSource.type),
          readOnly: !!created.read_only,
        }
        setDataSources(rows => [next, ...rows])
        setSelectedDataSourceID(String(next.id))
        setShowCreateSource(false)
        setSaveMsg(`已创建数据源 ${next.code}`)
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '创建数据源失败')
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const payload = {
        code: formCode.trim() || `form_${Date.now()}`,
        name: formName.trim() || '未命名表单',
        mode: 'form',
        description: 'Generated by form designer',
      }
      let formID = id && id !== 'new' ? String(id) : ''
      if (!formID) {
        const created = await authed('/api/form-app/infos', 'POST', payload)
        formID = String(created?.data?.id || '')
      } else {
        await authed(`/api/form-app/infos/${formID}`, 'PUT', payload)
      }
      const runtimeSchema = {
        schema_version: '1.0.0',
        datasource: {
          source_id: selectedDataSourceID ? Number(selectedDataSourceID) : null,
          source_query_params: {
            tenant_id: '$context.tenant_id',
            org_id: '$context.org_id',
          },
        },
        pages: {
          form: { submit_interface_code: submitBinding.submitCode },
          list: {
            interface_code: listInterfaceCode,
            pagination: paginationConfig,
            query_conditions: queryConditions
              .filter(x => x.field.trim())
              .map(x => ({ field: x.field, operator: x.operator, value: x.value })),
          },
          detail: { interface_code: detailInterfaceCode },
        },
        bindings: JSON.parse(bindingsJSON).bindings,
        submit_binding: JSON.parse(bindingsJSON).submit_binding,
      }
      await authed(`/api/form-app/infos/${formID}/save-schema`, 'POST', {
        design_schema: currentDesignSchemaJSON(),
        runtime_schema: JSON.stringify(runtimeSchema),
        ui_schema: JSON.stringify({
          mode: 'generated-multi-pages',
        }),
      })
      setSaveMsg('保存成功')
      if (id === 'new') {
        navigate(`/editor/${formID}`)
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const ensureFormID = async () => {
    const payload = {
      code: formCode.trim() || `form_${Date.now()}`,
      name: formName.trim() || '未命名表单',
      mode: 'form',
      description: 'Generated by form designer',
    }
    if (id && id !== 'new') {
      await authed(`/api/form-app/infos/${id}`, 'PUT', payload)
      setCreatedFormID(String(id))
      return String(id)
    }
    const created = await authed('/api/form-app/infos', 'POST', payload)
    const formID = String(created?.data?.id || '')
    setCreatedFormID(formID)
    return formID
  }

  const buildPageTree = (runtime: any) => {
    const pages = runtime?.pages || {}
    const built: PageNodeConfig[] = []
    if (pages.form) {
      built.push({ key: 'form', title: '表单页', interfaceCode: pages.form.submit_interface_code || '', pageType: 'form' })
    }
    if (pages.list) {
      built.push({ key: 'list', title: '列表页', interfaceCode: pages.list.interface_code || '', pageType: 'list' })
    }
    if (pages.detail) {
      built.push({ key: 'detail', title: '详情页', interfaceCode: pages.detail.interface_code || '', pageType: 'detail' })
    }
    Object.keys(pages)
      .filter(k => !['form', 'list', 'detail'].includes(k))
      .forEach(k => built.push({ key: k, title: `扩展页 · ${k}`, interfaceCode: pages[k]?.interface_code || '', pageType: k }))
    setPageTree(built)
  }

  const confirmDefinition = async () => {
    if (!formCode.trim() || !formName.trim()) {
      setSaveMsg('请先填写表单编码和名称')
      return
    }
    try {
      await ensureFormID()
      setFlowStage('schema')
      setSaveMsg('表单定义已确认，请继续选择 schema 和数据源')
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '保存定义失败')
    }
  }

  const resetGenerate = () => {
    setGeneratedReady(false)
    setRuntimeSchemaState(null)
    setPageTree([])
    setListInterfaceCode('')
    setDetailInterfaceCode('')
    setSubmitBinding(v => ({ ...v, submitCode: '' }))
    setFlowStage('schema')
    setConfirmStep({ 1: false, 2: false, 3: false })
  }

  const generateFromDataSourceTable = async () => {
    if (!selectedDataSourceID) {
      setSaveMsg('请先选择数据源')
      return
    }
    if (!selectedTable) {
      setSaveMsg('请先选择数据源表')
      return
    }
    setGenerating(true)
    try {
      const formID = await ensureFormID()
      const res = await authed(`/api/form-app/infos/${formID}/generate-pages-from-table`, 'POST', {
        mode: schemaMode,
        data_source_id: Number(selectedDataSourceID),
        table: selectedTable,
        primary_key: primaryKey || 'id',
      })
      const interfaces = res?.data?.interfaces || {}
      if (interfaces.list) setListInterfaceCode(String(interfaces.list))
      if (interfaces.detail) setDetailInterfaceCode(String(interfaces.detail))
      if (interfaces.submit) setSubmitBinding(v => ({ ...v, submitCode: String(interfaces.submit) }))
      if (!interfaces.submit) setSubmitBinding(v => ({ ...v, submitCode: '' }))
      const runtime = res?.data?.runtime_schema
      setRuntimeSchemaState(runtime)
      buildPageTree(runtime)
      const conds = runtime?.pages?.list?.query_conditions
      if (Array.isArray(conds) && conds.length) {
        setQueryConditions(
          conds.map((x: any, idx: number) => ({
            id: `q-gen-${idx}-${Date.now()}`,
            field: String(x.field || ''),
            operator: String(x.operator || 'contains'),
            value: String(x.value || ''),
          }))
        )
      }
      setSaveMsg('已按数据源表自动生成 form/list/detail 多页面结构并绑定接口')
      setGeneratedReady(true)
      setFlowStage('actions')
      if (id === 'new' && formID) navigate(`/editor/${formID}`)
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '自动生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const executeCreateSchema = async () => {
    if (!selectedDataSourceID) {
      setSaveMsg('请先选择数据源后再创建 schema')
      return
    }
    if (!ddlSQL.trim()) {
      setSaveMsg('请填写建表 DDL')
      return
    }
    try {
      await authed(`/api/data/sources/${selectedDataSourceID}/exec-ddl`, 'POST', { sql: ddlSQL })
      const res = await authed(`/api/data/sources/${selectedDataSourceID}/tables`, 'GET')
      const tables = Array.isArray(res?.data) ? res.data.map((x: any) => String(x)) : []
      setSourceTables(tables)
      if (!selectedTable && tables.length) setSelectedTable(tables[0])
      setSaveMsg('DDL 执行成功，已刷新数据表列表')
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '创建 schema 失败')
    }
  }

  const goPreview = () => {
    const code = encodeURIComponent(formCode || 'demo')
    const query = new URLSearchParams({
      list_if: listInterfaceCode,
      detail_if: detailInterfaceCode,
      submit_if: submitBinding.submitCode,
      editor_id: id && id !== 'new' ? String(id) : '',
    }).toString()
    window.open(`/form-app/generated/${code}/form?${query}`, '_blank')
  }

  const selectedSource = dataSources.find(x => String(x.id) === selectedDataSourceID)
  const canGenerate = !!selectedDataSourceID && !!selectedTable && !!primaryKey
  const canPreview = generatedReady && !!listInterfaceCode && !!detailInterfaceCode
  const isNewFlow = id === 'new'
  const showDesignerCanvas = !isNewFlow || generatedReady
  const canEnterSchemaStage = !!(formCode.trim() && formName.trim())

  const nextStep = () => {
    const stepValid =
      (step === 1 && canGenerate && generatedReady) ||
      (step === 2 && !!listInterfaceCode && !!detailInterfaceCode) ||
      (step === 3 && queryConditions.some(x => x.field.trim() && x.operator.trim()))
    if (!confirmStep[step] || !stepValid) {
      Modal.warning({ title: '请完善当前步骤', content: '请先完成必填配置并勾选确认，再进入下一步。' })
      return
    }
    if (step === 1 && selectedSource?.readOnly) {
      Modal.info({ title: '只读数据源提示', content: '当前数据源为只读，将只生成 list/detail 查询能力。' })
    }
    setStep(s => Math.min(3, s + 1))
  }

  const copyGeneratedPageLink = async (pageType: 'form' | 'list' | 'detail') => {
    const baseID = createdFormID || (id && id !== 'new' ? String(id) : '')
    const qs = new URLSearchParams({
      list_if: listInterfaceCode,
      detail_if: detailInterfaceCode,
      submit_if: submitBinding.submitCode,
      editor_id: baseID,
    }).toString()
    const link = `${window.location.origin}/form-app/generated/${encodeURIComponent(formCode || 'demo')}/${pageType}?${qs}`
    try {
      await navigator.clipboard.writeText(link)
      setSaveMsg(`已复制 ${pageType} 页面链接`)
    } catch {
      setSaveMsg(`链接：${link}`)
    }
  }

  const addCustomPage = async () => {
    const key = window.prompt('输入新增页面标识（如 report）')
    if (!key) return
    const safeKey = key.trim()
    if (!safeKey) return
    const formID = createdFormID || (id && id !== 'new' ? String(id) : '')
    if (!formID) {
      setSaveMsg('请先完成表单定义与生成')
      return
    }
    const nextRuntime = {
      ...(runtimeSchemaState || {}),
      pages: {
        ...((runtimeSchemaState && runtimeSchemaState.pages) || {}),
        [safeKey]: {
          page_type: 'custom',
          title: safeKey,
          from_template: 'form',
        },
      },
    }
    try {
      await authed(`/api/form-app/infos/${formID}/save-schema`, 'POST', {
        design_schema: currentDesignSchemaJSON(),
        runtime_schema: JSON.stringify(nextRuntime),
        ui_schema: JSON.stringify({
          mode: 'generated-multi-pages',
        }),
      })
      setRuntimeSchemaState(nextRuntime)
      buildPageTree(nextRuntime)
      setSaveMsg(`已新增页面定义：${safeKey}`)
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '新增页面失败')
    }
  }

  const updatePageNodeInterface = (key: string, code: string) => {
    setPageTree(nodes => nodes.map(n => (n.key === key ? { ...n, interfaceCode: code } : n)))
  }

  const savePageStructureConfig = async () => {
    const formID = createdFormID || (id && id !== 'new' ? String(id) : '')
    if (!formID || !runtimeSchemaState) {
      setSaveMsg('请先完成表单生成')
      return
    }
    const next = JSON.parse(JSON.stringify(runtimeSchemaState))
    next.pages = next.pages || {}
    pageTree.forEach(node => {
      const p = next.pages[node.key] || {}
      if (node.key === 'form') {
        p.submit_interface_code = node.interfaceCode || ''
      } else {
        p.interface_code = node.interfaceCode || ''
      }
      p.page_type = node.pageType
      next.pages[node.key] = p
    })
    try {
      await authed(`/api/form-app/infos/${formID}/save-schema`, 'POST', {
        design_schema: currentDesignSchemaJSON(),
        runtime_schema: JSON.stringify(next),
        ui_schema: JSON.stringify({ mode: 'generated-multi-pages' }),
      })
      setRuntimeSchemaState(next)
      setSaveMsg('页面结构与接口配置已保存')
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '保存页面结构失败')
    }
  }

  const openPageNodeTab = (node: PageNodeConfig) => {
    const baseID = createdFormID || (id && id !== 'new' ? String(id) : '')
    const query = new URLSearchParams({
      list_if: listInterfaceCode,
      detail_if: detailInterfaceCode,
      submit_if: submitBinding.submitCode,
      editor_id: baseID,
    })
    window.open(`/form-app/generated/${encodeURIComponent(formCode || 'demo')}/${encodeURIComponent(node.pageType)}?${query.toString()}`, '_blank')
  }

  const bindingsJSON = JSON.stringify(
    {
      bindings: bindings
        .filter(b => b.field.trim())
        .map(b => ({
          field: b.field.trim(),
          context_key: b.contextKey.trim() || b.field.trim(),
          listen_targets: b.listenTargets
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          query_source_type: b.querySourceType,
          query_interface_code: b.queryCode,
        })),
      submit_binding: {
        source_type: submitBinding.sourceType,
        submit_interface_code: submitBinding.submitCode,
        payload_path: submitBinding.payloadPath,
      },
    },
    null,
    2
  )

  return (
    <div className="designer-page">
      <header className="header">
        <h1>Designer</h1>
        <p>Formily Designable 编辑器，当前 ID: {id}</p>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={saveConfig} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button type="button" onClick={goPreview} disabled={!canPreview}>预览生成页面</button>
          <button type="button" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step <= 1}>上一步</button>
          <button type="button" onClick={nextStep} disabled={step >= 3}>下一步确认</button>
          {generatedReady && (
            <button type="button" onClick={resetGenerate} style={{ color: '#dc2626' }}>重新生成</button>
          )}
          <span>当前步骤：{step}/3</span>
        </div>
        {saveMsg && <div style={{ marginTop: 8, color: '#1d4ed8' }}>{saveMsg}</div>}
      </header>
      <div className="designer-layout">
        {showDesignerCanvas ? (
          <div className="designer-shell">
            <Designer engine={engine}>
              <StudioPanel>
                <CompositePanel>
                  <CompositeItem title="Components" icon="Component">
                    <ResourceWidget title="Inputs" sources={[Input, Password, NumberPicker, Rate, Slider, Select, TreeSelect, Cascader, Transfer, Checkbox, Radio, DatePicker, TimePicker, Upload, Switch, ObjectContainer]} />
                    <ResourceWidget title="Layouts" sources={[Card, FormGrid, FormTab, FormLayout, FormCollapse, Space]} />
                    <ResourceWidget title="Arrays" sources={[ArrayCards, ArrayTable]} />
                    <ResourceWidget title="Displays" sources={[Text, SubmitButton, ConfirmDialogButton]} />
                  </CompositeItem>
                  <CompositeItem title="Outline" icon="Outline">
                    <OutlineTreeWidget />
                  </CompositeItem>
                  <CompositeItem title="History" icon="History">
                    <HistoryWidget />
                  </CompositeItem>
                </CompositePanel>
                <Workbench>
                  <WorkspacePanel>
                    <ToolbarPanel>
                      <DesignerToolsWidget />
                      <ViewToolsWidget use={['DESIGNABLE']} />
                    </ToolbarPanel>
                    <ViewportPanel style={{ height: '100%' }}>
                      <ViewPanel type="DESIGNABLE">
                        {() => <ComponentTreeWidget components={componentMap} />}
                      </ViewPanel>
                    </ViewportPanel>
                  </WorkspacePanel>
                </Workbench>
                <SettingsPanel title="Properties">
                  <SettingsForm uploadAction="/api/scada/resource/upload/widget" />
                </SettingsPanel>
              </StudioPanel>
            </Designer>
          </div>
        ) : (
          <div className="designer-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="panel" style={{ maxWidth: 680 }}>
              <h3>新建表单引导</h3>
              <p>请先在右侧完成：选择/创建 schema → 选择数据源表 → 一键生成多页面结构。完成后自动进入表单编辑器。</p>
              <p>当前状态：{generatedReady ? '已生成，可编辑' : '未生成'}</p>
            </div>
          </div>
        )}
        <aside className="designer-binding">
          <div className="binding-panel">
            <div className="binding-item">
              <strong>Step 1 · 基础配置（表单 / 列表 / 详情）</strong>
              <div className="binding-row">
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="表单名称" />
                <input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="表单编码（唯一）" />
              </div>
              <div className="binding-row">
                <button type="button" onClick={confirmDefinition} disabled={!canEnterSchemaStage}>确认表单定义并进入 schema 配置</button>
                <span style={{ fontSize: 12, color: '#334155' }}>当前阶段：{flowStage}</span>
              </div>
              <div className="binding-row">
                <select value={schemaMode} onChange={e => setSchemaMode(e.target.value as 'select_schema' | 'create_schema')}>
                  <option value="select_schema">选择数据源 schema</option>
                  <option value="create_schema">创建 schema（执行 DDL）</option>
                </select>
                <select value={selectedDataSourceID} onChange={e => setSelectedDataSourceID(e.target.value)}>
                  <option value="">选择数据源</option>
                  {dataSources.map(s => (
                    <option key={s.id} value={String(s.id)}>{`${s.name} (${s.code})`}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowCreateSource(v => !v)}>
                  {showCreateSource ? '取消新建数据源' : '配置新数据源'}
                </button>
              </div>
              {schemaMode === 'create_schema' && (
                <div className="binding-item">
                  <textarea
                    value={ddlSQL}
                    onChange={e => setDdlSQL(e.target.value)}
                    placeholder="输入 CREATE/ALTER DDL，例如: CREATE TABLE demo_form (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, dept TEXT, remark TEXT);"
                    rows={4}
                  />
                  <button type="button" onClick={executeCreateSchema}>执行 DDL 并刷新表</button>
                </div>
              )}
              <div className="binding-row">
                <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)}>
                  <option value="">选择数据表</option>
                  {sourceTables.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select value={primaryKey} onChange={e => setPrimaryKey(e.target.value)}>
                  <option value="id">主键字段</option>
                  {tableColumns.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <button type="button" onClick={generateFromDataSourceTable} disabled={generating || !canGenerate}>
                  {generating ? '生成中...' : '一键生成多页面结构'}
                </button>
                {generatedReady && (
                  <button type="button" onClick={resetGenerate} style={{ color: '#dc2626' }}>
                    重新生成
                  </button>
                )}
              </div>
              {flowStage === 'actions' && (
                <div className="binding-item">
                  <strong>页面结构树（点击节点新标签维护）</strong>
                  <div className="page-tree">
                    {pageTree.map(node => (
                      <div className="page-tree-node" key={node.key}>
                        <div className="node-left">
                          <span className="node-dot" />
                          <strong>{node.title}</strong>
                        </div>
                        <div className="node-right">
                          <input
                            value={node.interfaceCode || ''}
                            onChange={e => updatePageNodeInterface(node.key, e.target.value)}
                            placeholder={node.key === 'form' ? 'submit_interface_code' : 'interface_code'}
                          />
                          <button type="button" onClick={() => openPageNodeTab(node)}>维护页面</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={savePageStructureConfig}>保存页面结构配置</button>
                </div>
              )}
              {flowStage === 'actions' && (
                <div className="binding-item">
                  <strong>生成后快捷操作</strong>
                  <div className="binding-row">
                    <button type="button" onClick={() => createdFormID && navigate(`/editor/${createdFormID}`)} disabled={!createdFormID}>进入编辑器</button>
                    <button type="button" onClick={() => copyGeneratedPageLink('form')} disabled={!generatedReady}>复制表单页链接</button>
                    <button type="button" onClick={() => copyGeneratedPageLink('list')} disabled={!generatedReady}>复制列表页链接</button>
                    <button type="button" onClick={() => copyGeneratedPageLink('detail')} disabled={!generatedReady}>复制详情页链接</button>
                    <button type="button" onClick={addCustomPage} disabled={!generatedReady}>新增其他页面</button>
                    <button type="button" onClick={resetGenerate} style={{ color: '#dc2626' }} disabled={!generatedReady}>重新生成</button>
                  </div>
                </div>
              )}
              {selectedSource?.readOnly && (
                <div style={{ color: '#b45309', fontSize: 12 }}>当前数据源为只读：将降级为仅查询页面（list/detail）。</div>
              )}
              {!generatedReady && (
                <div style={{ color: '#334155', fontSize: 12 }}>请先点击“一键生成多页面结构”，再进入后续步骤。</div>
              )}
              {showCreateSource && (
                <div className="binding-item">
                  <input value={newSource.code} onChange={e => setNewSource(v => ({ ...v, code: e.target.value }))} placeholder="source code" />
                  <input value={newSource.name} onChange={e => setNewSource(v => ({ ...v, name: e.target.value }))} placeholder="source name" />
                  <div className="binding-row">
                    <select value={newSource.type} onChange={e => setNewSource(v => ({ ...v, type: e.target.value }))}>
                      <option value="sqlite">sqlite</option>
                      <option value="mysql">mysql</option>
                    </select>
                    <input value={newSource.dsn} onChange={e => setNewSource(v => ({ ...v, dsn: e.target.value }))} placeholder="dsn" />
                  </div>
                  <button type="button" onClick={createDataSource}>创建数据源</button>
                </div>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={!!confirmStep[1]}
                  onChange={e => setConfirmStep(v => ({ ...v, 1: e.target.checked }))}
                />
                确认该步骤配置
              </label>
            </div>

            <div className="binding-item">
              <strong>Step 2 · 页面接口与标准分页参数</strong>
              <div className="binding-row">
                <select value={listInterfaceCode} onChange={e => setListInterfaceCode(e.target.value)}>
                  <option value="">列表接口</option>
                  {dataInterfaces.map(op => <option key={`li-${op.value}`} value={op.value}>{op.label}</option>)}
                </select>
                <select value={detailInterfaceCode} onChange={e => setDetailInterfaceCode(e.target.value)}>
                  <option value="">详情接口</option>
                  {dataInterfaces.map(op => <option key={`di-${op.value}`} value={op.value}>{op.label}</option>)}
                </select>
              </div>
              <div className="binding-row">
                <input value={paginationConfig.pageParam} onChange={e => setPaginationConfig(v => ({ ...v, pageParam: e.target.value }))} placeholder="page 参数名" />
                <input value={paginationConfig.pageSizeParam} onChange={e => setPaginationConfig(v => ({ ...v, pageSizeParam: e.target.value }))} placeholder="page_size 参数名" />
              </div>
              <div className="binding-row">
                <input value={paginationConfig.limitParam} onChange={e => setPaginationConfig(v => ({ ...v, limitParam: e.target.value }))} placeholder="limit 参数名" />
                <input value={paginationConfig.offsetParam} onChange={e => setPaginationConfig(v => ({ ...v, offsetParam: e.target.value }))} placeholder="offset 参数名" />
              </div>
              <div className="binding-row">
                <input
                  type="number"
                  value={String(paginationConfig.defaultPageSize)}
                  onChange={e => setPaginationConfig(v => ({ ...v, defaultPageSize: Number(e.target.value || 10) }))}
                  placeholder="默认分页大小"
                />
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={!!confirmStep[2]}
                  onChange={e => setConfirmStep(v => ({ ...v, 2: e.target.checked }))}
                />
                确认该步骤配置
              </label>
            </div>

            <div className="binding-item">
              <strong>Step 3 · Query 多条件查询模式</strong>
              <button type="button" onClick={addQueryCondition}>新增查询条件</button>
              {queryConditions.map(row => (
                <div className="binding-row" key={row.id}>
                  <input value={row.field} onChange={e => updateQueryCondition(row.id, { field: e.target.value })} placeholder="字段名" />
                  <select value={row.operator} onChange={e => updateQueryCondition(row.id, { operator: e.target.value })}>
                    {QUERY_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input value={row.value} onChange={e => updateQueryCondition(row.id, { value: e.target.value })} placeholder="值/表达式" />
                  <button type="button" className="danger" onClick={() => removeQueryCondition(row.id)}>删除</button>
                </div>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={!!confirmStep[3]}
                  onChange={e => setConfirmStep(v => ({ ...v, 3: e.target.checked }))}
                />
                确认该步骤配置
              </label>
            </div>

            <div className="binding-head">
              <strong>数据绑定配置</strong>
              <button type="button" onClick={addBinding}>新增字段绑定</button>
            </div>
            <div className="binding-item">
              <strong>提交接口绑定（仅提交时生效）</strong>
              <div className="binding-row">
                <select
                  value={submitBinding.sourceType}
                  onChange={e => setSubmitBinding(v => ({ ...v, sourceType: e.target.value as any, submitCode: '' }))}
                >
                  <option value="data_interface">数据提交接口</option>
                  <option value="app_interface">应用提交接口</option>
                </select>
                <select
                  value={submitBinding.submitCode}
                  onChange={e => setSubmitBinding(v => ({ ...v, submitCode: e.target.value }))}
                >
                  <option value="">选择提交接口</option>
                  {optionsByType(submitBinding.sourceType).map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>
              <input
                value={submitBinding.payloadPath}
                onChange={e => setSubmitBinding(v => ({ ...v, payloadPath: e.target.value }))}
                placeholder="提交数据路径（默认 $form）"
              />
            </div>
            {bindings.map(row => (
              <div className="binding-item" key={row.id}>
                <input
                  placeholder="字段标识（如 dept）"
                  value={row.field}
                  onChange={e => updateBinding(row.id, { field: e.target.value })}
                />
                <div className="binding-row">
                  <input
                    placeholder="写入 Context key（如 ctx.dept）"
                    value={row.contextKey}
                    onChange={e => updateBinding(row.id, { contextKey: e.target.value })}
                  />
                  <input
                    placeholder="监听该字段变化的组件（逗号分隔）"
                    value={row.listenTargets}
                    onChange={e => updateBinding(row.id, { listenTargets: e.target.value })}
                  />
                </div>
                <div className="binding-row">
                  <select
                    value={row.querySourceType}
                    onChange={e => updateBinding(row.id, { querySourceType: e.target.value as any, queryCode: '' })}
                  >
                    <option value="data_interface">数据接口查询</option>
                    <option value="app_interface">应用接口查询</option>
                  </select>
                  <select
                    value={row.queryCode}
                    onChange={e => updateBinding(row.id, { queryCode: e.target.value })}
                  >
                    <option value="">选择查询接口</option>
                    {optionsByType(row.querySourceType).map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="danger" onClick={() => removeBinding(row.id)}>
                  删除
                </button>
              </div>
            ))}
            <pre className="result-box">{bindingsJSON}</pre>
          </div>
        </aside>
      </div>
    </div>
  )
}
