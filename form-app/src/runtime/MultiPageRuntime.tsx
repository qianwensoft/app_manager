import { useEffect, useState } from 'react'
import { message, Button } from 'antd'
import FormRenderer from './FormRenderer'
import ListRenderer from './ListRenderer'
import DetailRenderer from './DetailRenderer'
import { setupEventListener } from './EventHandler'
import { navigationManager } from './NavigationManager'

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

type MultiPageRuntimeProps = {
  formAppCode: string
  entryPageKey?: string
}

export default function MultiPageRuntime({ formAppCode, entryPageKey = 'form' }: MultiPageRuntimeProps) {
  const [app, setApp] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [currentPageKey, setCurrentPageKey] = useState(entryPageKey)
  const [params, setParams] = useState<Record<string, any>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const appRes = await authed(`/api/form-app/infos/code/${formAppCode}`, 'GET')
        setApp(appRes.data)
        const pagesRes = await authed(`/api/form-app/infos/${appRes.data.id}/pages`, 'GET')
        setPages(pagesRes.data || [])
        navigationManager.push(entryPageKey)
      } catch (e: any) {
        message.error(e.message)
      }
    }
    load()

    const token = localStorage.getItem('token') || ''
    const cleanup = setupEventListener(
      app?.id || 0,
      token,
      (pageKey, eventParams) => {
        navigate(pageKey, eventParams)
      }
    )

    const unsubNav = navigationManager.onChange(state => {
      setCurrentPageKey(state.pageKey)
      setParams(state.params)
    })

    return () => {
      cleanup()
      unsubNav()
      navigationManager.clear()
    }
  }, [formAppCode])

  const navigate = (pageKey: string, navParams: Record<string, any> = {}) => {
    navigationManager.push(pageKey, navParams)
  }

  const goBack = () => {
    navigationManager.pop()
  }

  const currentPage = pages.find(p => p.page_key === currentPageKey)
  if (!currentPage) return <div style={{ padding: 24 }}>页面不存在: {currentPageKey}</div>

  const config = currentPage.config_json ? JSON.parse(currentPage.config_json) : {}
  const fields = config.field_definitions || []

  return (
    <div>
      {navigationManager.canGoBack() && (
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
          <Button onClick={goBack}>← 返回</Button>
        </div>
      )}
      {currentPage.page_type === 'form' && (
        <FormRenderer
          fields={fields}
          initialValues={params}
          onSubmit={async values => {
            await authed('/api/form-app/runtime/submit', 'POST', {
              interface_code: currentPage.interface_code,
              form_code: formAppCode,
              page_key: currentPageKey,
              data: values,
            })
          }}
        />
      )}
      {currentPage.page_type === 'list' && (
        <ListRenderer
          fields={fields}
          queryConditions={config.query_conditions || []}
          onQuery={async queryParams => {
            const res = await authed('/api/form-app/runtime/query', 'POST', {
              interface_code: currentPage.interface_code,
              form_code: formAppCode,
              page_key: currentPageKey,
              param_values: queryParams,
            })
            return { data: res.rows || res.data || [], total: res.total || 0 }
          }}
          onRowClick={row => navigate('detail', { id: row.id })}
        />
      )}
      {currentPage.page_type === 'detail' && (
        <DetailRenderer
          fields={fields}
          onLoad={async () => {
            const res = await authed('/api/form-app/runtime/query', 'POST', {
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
