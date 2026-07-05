// AI Chat 的 SSE 流式读取工具。
// 用 fetch + ReadableStream（而非 EventSource），以支持 POST body 与 Authorization 头。

export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
  image_base64?: string
  media_type?: string
}

export type AiChatBody = {
  messages: AiChatMessage[]
  skill_ids?: number[]
  current_fields?: any[]
  current_events?: any[]
  current_printers?: any[]
  current_design_schema?: any
}

export type AiChatCallbacks = {
  onDelta: (text: string) => void
  onDone: (payload: {
    fields_parsed: boolean; fields: string
    events_parsed?: boolean; events?: string
    printers_parsed?: boolean; printers?: string
    design_schema_parsed?: boolean; design_schema?: string
  }) => void
  onError: (msg: string) => void
}

export async function streamAiChat(
  body: AiChatBody,
  cb: AiChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem('token') || ''
  let resp: Response
  try {
    resp = await fetch('/api/form-app/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    cb.onError(e?.message || '请求失败')
    return
  }

  if (!resp.ok || !resp.body) {
    let msg = `HTTP ${resp.status}`
    try {
      const data = await resp.json()
      if (data?.error) msg = data.error
    } catch { /* ignore */ }
    cb.onError(msg)
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // 按 SSE 事件块（空行分隔）切分
      const blocks = buf.split('\n\n')
      buf = blocks.pop() || ''
      for (const block of blocks) {
        let event = 'message'
        let data = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        let parsed: any
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        if (event === 'delta') cb.onDelta(parsed.text || '')
        else if (event === 'done') cb.onDone(parsed)
        else if (event === 'error') cb.onError(parsed.message || '生成失败')
      }
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') cb.onError(e?.message || '流读取失败')
  }
}

// 前端兜底：从文本中抽取第一个 JSON 数组。
export function extractJSONArray(s: string): string {
  s = s.trim()
  if (s.startsWith('```')) {
    const nl = s.indexOf('\n')
    if (nl >= 0) s = s.slice(nl + 1)
    const fence = s.lastIndexOf('```')
    if (fence >= 0) s = s.slice(0, fence)
    s = s.trim()
  }
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start >= 0 && end > start) return s.slice(start, end + 1)
  return s
}

// 前端兜底：从文本中抽取第一个 JSON 对象（{ fields, events }）。返回 '' 表示未找到。
export function extractJSONObject(s: string): string {
  s = s.trim()
  if (s.startsWith('```')) {
    const nl = s.indexOf('\n')
    if (nl >= 0) s = s.slice(nl + 1)
    const fence = s.lastIndexOf('```')
    if (fence >= 0) s = s.slice(0, fence)
    s = s.trim()
  }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) return s.slice(start, end + 1)
  return ''
}
