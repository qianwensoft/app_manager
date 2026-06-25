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

async function fetchTableRows(interfaceId: number, paramJson?: string): Promise<Record<string, unknown>[]> {
  const token = localStorage.getItem('token') ?? ''
  const res = await fetch(`/api/data/interfaces/${interfaceId}/debug`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ param_values: parseParamJson(paramJson), limit: 500 }),
  })
  if (!res.ok) return []
  const json = await res.json()
  const payload = json.data ?? json.rows ?? json.result ?? json
  return rowsFromPayload(typeof payload === 'string' ? JSON.parse(payload) : payload)
}

interface Options {
  elements: CanvasElement[]
  enabled?: boolean
}

/** 表格元件 interface 模式运行时数据 */
export function useTableBindingData({ elements, enabled = true }: Options) {
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
        const rows = await fetchTableRows(ifaceId, paramJson)
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
  }, [elements, enabled])

  return tableLiveData
}
