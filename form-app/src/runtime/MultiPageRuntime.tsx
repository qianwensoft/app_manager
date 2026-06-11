import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { message, Button } from 'antd'
import RuntimeAgentBar from './RuntimeAgentBar'
import FormRenderer from './FormRenderer'
import ListRenderer from './ListRenderer'
import DetailRenderer from './DetailRenderer'
import { setupEventListener, setGlobalEventBlocked } from './EventHandler'
import { navigationManager } from './NavigationManager'
import { parseBindingsFromRuntimeSchema, rowsToOptions } from './fieldLogic'
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
  const [searchParams] = useSearchParams()
  const urlPageKey = searchParams.get('page')?.trim() || ''

  const [app, setApp] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [currentPageKey, setCurrentPageKey] = useState('')
  const [params, setParams] = useState<Record<string, any>>({})

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

        // 确定初始页面：URL 参数 > 应用配置的 entry_page_key > 传入的 entryPageKey > 第一个页面
        let initialPageKey = urlPageKey
        if (!initialPageKey && loadedApp?.entry_page_key) {
          initialPageKey = loadedApp.entry_page_key
        }
        if (!initialPageKey) {
          initialPageKey = entryPageKey
        }
        // 如果指定的页面不存在，使用第一个可用页面
        if (!loadedPages.find(p => p.page_key === initialPageKey) && loadedPages.length > 0) {
          initialPageKey = loadedPages[0].page_key
        }

        navigationManager.push(initialPageKey)
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
  }, [formAppCode, urlPageKey, entryPageKey])

  useEffect(() => {
    if (!app?.id) return
    const token = localStorage.getItem('token') || ''
    return setupEventListener(formAppCode, app.id, token, (pageKey, eventParams) => {
      navigate(pageKey, eventParams)
    })
  }, [app?.id, formAppCode, navigate])

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
  if (!currentPage) return <div style={{ padding: 24 }}>页面不存在: {currentPageKey}</div>

  const config = currentPage.config_json ? JSON.parse(currentPage.config_json) : {}
  const fields: FieldDef[] = config.field_definitions || []
  const scannerConfig = config.scanner
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

  // button_click link 的跳转：解析 param_mapping，支持 $row.xxx 占位
  const resolveLinkParams = (mapping: string | undefined, row?: any): Record<string, any> => {
    if (!mapping) return {}
    try {
      const m = JSON.parse(mapping)
      if (!row) return m
      const out: Record<string, any> = {}
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'string' && v.startsWith('$row.')) {
          out[k] = row[v.slice(5)]
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
    <div className="form-app-runtime">
      <RuntimeAgentBar />
      {navigationManager.canGoBack() && (
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
          <Button onClick={goBack}>← 返回</Button>
        </div>
      )}
      {currentPage.page_type === 'form' && (
        <FormRenderer
          fields={fields}
          bindings={bindings}
          initialValues={params}
          formCode={formAppCode}
          pageKey={currentPageKey}
          onQueryOptions={fetchOptions}
          scannerConfig={scannerConfig}
          onScanInterface={async (interfaceCode, paramValues, type = 'internal', endpointId) => {
            if (type === 'connector') {
              // 调用连接器接口
              const res = await authed('/api/outbound/connector-interfaces/call', 'POST', {
                connector_code: interfaceCode,
                params: paramValues,
              })
              return res.data || {}
            }
            if (type === 'third_party') {
              // 调用外部应用接口（OutboundEndpoint）
              if (!endpointId) {
                throw new Error('endpoint_id is required for third_party interface')
              }
              const res = await authed(`/api/outbound/endpoints/${endpointId}/call`, 'POST', {
                param_values: paramValues,
              })
              return res.data || {}
            }
            // 调用内部数据接口
            return authed(submitPath, 'POST', {
              interface_code: interfaceCode,
              form_code: formAppCode,
              page_key: currentPageKey,
              param_values: paramValues,
            })
          }}
          onSubmit={async values => {
            await authed(submitPath, 'POST', {
              interface_code: currentPage.interface_code,
              form_code: formAppCode,
              page_key: currentPageKey,
              param_values: values,
            })
          }}
        />
      )}
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
  )
}
