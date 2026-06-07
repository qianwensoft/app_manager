const PREFIX = 'form-app:draft:'

export function draftStorageKey(formCode: string, pageKey: string): string {
  const token = localStorage.getItem('token') || 'anon'
  const userTag = token.length > 12 ? token.slice(-12) : token
  return `${PREFIX}${formCode}:${pageKey}:${userTag}`
}

export function loadLocalDraft(key: string): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveLocalDraft(key: string, values: Record<string, any>): void {
  try {
    localStorage.setItem(key, JSON.stringify(values))
  } catch {
    /* quota */
  }
}

export function clearLocalDraft(key: string): void {
  localStorage.removeItem(key)
}

async function authed(path: string, method: string, body?: Record<string, unknown>) {
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

export async function loadServerDraft(formCode: string, pageKey: string): Promise<Record<string, any> | null> {
  try {
    const q = new URLSearchParams({ form_code: formCode, page_key: pageKey })
    const res = await authed(`/api/form-app/runtime/draft?${q.toString()}`, 'GET')
    const data = res?.data
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export async function saveServerDraft(formCode: string, pageKey: string, values: Record<string, any>): Promise<void> {
  try {
    await authed('/api/form-app/runtime/draft', 'PUT', {
      form_code: formCode,
      page_key: pageKey,
      data: values,
    })
  } catch {
    /* offline */
  }
}

export async function clearServerDraft(formCode: string, pageKey: string): Promise<void> {
  try {
    const q = new URLSearchParams({ form_code: formCode, page_key: pageKey })
    await authed(`/api/form-app/runtime/draft?${q.toString()}`, 'DELETE')
  } catch {
    /* ignore */
  }
}
