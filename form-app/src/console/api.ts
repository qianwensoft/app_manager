export async function authed(path: string, method: string, body?: any) {
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
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
  return data
}

export type FormAppPage = {
  id: number
  page_key: string
  page_type: string
  title: string
  interface_code: string
  config_json?: string
  sort_order: number
}

export type FormAppInfo = {
  id: number
  code: string
  name: string
  description?: string
  data_source_id?: number
  entry_page_key?: string
  global_config?: string
  publish_status?: number
  share_token?: string
}
