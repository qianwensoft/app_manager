import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { CanvasData, ChartConfig } from '@/types'
import { drawGrid, drawElement } from '@/utils/canvas'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { resolveElementValue } from '@/hooks/useInterfaceBindingData'
import { useRuntimeStore } from '@/store/runtimeStore'
import { useEditorStore } from '@/store/editorStore'
import { useAnimationTick } from '@/hooks/useAnimationTick'
import { useDateTimeTick } from '@/hooks/useDateTimeTick'
import { canvasNeedsAnimationLoop, getCanvasAnimState, mergeAnimStyle } from '@/runtime/animationExecutor'
import { runTriggeredEvents, type EventRuntimeContext } from '@/runtime/eventExecutor'
import { useConditionEvents } from '@/hooks/useConditionEvents'
import { useWorkflowRuntime } from '@/hooks/useWorkflowRuntime'
import type { ScadaWorkflow, WorkflowLib } from '@/types/workflow'
import type { CanvasElement } from '@/types'
import AnimationStyleInjector from './AnimationStyleInjector'
import ElementEventHitLayer from './ElementEventHitLayer'
import ChartWidget from './ChartWidget'
import TrendWidget from './TrendWidget'
import UPlotTrendWidget from './UPlotTrendWidget'
import ImageWidget from './ImageWidget'
import TableWidget from './TableWidget'
import FormFieldWidget from './FormFieldWidget'
import LayoutCarouselWidget from './LayoutCarouselWidget'
import LayoutModalWidget from './LayoutModalWidget'
import LayoutTabsWidget from './LayoutTabsWidget'
import LayoutCollapseWidget from './LayoutCollapseWidget'
import AlarmLightWidget from './AlarmLightWidget'
import { expandGroupInstances } from '@/runtime/groupInstances'

interface Props {
  canvas: CanvasData
  zoom?: number
  /** When true, ignores zoom prop and auto-fits the canvas to its container via ResizeObserver */
  fitContainer?: boolean
  /** 'fit' = maintain aspect ratio (default when fitContainer); 'fill' = stretch to fill */
  fitMode?: 'fit' | 'fill'
  pointData?: PointDataMap
  tableLiveData?: Record<string, Record<string, unknown>[]>
  scadaCode?: string
  onSwitchCanvas?: (canvasId: number) => void
  /** 工作流定义（preview/分享态传入以启用运行时工作流） */
  workflows?: ScadaWorkflow[]
  workflowLibs?: WorkflowLib[]
  /** 是否启用工作流运行时（编辑器画布默认关闭） */
  enableWorkflows?: boolean
  /** 顶部提示（工作流 toast 动作用） */
  onToast?: (msg: string) => void
  /** 分享态 token（工作流 call_interface 免登调用用） */
  shareToken?: string
}

export default function CanvasViewer({
  canvas,
  zoom = 1,
  fitContainer = false,
  fitMode = 'fit',
  pointData: rawPointData = {},
  tableLiveData = {},
  scadaCode,
  onSwitchCanvas,
  workflows,
  workflowLibs,
  enableWorkflows = false,
  onToast,
  shareToken,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const openModal = useRuntimeStore((s) => s.openModal)
  const closeModal = useRuntimeStore((s) => s.closeModal)
  const switchCanvas = useEditorStore((s) => s.switchCanvas)

  // 工作流运行时：先用原始 pointData 展开一份基础运行时元素供选择器解析，
  // 再拿回合成后的 pointData（叠加绑定覆盖）与属性覆盖层。
  const baseRuntimeElements = useMemo<CanvasElement[]>(() => {
    const instances = expandGroupInstances(canvas.elements, rawPointData)
    const tplChildIds = new Set(
      canvas.elements
        .filter((el) => el.type === 'group' && el.groupBinding?.enabled)
        .flatMap((el) => el.children ?? []),
    )
    return [
      ...canvas.elements.filter((el) => !tplChildIds.has(el.id)),
      ...instances.map((i) => i.element),
    ]
  }, [canvas.elements, rawPointData])

  const wf = useWorkflowRuntime({
    canvasId: canvas.id,
    runtimeElements: baseRuntimeElements,
    pointData: rawPointData,
    workflows,
    workflowLibs,
    enabled: enableWorkflows,
    openModal,
    closeModal,
    switchCanvas: onSwitchCanvas ?? switchCanvas,
    toast: onToast,
    shareToken,
  })

  const pointData = wf.pointData
  const elementOverrides = wf.elementOverrides
  const componentSourceIds = wf.componentSourceIds
  const applyOverride = useCallback((el: CanvasElement): CanvasElement => {
    const byId = elementOverrides[el.id]
    // 模板实例：基础 id 段命中覆盖
    const parts = el.id.split(':')
    const baseId = parts.length >= 3 ? parts.slice(2).join(':') : el.id
    const byBase = baseId !== el.id ? elementOverrides[baseId] : undefined
    if (!byId && !byBase) return el
    return { ...el, ...byBase, ...byId }
  }, [elementOverrides])

  // resolved zoom — either from prop or computed from container size
  const [resolvedZoom, setResolvedZoom] = useState(zoom)

  const computeZoom = useCallback((cw: number, ch: number) => {
    if (!cw || !ch) return
    const zx = cw / canvas.width
    const zy = ch / canvas.height
    setResolvedZoom(fitMode === 'fill' ? Math.max(zx, zy) : Math.min(zx, zy))
  }, [canvas.width, canvas.height, fitMode])

  // ResizeObserver for fitContainer mode
  useEffect(() => {
    if (!fitContainer) {
      setResolvedZoom(zoom)
      return
    }
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      computeZoom(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    // initial compute
    computeZoom(el.clientWidth, el.clientHeight)
    return () => ro.disconnect()
  }, [fitContainer, zoom, computeZoom])

  const z = resolvedZoom

  const needsAnimLoop = useMemo(
    () => canvasNeedsAnimationLoop(canvas.elements, pointData),
    [canvas.elements, pointData],
  )
  const animNow = useAnimationTick(needsAnimLoop)
  const dateTimeTick = useDateTimeTick(canvas.elements)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    el.width = canvas.width * z
    el.height = canvas.height * z

    ctx.fillStyle = canvas.backgroundColor
    ctx.fillRect(0, 0, el.width, el.height)

    drawGrid(ctx, canvas, z)

    const sorted = [...canvas.elements].sort((a, b) => a.zIndex - b.zIndex)
    for (const element of sorted) {
      const animState = getCanvasAnimState(element, pointData, animNow)
      drawElement(ctx, element, z, animState)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, z, pointData, animNow, dateTimeTick])

  const groupInstances = useMemo(() => expandGroupInstances(canvas.elements, pointData), [canvas.elements, pointData])
  const templateChildIds = new Set(
    canvas.elements
      .filter((el) => el.type === 'group' && el.groupBinding?.enabled)
      .flatMap((el) => el.children ?? []),
  )
  const runtimeElements = [
    ...canvas.elements.filter((el) => !templateChildIds.has(el.id)),
    ...groupInstances.map((instance) => instance.element),
  ].map(applyOverride)
  const domElements = runtimeElements.filter(
    (el) => el.visible && (el.type === 'text' || el.type === 'button'),
  )
  // component 工作流触发源元素中，未被 text/button DOM 覆盖层处理的（组合/图形/图片等），
  // 需要单独渲染透明点击热区，否则点击不触发其 component 工作流。
  const componentHitElements = runtimeElements.filter(
    (el) => el.visible && el.type !== 'text' && el.type !== 'button' && componentSourceIds.has(el.id),
  )
  const chartElements = runtimeElements.filter(
    (el) => el.visible && el.type.startsWith('echarts-'),
  )
  const imageElements = runtimeElements.filter(
    (el) => el.visible && (
      el.type === 'image-bg' || el.type === 'image-widget' ||
      el.type === 'image-decoration' || el.type === 'image-border-box'
    ),
  )
  const layoutElements = runtimeElements.filter(
    (el) => el.visible && (
      el.type === 'layout-carousel' || el.type === 'layout-modal'
      || el.type === 'layout-tabs' || el.type === 'layout-collapse'
    ),
  )
  const alarmElements = runtimeElements.filter(
    (el) => el.visible && el.type === 'alarm-light',
  )
  const tableElements = runtimeElements.filter(
    (el) => el.visible && el.type === 'table',
  )
  const formFieldElements = runtimeElements.filter(
    (el) => el.visible && el.type.startsWith('form-'),
  )
  const formValuesRef = useRef<Record<string, string>>({})

  const eventCtx = useMemo<Omit<EventRuntimeContext, 'element'>>(() => ({
    pointData,
    openModal,
    closeModal,
    switchCanvas,
    onSwitchCanvas,
    triggerWorkflow: wf.runWorkflowById,
  }), [pointData, openModal, closeModal, switchCanvas, onSwitchCanvas, wf.runWorkflowById])

  useConditionEvents(canvas.elements, pointData, eventCtx)

  const fireDomEvents = (el: (typeof domElements)[0], trigger: 'click' | 'dblclick' | 'hover') => {
    runTriggeredEvents(el, trigger, { ...eventCtx, element: el })
    // 组件 UI 事件同时触发以该元素为源的 component 工作流
    wf.triggerComponent(el.id, trigger)
  }

  // When fitContainer, the outer div fills its parent; the inner canvas is centered
  const outerStyle: React.CSSProperties = fitContainer
    ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    : { position: 'relative', display: 'inline-block' }

  return (
    <div ref={containerRef} style={outerStyle}>
      <AnimationStyleInjector elements={canvas.elements} />
      {/* inner wrapper sized to the scaled canvas */}
      <div style={{ position: 'relative', width: canvas.width * z, height: canvas.height * z, flexShrink: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
        {chartElements.map((el) =>
          el.type === 'echarts-trend'
            ? ((el.properties?.chartConfig as ChartConfig | undefined)?.renderEngine === 'uplot-canvas' || (el.properties?.chartConfig as ChartConfig | undefined)?.renderEngine === 'uplot-webgl'
                ? <UPlotTrendWidget key={el.id} el={el} zoom={z} pointData={pointData} scadaCode={scadaCode} />
                : <TrendWidget key={el.id} el={el} zoom={z} pointData={pointData} scadaCode={scadaCode} />)
            : <ChartWidget key={el.id} el={el} zoom={z} pointData={pointData} />
        )}
        {imageElements.map((el) => (
          <ImageWidget key={el.id} el={el} zoom={z} pointData={pointData} />
        ))}
        {layoutElements.map((el) => {
          if (el.type === 'layout-carousel') {
            return <LayoutCarouselWidget key={el.id} el={el} zoom={z} isPreview pointData={pointData} />
          }
          if (el.type === 'layout-tabs') {
            return <LayoutTabsWidget key={el.id} el={el} zoom={z} isPreview pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
          }
          if (el.type === 'layout-collapse') {
            return <LayoutCollapseWidget key={el.id} el={el} zoom={z} isPreview pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
          }
          return <LayoutModalWidget key={el.id} el={el} zoom={z} isPreview pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
        })}
        {alarmElements.map((el) => (
          <AlarmLightWidget key={el.id} el={el} zoom={z} isPreview pointData={pointData} />
        ))}
        {tableElements.map((el) => (
          <TableWidget
            key={el.id}
            el={el}
            zoom={z}
            pointData={pointData}
            liveRows={tableLiveData[el.id]}
            isPreview
          />
        ))}
        {formFieldElements.map((el) => (
          <FormFieldWidget key={el.id} el={el} zoom={z} isPreview={true} canvas={canvas} valuesRef={formValuesRef} pointData={pointData} />
        ))}
        {domElements.map((el) => {
          const displayText = resolveElementValue(el, pointData)
          const isWfSource = componentSourceIds.has(el.id)
          const hasEvents = !!el.events?.length || isWfSource
          const isBtn = el.type === 'button'
          return (
            <div
              key={el.id}
              onClick={() => fireDomEvents(el, 'click')}
              onDoubleClick={() => fireDomEvents(el, 'dblclick')}
              onMouseEnter={() => fireDomEvents(el, 'hover')}
              style={mergeAnimStyle(el, pointData, {
                position: 'absolute',
                left: el.x * z,
                top: el.y * z,
                width: el.width * z,
                height: el.height * z,
                zIndex: el.zIndex,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  el.textAlign === 'left' ? 'flex-start'
                  : el.textAlign === 'right' ? 'flex-end'
                  : 'center',
                color: el.fontColor || '#fff',
                fontSize: (el.fontSize ?? 14) * z,
                fontFamily: el.fontFamily || 'sans-serif',
                fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
                fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
                background: isBtn ? (el.fill || 'transparent') : 'transparent',
                borderRadius: isBtn ? ((el.borderRadius ?? 4) * z) : undefined,
                border: isBtn && el.stroke ? `${(el.strokeWidth ?? 1) * z}px solid ${el.stroke}` : undefined,
                pointerEvents: (isBtn || hasEvents) ? 'auto' : 'none',
                cursor: (isBtn || hasEvents) ? 'pointer' : 'default',
                userSelect: 'none',
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                boxSizing: 'border-box',
              })}
            >
              {displayText}
            </div>
          )
        })}
        {componentHitElements.map((el) => (
          <div
            key={`wf-hit-${el.id}`}
            onClick={() => wf.triggerComponent(el.id, 'click')}
            onDoubleClick={() => wf.triggerComponent(el.id, 'dblclick')}
            onMouseEnter={() => wf.triggerComponent(el.id, 'hover')}
            style={{
              position: 'absolute',
              left: el.x * z,
              top: el.y * z,
              width: el.width * z,
              height: el.height * z,
              zIndex: el.zIndex + 1,
              cursor: 'pointer',
              background: 'transparent',
              pointerEvents: 'auto',
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            }}
            aria-hidden
          />
        ))}
        <ElementEventHitLayer
          elements={canvas.elements}
          zoom={z}
          pointData={pointData}
          ctx={eventCtx}
        />
      </div>
    </div>
  )
}
