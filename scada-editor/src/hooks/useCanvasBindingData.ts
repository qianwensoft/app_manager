import { useState, useCallback } from 'react'
import type { CanvasElement } from '@/types'
import type { PointDataMap } from './useStompPointData'
import { useStompPointData } from './useStompPointData'
import { useHttpPollingPointData } from './useHttpPollingPointData'
import { useInterfaceBindingData } from './useInterfaceBindingData'
import { useTableBindingData } from './useTableBindingData'

export interface CanvasBindingOptions {
  scadaCode: string
  elements: CanvasElement[]
  /** STOMP 实时点位（point / simulation / trend） */
  stompEnabled?: boolean
  /** HTTP 轮询模拟快照（草稿预览） */
  httpPollEnabled?: boolean
  httpPollIntervalMs?: number
  /** 开放接口轮询（interface 模式） */
  interfaceEnabled?: boolean
}

/**
 * 预览/发布页统一数据入口：合并 STOMP、HTTP 快照、interface 轮询与表格接口数据。
 */
export function useCanvasBindingData({
  scadaCode,
  elements,
  stompEnabled = true,
  httpPollEnabled = false,
  httpPollIntervalMs = 2000,
  interfaceEnabled = true,
}: CanvasBindingOptions) {
  const [pointData, setPointData] = useState<PointDataMap>({})

  const mergeData = useCallback((data: PointDataMap) => {
    setPointData((prev) => ({ ...prev, ...data }))
  }, [])

  useStompPointData({
    scadaCode,
    onData: mergeData,
    enabled: stompEnabled && !!scadaCode,
  })

  useHttpPollingPointData({
    scadaCode,
    intervalMs: httpPollIntervalMs,
    onData: mergeData,
    enabled: httpPollEnabled && !!scadaCode,
  })

  useInterfaceBindingData({
    elements: interfaceEnabled ? elements : [],
    onData: mergeData,
  })

  const tableLiveData = useTableBindingData({
    elements,
    enabled: interfaceEnabled,
  })

  return { pointData, tableLiveData }
}
