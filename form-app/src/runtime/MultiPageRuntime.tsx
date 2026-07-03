import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/toaster'
import { message } from '@/lib/message'
import RuntimeAgentBar from './RuntimeAgentBar'
import SchemaFormRenderer from './SchemaFormRenderer'
import { resolveLibrary } from './endResolver'
import { fieldDefsToSchema } from '@/pages/schemaConverter'
import ListRenderer from './ListRenderer'
import DetailRenderer from './DetailRenderer'
import { setupEventListener, setGlobalEventBlocked } from './EventHandler'
import { navigationManager } from './NavigationManager'
import { createAppState } from './appState'
import { AppStateContext } from './AppStateContext'
import { setupAppEvents, type ActivePageRef } from './setupAppEvents'
import type { StateScope } from './pageState'
import type { PageEvent } from './eventTypes'
import { parseBindingsFromRuntimeSchema, rowsToOptions } from './fieldLogic'
import { doPrintViaBridge } from './printBridge'
import { isAgentRuntime, runtimeFetch } from './runtimeAuth'
import type { FieldDef, FieldOption } from './types'

async function authed(path: string, method: string, body?: any) {
  return runtimeFetch(path, method, body)
}

type MultiPageRuntimeProps = {
  formAppCode: string
  entryPageKey?: string
}

export default function MultiPageRuntime({ formAppCode, entryPageKey = 'form' }: MultiPageRuntimeProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  // 内嵌预览（iframe）模式：隐藏页面导航与 URL 栏，避免与外层预览面板重复、挤占设备屏幕。
  const embedded = searchParams.get('embed') === '1' || isAgentRuntime()

  const [app, setApp] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [currentPageKey, setCurrentPageKey] = useState('')
  const [params, setParams] = useState<Record<string, any>>({})
  const [navOpen, setNavOpen] = useState(true)
  const didInit = useRef(false)

  const bindings = useMemo(
    () => parseBindingsFromRuntimeSchema(app?.runtime_schema),
    [app?.runtime_schema],
  )

  const fetchOptions = useCallback(async (interfaceCode: string, paramValues: Record<string, any>): Promise<FieldOption[]> => {
    const queryPath = isAgentRuntime()
      ? '/api/form-app/agent-runtime/query'
      : '/api/form-app/runtime/query'
    const res = await authed(queryPath, 'POST', {
      interface_code: interfaceCode,
      form_code: formAppCode,
      param_values: paramValues,
    })
    const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res?.data) ? res.data : []
    return rowsToOptions(rows)
  }, [formAppCode])

  const navigate = useCallback((pageKey: string, navParams: Record<string, any> = {}) => {
    navigationManager.push(pageKey, navParams)
  }, [])

  // 应用级共享状态：按 formAppCode 实例化（绝不模块单例，避免多 form-app 串状态）。
  // 切换 form-app（code 变）会重建并 dispose 旧实例 → 天然隔离。
  const appState = useMemo(() => createAppState(formAppCode), [formAppCode])
  useEffect(() => () => appState.dispose(), [appState])
  // 当前活动页 pageState 的间接持有者：活动页（SchemaFormRenderer）挂载时 set、卸载置 null
  const activePageRef = useRef<ActivePageRef>({ current: null })
  const registerActivePage = useCallback((s: StateScope | null) => {
    activePageRef.current.current = s
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        let loadedApp: any = null
        let loadedPages: any[] = []

        if (isAgentRuntime()) {
          const boot = await authed(`/api/form-app/agent-runtime/${formAppCode}/bootstrap`, 'GET')
          loadedApp = boot.data.app
          loadedPages = boot.data.pages || []
          setApp(loadedApp)
          setPages(loadedPages)
          setLinks(boot.data.links || [])
        } else {
          const appRes = await authed(`/api/form-app/infos/code/${formAppCode}`, 'GET')
          loadedApp = appRes.data
          setApp(loadedApp)
          const [pagesRes, linksRes] = await Promise.all([
            authed(`/api/form-app/infos/${loadedApp.id}/pages`, 'GET'),
            authed(`/api/form-app/infos/${loadedApp.id}/links`, 'GET'),
          ])
          loadedPages = pagesRes.data || []
          setPages(loadedPages)
          setLinks(linksRes.data || [])
        }

        // 初始页面定位（只跑一次，避免 URL 回写触发重新加载死循环）
        if (!didInit.current) {
          didInit.current = true
          // 读取 URL：page=xxx 指定初始页，p_* 前缀解析为初始参数
          const urlPageKey = searchParams.get('page')?.trim() || ''
          const initialParams: Record<string, any> = {}
          searchParams.forEach((v, k) => {
            if (k.startsWith('p_')) initialParams[k.slice(2)] = v
          })

          let initialPageKey = urlPageKey
          if (!initialPageKey && loadedApp?.entry_page_key) {
            initialPageKey = loadedApp.entry_page_key
          }
          if (!initialPageKey) {
            initialPageKey = entryPageKey
          }
          if (!loadedPages.find(p => p.page_key === initialPageKey) && loadedPages.length > 0) {
            initialPageKey = loadedPages[0].page_key
          }
          navigationManager.push(initialPageKey, initialParams)
        }
      } catch (e: any) {
        message.error(e.message)
      }
    }
    load()

    const unsubNav = navigationManager.onChange(state => {
      setCurrentPageKey(state.pageKey)
      setParams(state.params)
    })

    return () => {
      unsubNav()
      navigationManager.clear()
    }
  }, [formAppCode])

  // 当前页与参数 → 同步到地址栏（page=xxx & p_yyy=zzz），便于复制/复现
  useEffect(() => {
    if (embedded) return // 内嵌预览不改写地址栏
    if (!currentPageKey) return
    const next = new URLSearchParams()
    next.set('page', currentPageKey)
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') next.set(`p_${k}`, String(v))
    })
    setSearchParams(next, { replace: true })
  }, [currentPageKey, params, embedded])

  useEffect(() => {
    if (!app?.id) return
    const token = localStorage.getItem('token') || ''
    return setupEventListener(formAppCode, app.id, token, (pageKey, eventParams) => {
      navigate(pageKey, eventParams)
    })
  }, [app?.id, formAppCode, navigate])

  // app 级常驻事件流：源自 FormAppInfo.global_config.events（scope==='app'），
  // 在 form-app 加载后注册一次、跨页面存活，离开时清理。
  useEffect(() => {
    if (!app) return
    let globalCfg: any = {}
    try { globalCfg = app.global_config ? JSON.parse(app.global_config) : {} } catch { globalCfg = {} }
    const appEvents: PageEvent[] = Array.isArray(globalCfg.events)
      ? globalCfg.events.filter((e: PageEvent) => e?.scope === 'app')
      : []
    if (appEvents.length === 0) return

    const onScanInterface = async (interfaceCode: string, paramValues: Record<string, any>, type: 'internal' | 'third_party' | 'connector' = 'internal', endpointId?: number) => {
      if (type === 'connector') {
        const res = await authed('/api/outbound/connector-interfaces/call', 'POST', { connector_code: interfaceCode, params: paramValues })
        return res.data || {}
      }
      if (type === 'third_party') {
        if (!endpointId) throw new Error('endpoint_id is required for third_party interface')
        const res = await authed(`/api/outbound/endpoints/${endpointId}/call`, 'POST', { param_values: paramValues })
        return res.data || {}
      }
      const submitPath = isAgentRuntime() ? '/api/form-app/agent-runtime/submit' : '/api/form-app/runtime/submit'
      const res = await authed(submitPath, 'POST', { interface_code: interfaceCode, form_code: formAppCode, param_values: paramValues })
      return res?.data ?? res?.rows ?? res ?? {}
    }

    const appPrinters = Array.isArray(globalCfg.printers) ? globalCfg.printers : []
    return setupAppEvents(appEvents, {
      appState,
      formAppCode,
      activePageRef: activePageRef.current,
      onScanInterface,
      doPrint: async (templateId, values, extra) => doPrintViaBridge(appPrinters, templateId, values, extra),
      navigate,
      toast: (msg: string) => message.info(msg),
    })
  }, [app, formAppCode, appState, navigate])

  // 切换页面时根据 block_global_events 配置通知 Agent 屏蔽/恢复全局事件
  useEffect(() => {
    const page = pages.find(p => p.page_key === currentPageKey)
    if (!page) return
    const cfg = page.config_json ? JSON.parse(page.config_json) : {}
    setGlobalEventBlocked(!!cfg.block_global_events)
    return () => setGlobalEventBlocked(false)
  }, [currentPageKey, pages])

  const goBack = () => {
    navigationManager.pop()
  }

  const currentPage = pages.find(p => p.page_key === currentPageKey)

  // 左侧页面导航 + 顶部 URL 展示（无论当前页是否存在都渲染）
  const fullUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?${searchParams.toString()}`
    : ''

  const sideNav = embedded ? null : (
    <div style={{
      width: navOpen ? 220 : 0, flexShrink: 0, overflow: 'hidden',
      borderRight: navOpen ? '1px solid #e5e7eb' : 'none', background: '#fafafa',
      transition: 'width .2s',
    }}>
      <div style={{ padding: '12px 12px 6px', fontWeight: 600, color: '#555' }}>页面列表</div>
      <div style={{ overflowY: 'auto' }}>
        {pages.map(p => (
          <div
            key={p.page_key}
            onClick={() => navigate(p.page_key)}
            style={{
              padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: p.page_key === currentPageKey ? '#e6f4ff' : 'transparent',
              borderLeft: p.page_key === currentPageKey ? '3px solid #1677ff' : '3px solid transparent',
            }}
          >
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              p.page_type === 'form' ? 'bg-blue-100 text-blue-800' :
              p.page_type === 'list' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {p.page_type}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.title || p.page_key}
            </span>
          </div>
        ))}
        {pages.length === 0 && <div style={{ padding: 12, color: '#999' }}>暂无页面</div>}
      </div>
    </div>
  )

  const urlBar = embedded ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
      <Button size="sm" variant="outline" onClick={() => setNavOpen(v => !v)}>{navOpen ? '«' : '»'}</Button>
      <Input readOnly value={fullUrl} className="flex-1" />
      <Button
        size="sm"
        variant="outline"
        title="复制链接"
        onClick={() => {
          navigator.clipboard?.writeText(fullUrl).then(
            () => message.success('已复制链接'),
            () => message.error('复制失败'),
          )
        }}
      >
        复制
      </Button>
    </div>
  )

  if (!currentPage) {
    return (
      <div style={{ display: 'flex', height: '100%' }}>
        {sideNav}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {urlBar}
          <div style={{ padding: 24, color: '#999' }}>
            {pages.length > 0 ? '请选择左侧页面' : `页面不存在: ${currentPageKey}`}
          </div>
        </div>
      </div>
    )
  }

  const config = currentPage.config_json ? JSON.parse(currentPage.config_json) : {}
  const fields: FieldDef[] = config.field_definitions || config.fields || []
  // 有 design_schema（Formily 布局）时运行时按布局渲染；否则回退扁平 field_definitions
  let designSchema: any = null
  if (currentPage.design_schema) {
    try { designSchema = JSON.parse(currentPage.design_schema) } catch { designSchema = null }
  }
  const hasLayoutSchema = !!(designSchema?.schema?.properties)
  // 统一走 Formily 核心：无 design_schema 时用 field_definitions 即时生成 schema，
  // 保证非表单布局组件（页头/分区/图片等）与字段在同一套渲染器下显示。
  const effectiveSchema = hasLayoutSchema ? designSchema : fieldDefsToSchema(fields)
  const hasRenderableForm = !!(effectiveSchema?.schema?.properties && Object.keys(effectiveSchema.schema.properties).length > 0)
  // 多端：按页面 end_strategy + 运行环境解析组件库（桌面 antd / 移动 antd-mobile）
  const libraryKey = resolveLibrary(config.end_strategy)
  const scannerConfig = config.scanner
  const pageEvents = Array.isArray(config.events) ? config.events : []
  const printerTemplates = Array.isArray(config.printers) ? config.printers : []
  // 草稿自动保存：默认关闭，由页面配置 enable_draft 开关控制
  const enableDraft = !!config.enable_draft
  const submitPath = isAgentRuntime()
    ? '/api/form-app/agent-runtime/submit'
    : '/api/form-app/runtime/submit'
  const queryPath = isAgentRuntime()
    ? '/api/form-app/agent-runtime/query'
    : '/api/form-app/runtime/query'

  // 当前页面发出的 links
  const pageLinks = links.filter(l => l.from_page_key === currentPageKey)
  const buttonLinks = pageLinks.filter(l => l.trigger_type === 'button_click')
  const rowClickLink = pageLinks.find(l => l.trigger_type === 'row_click')

  // button_click link 的跳转：解析 param_mapping，支持 $row.xxx 占位和 $url.xxx（从当前 URL 参数）
  const resolveLinkParams = (mapping: string | undefined, row?: any): Record<string, any> => {
    if (!mapping) return {}
    try {
      const m = JSON.parse(mapping)
      const out: Record<string, any> = {}
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'string') {
          if (v.startsWith('$row.') && row) {
            out[k] = row[v.slice(5)]
          } else if (v.startsWith('$url.')) {
            // 从当前页面 URL 参数中获取
            const urlParamKey = v.slice(5)
            out[k] = params[urlParamKey]
          } else {
            out[k] = v
          }
        } else {
          out[k] = v
        }
      }
      return out
    } catch { return {} }
  }

  // row click 路由
  const handleRowClick = (row: any) => {
    if (rowClickLink) {
      navigate(rowClickLink.to_page_key, resolveLinkParams(rowClickLink.param_mapping, row))
    }
  }

  return (
    <AppStateContext.Provider value={appState}>
    <div style={{ display: 'flex', height: '100%' }}>
      {sideNav}
      <div className="form-app-runtime" style={{ flex: 1, overflowY: 'auto' }}>
        {urlBar}
        <RuntimeAgentBar />
      {navigationManager.canGoBack() && (
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
          <Button variant="outline" onClick={goBack}>← 返回</Button>
        </div>
      )}
      {(currentPage.page_type === 'form' || currentPage.page_type === 'custom') && (() => {
        const onScanInterface = async (interfaceCode: string, paramValues: Record<string, any>, type: 'internal' | 'third_party' | 'connector' = 'internal', endpointId?: number) => {
          if (type === 'connector') {
            const res = await authed('/api/outbound/connector-interfaces/call', 'POST', {
              connector_code: interfaceCode,
              params: paramValues,
            })
            return res.data || {}
          }
          if (type === 'third_party') {
            if (!endpointId) {
              throw new Error('endpoint_id is required for third_party interface')
            }
            const res = await authed(`/api/outbound/endpoints/${endpointId}/call`, 'POST', {
              param_values: paramValues,
            })
            return res.data || {}
          }
          const res = await authed(submitPath, 'POST', {
            interface_code: interfaceCode,
            form_code: formAppCode,
            page_key: currentPageKey,
            param_values: paramValues,
          })
          // 与 connector/third_party 保持一致：返回解包后的数据对象
          return res?.data ?? res?.rows ?? res ?? {}
        }
        const onFormSubmit = async (values: Record<string, any>) => {
          await authed(submitPath, 'POST', {
            interface_code: currentPage.interface_code,
            form_code: formAppCode,
            page_key: currentPageKey,
            param_values: values,
          })
        }
        return hasRenderableForm ? (
          <SchemaFormRenderer
            designSchema={effectiveSchema}
            bindings={bindings}
            initialValues={params}
            formCode={formAppCode}
            pageKey={currentPageKey}
            libraryKey={libraryKey}
            enableDraft={enableDraft}
            onActivePageState={registerActivePage}
            showDefaultSubmit={!!config.show_default_submit}
            onQueryOptions={fetchOptions}
            scannerConfig={scannerConfig}
            events={pageEvents}
            onScanInterface={onScanInterface}
            doPrint={(templateId, values, extra) => doPrintViaBridge(printerTemplates, templateId, values, extra)}
            onNavigate={navigate}
            onSubmit={onFormSubmit}
          />
        ) : (
          <div style={{ padding: 24, color: '#999' }}>该页面暂无可渲染内容，请在设计器中添加字段或布局组件。</div>
        )
      })()}
      {currentPage.page_type === 'list' && (
        <ListRenderer
          fields={fields}
          bindings={bindings}
          queryConditions={config.query_conditions || []}
          onFetchOptions={fetchOptions}
          onQuery={async queryParams => {
            const res = await authed(queryPath, 'POST', {
              interface_code: currentPage.interface_code,
              form_code: formAppCode,
              page_key: currentPageKey,
              page_type: 'list',
              param_values: queryParams,
            })
            return { data: res.rows || res.data || [], total: res.total || 0 }
          }}
          onRowClick={rowClickLink ? handleRowClick : undefined}
          onNew={buttonLinks.length > 0
            ? () => navigate(buttonLinks[0].to_page_key, resolveLinkParams(buttonLinks[0].param_mapping))
            : undefined
          }
          newButtonLabel={buttonLinks[0]?.trigger_config || '新增'}
        />
      )}
      {currentPage.page_type === 'detail' && (
        <DetailRenderer
          fields={fields}
          onLoad={async () => {
            const res = await authed(queryPath, 'POST', {
              interface_code: currentPage.interface_code,
              form_code: formAppCode,
              page_key: currentPageKey,
              param_values: params,
            })
            return res.rows?.[0] || res.data?.[0] || {}
          }}
          onBack={goBack}
        />
      )}
      </div>
    </div>
    <Toaster />
    </AppStateContext.Provider>
  )
}
