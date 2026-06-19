import { type Page, type APIRequestContext, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 测试数据工厂：直接经 API 建/删 form-app，避免 UI 创建的脆弱性，
 * 给 UI 用例提供干净的前置数据。API 契约见 server/api/router.go + form_app.go。
 */
export const FORMS_URL = '/form-app/forms'

/** 读 auth.setup 持久化的裸 token，构造 Authorization 头。
 *  request 夹具不带登录态（storageState 只注入浏览器 localStorage），故 API 调用需显式带头。 */
function authHeaders(): Record<string, string> {
  try {
    const token = fs.readFileSync(path.join('e2e', '.auth', 'token.txt'), 'utf-8').trim()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export { authHeaders }

let _seq = 0
export function uniqueCode(prefix = 'e2e'): string {
  // 进程内单调计数 + 高精度时间，避免快速连续创建时 code 碰撞（碰撞会导致
  // GetFormAppByCode 命中旧应用、渲染出别的页面，进而 flaky）。
  _seq += 1
  const t = Math.floor(performance.now() * 1000)
  return `${prefix}_${t.toString(36)}_${_seq}`
}

/** 经 API 创建一个 form-app，返回 {id, code}。*/
export async function createApp(
  api: APIRequestContext,
  opts: { code?: string; name?: string } = {},
): Promise<{ id: number; code: string; name: string }> {
  const code = opts.code || uniqueCode()
  const name = opts.name || `E2E ${code}`
  const resp = await api.post('/api/form-app/infos', { data: { code, name }, headers: authHeaders() })
  expect(resp.ok(), `创建应用失败 HTTP ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  return { id: body.data?.id ?? body.id, code, name }
}

/** 经 API 删除 form-app（清理用，幂等）。*/
export async function deleteApp(api: APIRequestContext, id: number): Promise<void> {
  if (!id) return
  await api.delete(`/api/form-app/infos/${id}`, { headers: authHeaders() }).catch(() => {})
}

/**
 * 经 API 给应用配置一个可运行的表单页（field_definitions 走运行时即时生成 schema）。
 * 注意：CreateFormApp 会自动建一个默认 page_key='form' 页，故这里**更新该默认页**
 * （PUT），而非新建——否则会产生两个 'form' 页、运行时渲染第一个默认页。
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
  // 查现有页，命中同 page_key 则更新，否则新建
  const listResp = await api.get(`/api/form-app/infos/${appId}/pages`, { headers: authHeaders() })
  const pages = listResp.ok() ? ((await listResp.json()).data || []) : []
  const existing = pages.find((p: any) => p.page_key === pageKey)
  const payload = {
    page_key: pageKey,
    title: '表单页',
    page_type: 'form',
    config_json: JSON.stringify(config),
  }
  let resp
  if (existing) {
    resp = await api.put(`/api/form-app/pages/${existing.id}`, { data: { ...existing, ...payload }, headers: authHeaders() })
  } else {
    resp = await api.post(`/api/form-app/infos/${appId}/pages`, { data: payload, headers: authHeaders() })
  }
  expect(resp.ok(), `配置页失败 HTTP ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  return { pageId: body.data?.id ?? existing?.id, pageKey }
}

/** 运行时 URL（终端用户填报入口）。*/
export function runtimeUrl(code: string): string {
  return `/form-app/runtime/${encodeURIComponent(code)}`
}

/** antd 会在双 CJK 字按钮里插入空格（提 交 / 完 成）；用空白容忍的正则匹配按钮名。 */
export function cjkBtn(text: string): RegExp {
  return new RegExp(text.split('').join('\\s*'))
}

/**
 * 跨渲染库（@formily/antd 与 antd-mobile 包裹层不同）定位某字段的输入框。
 * 不依赖 .ant-form-item 类；以「字段标题文本所在的 FormItem 容器」为锚，
 * 容器选择器同时兼容 antd（.ant-formily-item / .ant-form-item）与移动端。
 */
export function fieldInput(page: Page, label: string) {
  const item = page
    .locator('.ant-formily-item, .ant-form-item, .adm-form-item, [class*="formily-item"]')
    .filter({ hasText: label })
  return item.locator('input, textarea').first()
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
