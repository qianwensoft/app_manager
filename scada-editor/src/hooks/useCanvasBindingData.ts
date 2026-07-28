import { useState, useCallback, useMemo } from 'react'
import type { CanvasElement, CustomFunctionDef, GlobalParam } from '@/types'
import type { PointDataMap } from './useStompPointData'
import { useStompPointData } from './useStompPointData'
import { useHttpPollingPointData } from './useHttpPollingPointData'
import { useInterfaceBindingData } from './useInterfaceBindingData'
import { useTableBindingData } from './useTableBindingData'
import { resolveGlobalParams } from '@/runtime/expression'

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
  /** 免登分享模式 token：STOMP 走 /ws/stomp-scada */
  shareToken?: string
  /** 项目级全局参数（接口参数 global / expression 源使用） */
  globalParams?: GlobalParam[]
  /** 项目级自定义函数（接口参数 expression 源使用） */
  customFunctions?: CustomFunctionDef[]
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
  shareToken,
  globalParams,
  customFunctions,
}: CanvasBindingOptions) {
  const [pointData, setPointData] = useState<PointDataMap>({})

  const resolvedGlobalParams = useMemo(() => resolveGlobalParams(globalParams), [globalParams])

  const mergeData = useCallback((data: PointDataMap) => {
    setPointData((prev) => ({ ...prev, ...data }))
  }, [])

  useStompPointData({
    scadaCode,
    onData: mergeData,
    enabled: stompEnabled && !!scadaCode,
    shareToken,
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
    scadaCode,
    pointData,
    shareToken,
    globalParams: resolvedGlobalParams,
    customFunctions,
  })

  const tableLiveData = useTableBindingData({
    elements,
    enabled: interfaceEnabled,
    shareToken,
  })

  return { pointData, tableLiveData }
}
