import { type Page, type APIRequestContext, expect } from '@playwright/test'

/**
 * 测试数据工厂：直接经 API 建/删 form-app，避免 UI 创建的脆弱性，
 * 给 UI 用例提供干净的前置数据。API 契约见 server/api/router.go + form_app.go。
 */
export const FORMS_URL = '/form-app/forms'

export function uniqueCode(prefix = 'e2e'): string {
  // 不用 Date.now/Math.random 以稳定可读：用高精度计数 + pid 片段
  const rand = Math.floor(performance.now() * 1000) % 1_000_000
  return `${prefix}_${rand}`
}

/** 经 API 创建一个 form-app，返回 {id, code}。*/
export async function createApp(
  api: APIRequestContext,
  opts: { code?: string; name?: string } = {},
): Promise<{ id: number; code: string; name: string }> {
  const code = opts.code || uniqueCode()
  const name = opts.name || `E2E ${code}`
  const resp = await api.post('/api/form-app/infos', { data: { code, name } })
  expect(resp.ok(), `创建应用失败 HTTP ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  return { id: body.data?.id ?? body.id, code, name }
}

/** 经 API 删除 form-app（清理用，幂等）。*/
export async function deleteApp(api: APIRequestContext, id: number): Promise<void> {
  if (!id) return
  await api.delete(`/api/form-app/infos/${id}`).catch(() => {})
}

/**
 * 经 API 给应用建一个可运行的表单页（field_definitions 走运行时即时生成 schema）。
 * config_json 结构见 MultiPageRuntime：field_definitions / events / scanner / printers。
 */
export async function createRunnableFormPage(
  api: APIRequestContext,
  appId: number,
  opts: {
    pageKey?: string
    fields?: Array<Record<string, any>>
    events?: any[]
    showDefaultSubmit?: boolean
  } = {},
): Promise<{ pageId: number; pageKey: string }> {
  const pageKey = opts.pageKey || 'form'
  const fields = opts.fields || [
    { field: 'name', label: '姓名', component: 'Input', required: true },
    { field: 'qty', label: '数量', component: 'Input' },
  ]
  const config = {
    field_definitions: fields,
    events: opts.events || [],
    printers: [],
    show_default_submit: opts.showDefaultSubmit ?? true,
  }
  const resp = await api.post(`/api/form-app/infos/${appId}/pages`, {
    data: {
      page_key: pageKey,
      title: '表单页',
      page_type: 'form',
      config_json: JSON.stringify(config),
    },
  })
  expect(resp.ok(), `建页失败 HTTP ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  return { pageId: body.data?.id ?? body.id, pageKey }
}

/** 运行时 URL（终端用户填报入口）。*/
export function runtimeUrl(code: string): string {
  return `/form-app/runtime/${encodeURIComponent(code)}`
}


/** 列表页：按名称定位某应用行（依赖列表渲染了应用名文本）。*/
export function appRow(page: Page, name: string) {
  return page.locator('table tbody tr', { hasText: name }).first()
    .or(page.locator('.formapp-card, [class*="card"]', { hasText: name }).first())
}

/** 等待 form-app SPA 就绪（导航完成 + 网络空闲）。*/
export async function gotoForms(page: Page) {
  await page.goto(FORMS_URL)
  await page.waitForLoadState('networkidle')
}
