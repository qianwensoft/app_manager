import { useEffect, useRef, useState } from 'react'
import type { CanvasElement } from '@/types'

const POLL_MS = 5000

function parseParamJson(raw?: string): Record<string, string> {
  if (!raw?.trim()) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = String(v)
    return out
  } catch {
    return {}
  }
}

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const rows = obj.data ?? obj.rows ?? obj.list
    if (Array.isArray(rows)) return rows as Record<string, unknown>[]
  }
  return []
}

async function fetchTableRows(interfaceId: number, paramJson?: string, shareToken?: string): Promise<Record<string, unknown>[]> {
  const token = localStorage.getItem('token') ?? ''
  // 分享态：走受限只读 share 调用（token 在 body，服务端按画布引用白名单校验）；
  // 登录态：仍走 /invoke（viewer 可读），而非 /debug（需 operator）。
  const url = shareToken
    ? `/api/scada/share/interfaces/${interfaceId}/invoke`
    : `/api/data/interfaces/${interfaceId}/invoke`
  const body = shareToken
    ? { share_token: shareToken, param_values: parseParamJson(paramJson), limit: 500 }
    : { param_values: parseParamJson(paramJson), limit: 500 }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(!shareToken && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) return []
  const json = await res.json()
  const payload = json.data ?? json.rows ?? json.result ?? json
  return rowsFromPayload(typeof payload === 'string' ? JSON.parse(payload) : payload)
}

interface Options {
  elements: CanvasElement[]
  enabled?: boolean
  /** 免登分享 token：走 share 只读接口 */
  shareToken?: string
}

/** 表格元件 interface 模式运行时数据 */
export function useTableBindingData({ elements, enabled = true, shareToken }: Options) {
  const [tableLiveData, setTableLiveData] = useState<Record<string, Record<string, unknown>[]>>({})
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  useEffect(() => {
    timersRef.current.forEach((t) => clearInterval(t))
    timersRef.current.clear()

    if (!enabled) return

    const tables = elements.filter(
      (el) => el.type === 'table' && el.tableDataBinding?.mode === 'interface' && el.tableDataBinding.interfaceId,
    )

    for (const el of tables) {
      const ifaceId = el.tableDataBinding!.interfaceId!
      const paramJson = el.tableDataBinding!.paramJson

      const poll = async () => {
        const rows = await fetchTableRows(ifaceId, paramJson, shareToken)
        if (rows.length) {
          setTableLiveData((prev) => ({ ...prev, [el.id]: rows }))
        }
      }

      poll()
      const timer = setInterval(poll, POLL_MS)
      timersRef.current.set(el.id, timer)
    }

    return () => {
      timersRef.current.forEach((t) => clearInterval(t))
      timersRef.current.clear()
    }
  }, [elements, enabled, shareToken])

  return tableLiveData
}
