/**
 * 工作流运行时接入 Hook。
 *
 * 职责：
 *  - 依据传入的 workflows（含全局/画布作用域）构建引擎，注册 6 种触发源
 *  - 维护运行时覆盖层：属性覆盖（elementOverrides）+ 绑定覆盖（pointOverrides）
 *  - 把 pointData 变化喂给引擎（point_change / condition 边沿）
 *  - 挂载/卸载时触发 canvas_enter / canvas_exit
 *  - 暴露 triggerComponent / runWorkflowById 供组件事件与 trigger-workflow 动作调用
 *
 * 返回合成后的 pointData（叠加绑定覆盖）与 elements（叠加属性覆盖），供 CanvasViewer 直接消费。
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { CanvasElement } from '@/types'
import type { ScadaWorkflow, WorkflowLib } from '@/types/workflow'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { setupWorkflows, type WorkflowRuntime } from '@/runtime/workflow/engine'
import { createElementScope } from '@/runtime/workflow/elementScope'
import { getGlobalContext } from '@/runtime/workflow/globalContext'
import { createContextStore } from '@/runtime/workflow/contextStore'
import { loadLibs } from '@/runtime/workflow/libLoader'
import type { WorkflowEngineDeps } from '@/runtime/workflow/types'
import { makeCallInterface } from '@/runtime/workflow/callInterface'

interface Options {
  /** 当前画布 id（用于按 canvas 作用域过滤工作流） */
  canvasId?: number
  /** 运行时元素（已展开模板实例）——用于选择器解析 */
  runtimeElements: CanvasElement[]
  /** 父级传入的 pointData（STOMP/HTTP/接口） */
  pointData: PointDataMap
  /** 项目工作流定义 */
  workflows?: ScadaWorkflow[]
  /** 外部库清单 */
  workflowLibs?: WorkflowLib[]
  /** 是否启用（编辑器画布默认关闭，preview/分享开启） */
  enabled?: boolean
  openModal?: (id: string) => void
  closeModal?: (id: string) => void
  switchCanvas?: (id: number) => void
  toast?: (msg: string) => void
  shareToken?: string
}

interface Result {
  /** 叠加绑定覆盖后的 pointData */
  pointData: PointDataMap
  /** 属性覆盖表（elementId → partial） */
  elementOverrides: Record<string, Partial<CanvasElement>>
  /** 组件 UI 事件触发 */
  triggerComponent: (elementId: string, event: 'click' | 'dblclick' | 'hover') => void
  /** 按 id 触发工作流（供 trigger-workflow 动作） */
  runWorkflowById: (id: string) => void
  /** 作为 component 工作流触发源的元素 id 集合（供画布渲染点击热区） */
  componentSourceIds: Set<string>
}

export function useWorkflowRuntime(opts: Options): Result {
  const { canvasId, runtimeElements, pointData, workflows, workflowLibs, enabled = true, openModal, closeModal, switchCanvas, toast, shareToken } = opts

  const [pointOverrides, setPointOverrides] = useState<PointDataMap>({})
  const [elementOverrides, setElementOverrides] = useState<Record<string, Partial<CanvasElement>>>({})

  // 合成 pointData：父级数据 + 运行时绑定覆盖
  const mergedPointData = useMemo<PointDataMap>(
    () => (Object.keys(pointOverrides).length ? { ...pointData, ...pointOverrides } : pointData),
    [pointData, pointOverrides],
  )

  // 稳定引用：给引擎读最新快照，避免频繁重建引擎
  const elementsRef = useRef(runtimeElements)
  elementsRef.current = runtimeElements
  const pointRef = useRef(mergedPointData)
  pointRef.current = mergedPointData
  const overridesRef = useRef(elementOverrides)
  overridesRef.current = elementOverrides
  const runtimeRef = useRef<WorkflowRuntime | null>(null)

  // 应用属性变更：合并到 elementOverrides（基础 id 与实例 id 都可）
  const applyProp = useCallback((elementId: string, updates: Partial<CanvasElement>) => {
    setElementOverrides((prev) => ({ ...prev, [elementId]: { ...prev[elementId], ...updates } }))
  }, [])
  const writePointOverride = useCallback((key: string, value: unknown) => {
    setPointOverrides((prev) => ({ ...prev, [key]: value }))
  }, [])

  // 过滤本画布 + 全局作用域工作流
  const activeWorkflows = useMemo(() => {
    const all = workflows || []
    return all.filter((w) => {
      if (w.enabled === false) return false
      const scope = w.scope ?? 'canvas'
      if (scope === 'global') return true
      return w.canvasId == null || w.canvasId === canvasId
    })
  }, [workflows, canvasId])

  // 加载外部库（一次）
  useEffect(() => {
    if (!enabled) return
    void loadLibs(workflowLibs)
  }, [enabled, workflowLibs])

  // 构建引擎：workflows / canvasId 变化时重建
  useEffect(() => {
    if (!enabled || activeWorkflows.length === 0) {
      runtimeRef.current = null
      return
    }
    const elementScope = createElementScope({
      getElements: () => elementsRef.current,
      applyProp,
      writePointOverride,
    })
    const deps: WorkflowEngineDeps = {
      getElements: () => elementsRef.current,
      getPointData: () => pointRef.current,
      elementScope,
      globalContext: getGlobalContext(),
      makeWorkflowContext: () => createContextStore(),
      callInterface: makeCallInterface(shareToken),
      switchCanvas,
      openModal,
      closeModal,
      toast,
    }
    const rt = setupWorkflows(activeWorkflows, deps)
    runtimeRef.current = rt
    rt.triggerLifecycle('canvas_enter')
    return () => {
      rt.triggerLifecycle('canvas_exit')
      rt.cleanup()
      runtimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeWorkflows, canvasId])

  // pointData 变化 → 喂引擎评估边沿
  useEffect(() => {
    runtimeRef.current?.notifyPointData(mergedPointData)
  }, [mergedPointData])

  const triggerComponent = useCallback((elementId: string, event: 'click' | 'dblclick' | 'hover') => {
    runtimeRef.current?.triggerComponent(elementId, event)
  }, [])
  const runWorkflowById = useCallback((id: string) => {
    runtimeRef.current?.runWorkflowById(id)
  }, [])

  // 收集 component 触发源元素 id（仅本画布/全局启用的工作流），供画布渲染点击热区
  const componentSourceIds = useMemo(() => {
    const ids = new Set<string>()
    for (const w of activeWorkflows) {
      if (w.source.kind === 'component' && w.source.elementId) ids.add(w.source.elementId)
    }
    return ids
  }, [activeWorkflows])

  return { pointData: mergedPointData, elementOverrides, triggerComponent, runWorkflowById, componentSourceIds }
}
