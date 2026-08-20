import type { CanvasElement, VirtualLayoutConfig } from '@/types'
import type { GroupInstance } from '@/runtime/groupInstances'
import { resolveElementText } from '@/runtime/bindingResolver'
import { resolveConditionalStyles } from '@/runtime/conditionalStyles'
import { mergeAnimStyle } from '@/runtime/animationExecutor'
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
import type { PointDataMap } from '@/hooks/useStompPointData'
import type { CanvasData, ChartConfig } from '@/types'
import type { ScadaWorkflow, WorkflowLib } from '@/types/workflow'
import { runTriggeredEvents, type EventRuntimeContext } from '@/runtime/eventExecutor'
import type { ExpressionScope } from '@/runtime/expression'

export interface VirtualContainerSpec {
  groupId: string
  layout: VirtualLayoutConfig
  containerStyle: React.CSSProperties
  cellStyle: React.CSSProperties
  /** groupId → 该虚拟容器下所有的展开实例（按 group 划分） */
  items: Array<{
    key: string
    index: number
    context: Record<string, unknown>
    childElements: CanvasElement[]
  }>
}

interface Props {
  canvas: CanvasData
  /** 该虚拟容器覆盖的元素集合（含跨容器场景；通常只含一个 group 的展开实例） */
  instances: GroupInstance[]
  container: VirtualContainerSpec
  zoom: number
  pointData: PointDataMap
  scadaCode?: string
  tableLiveData: Record<string, Record<string, unknown>[]>
  onSwitchCanvas?: (canvasId: number) => void
  workflows?: ScadaWorkflow[]
  workflowLibs?: WorkflowLib[]
  enableWorkflows?: boolean
  onToast?: (msg: string) => void
  shareToken?: string
  /** 来自 workflowRuntime 的 element overrides / componentSourceIds */
  elementOverrides: Record<string, Partial<CanvasElement>>
  componentSourceIds: Set<string>
  triggerWorkflowById: (id: string) => void
  triggerComponent: (id: string, ev: 'click' | 'dblclick' | 'hover') => void
  exprScope: ExpressionScope
  /** 完整的事件运行时上下文（用于 runTriggeredEvents） */
  eventCtx: Omit<EventRuntimeContext, 'element'>
}

/**
 * 在虚拟 div 容器中渲染一个 group 的所有展开实例。
 *
 * 结构：
 *   <div container style + transform scale>
 *     <div per-cell style>
 *       <domElements / chart / image / table / form / layout / alarm>
 *     </div>
 *   </div>
 */
export default function VirtualGroupContainer({
  canvas,
  instances,
  container,
  zoom,
  pointData,
  scadaCode,
  tableLiveData,
  onSwitchCanvas,
  workflows,
  workflowLibs,
  enableWorkflows,
  onToast,
  shareToken,
  elementOverrides,
  componentSourceIds,
  triggerWorkflowById,
  triggerComponent,
  exprScope,
  eventCtx,
}: Props) {
  // 给 containerStyle 应用 zoom
  const scaledContainerStyle: React.CSSProperties = {
    ...container.containerStyle,
    transform: `scale(${zoom})`,
    transformOrigin: '0 0',
    width: typeof container.containerStyle.width === 'number'
      ? container.containerStyle.width * zoom
      : container.containerStyle.width,
    height: typeof container.containerStyle.height === 'number'
      ? container.containerStyle.height * zoom
      : container.containerStyle.height,
  }

  // 按 group.id + key 划分每个 cell 中的实例
  const byKey = new Map<string, CanvasElement[]>()
  for (const inst of instances) {
    if (inst.groupId !== container.groupId) continue
    const arr = byKey.get(inst.key) ?? []
    arr.push(inst.element)
    byKey.set(inst.key, arr)
  }

  const fireDomEvents = (el: CanvasElement, trigger: 'click' | 'dblclick' | 'hover') => {
    runTriggeredEvents(el, trigger, { ...eventCtx, element: el })
    triggerComponent(el.id, trigger)
  }

  return (
    <div style={scaledContainerStyle} data-virtual-group={container.groupId}>
      {Array.from(byKey.entries()).map(([key, childEls]) => (
        <div
          key={`${container.groupId}:${key}`}
          data-virtual-cell={key}
          style={{
            ...container.cellStyle,
            // 每个 cell 是该实例的“卡片”，占据组的 width/height；
            // 子元素自身使用绝对定位，相对于该 cell 的 (0,0)。
            position: 'relative',
            width: '100%',
            minHeight: 'inherit',
          }}
        >
          <VirtualChildren
            childEls={childEls}
            canvas={canvas}
            zoom={zoom}
            pointData={pointData}
            scadaCode={scadaCode}
            tableLiveData={tableLiveData}
            onSwitchCanvas={onSwitchCanvas}
            workflows={workflows}
            workflowLibs={workflowLibs}
            enableWorkflows={enableWorkflows}
            onToast={onToast}
            shareToken={shareToken}
            elementOverrides={elementOverrides}
            componentSourceIds={componentSourceIds}
            triggerWorkflowById={triggerWorkflowById}
            triggerComponent={triggerComponent}
            fireDomEvents={fireDomEvents}
            exprScope={exprScope}
          />
        </div>
      ))}
    </div>
  )
}

interface InnerProps {
  childEls: CanvasElement[]
  canvas: CanvasData
  zoom: number
  pointData: PointDataMap
  scadaCode?: string
  tableLiveData: Record<string, Record<string, unknown>[]>
  onSwitchCanvas?: (canvasId: number) => void
  workflows?: ScadaWorkflow[]
  workflowLibs?: WorkflowLib[]
  enableWorkflows?: boolean
  onToast?: (msg: string) => void
  shareToken?: string
  elementOverrides: Record<string, Partial<CanvasElement>>
  componentSourceIds: Set<string>
  triggerWorkflowById: (id: string) => void
  triggerComponent: (id: string, ev: 'click' | 'dblclick' | 'hover') => void
  fireDomEvents: (el: CanvasElement, trigger: 'click' | 'dblclick' | 'hover') => void
  exprScope: ExpressionScope
}

function VirtualChildren(props: InnerProps) {
  const { childEls, zoom, canvas, pointData, tableLiveData, onSwitchCanvas, scadaCode, exprScope, fireDomEvents, componentSourceIds } = props

  const domElements = childEls.filter((el) => el.visible && (el.type === 'text' || el.type === 'button'))
  const chartElements = childEls.filter((el) => el.visible && el.type.startsWith('echarts-'))
  const imageElements = childEls.filter((el) => el.visible && (
    el.type === 'image-bg' || el.type === 'image-widget' ||
    el.type === 'image-decoration' || el.type === 'image-border-box'
  ))
  const layoutElements = childEls.filter((el) => el.visible && (
    el.type === 'layout-carousel' || el.type === 'layout-modal' ||
    el.type === 'layout-tabs' || el.type === 'layout-collapse'
  ))
  const alarmElements = childEls.filter((el) => el.visible && el.type === 'alarm-light')
  const tableElements = childEls.filter((el) => el.visible && el.type === 'table')
  const formFieldElements = childEls.filter((el) => el.visible && el.type.startsWith('form-'))

  return (
    <>
      {chartElements.map((el) =>
        el.type === 'echarts-trend'
          ? ((el.properties?.chartConfig as ChartConfig | undefined)?.renderEngine === 'uplot-canvas' || (el.properties?.chartConfig as ChartConfig | undefined)?.renderEngine === 'uplot-webgl'
              ? <UPlotTrendWidget key={el.id} el={el} zoom={zoom} pointData={pointData} scadaCode={scadaCode} />
              : <TrendWidget key={el.id} el={el} zoom={zoom} pointData={pointData} scadaCode={scadaCode} />)
          : <ChartWidget key={el.id} el={el} zoom={zoom} pointData={pointData} />
      )}
      {imageElements.map((el) => (
        <ImageWidget key={el.id} el={el} zoom={zoom} pointData={pointData} />
      ))}
      {layoutElements.map((el) => {
        if (el.type === 'layout-carousel') return <LayoutCarouselWidget key={el.id} el={el} zoom={zoom} isPreview pointData={pointData} />
        if (el.type === 'layout-tabs') return <LayoutTabsWidget key={el.id} el={el} zoom={zoom} isPreview pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
        if (el.type === 'layout-collapse') return <LayoutCollapseWidget key={el.id} el={el} zoom={zoom} isPreview pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
        return <LayoutModalWidget key={el.id} el={el} zoom={zoom} isPreview pointData={pointData} scadaCode={scadaCode} onSwitchCanvas={onSwitchCanvas} />
      })}
      {alarmElements.map((el) => (
        <AlarmLightWidget key={el.id} el={el} zoom={zoom} pointData={pointData} />
      ))}
      {tableElements.map((el) => (
        <TableWidget
          key={el.id}
          el={el}
          zoom={zoom}
          pointData={pointData}
          liveRows={tableLiveData[el.id]}
          isPreview
        />
      ))}
      {formFieldElements.map((el) => (
        <FormFieldWidget key={el.id} el={el} zoom={zoom} isPreview={true} canvas={canvas} valuesRef={{ current: {} }} pointData={pointData} />
      ))}
      {domElements.map((el) => {
        const displayText = resolveElementText(el, pointData, canvas.elements, exprScope)
        const isWfSource = componentSourceIds.has(el.id)
        const hasEvents = !!el.events?.length || isWfSource
        const isBtn = el.type === 'button'
        const conditionalStyles = resolveConditionalStyles(el, pointData, exprScope)
        return (
          <div
            key={el.id}
            onClick={() => fireDomEvents(el, 'click')}
            onDoubleClick={() => fireDomEvents(el, 'dblclick')}
            onMouseEnter={() => fireDomEvents(el, 'hover')}
            style={mergeAnimStyle(el, pointData, {
              position: 'absolute',
              left: el.x * zoom,
              top: el.y * zoom,
              width: el.width * zoom,
              height: el.height * zoom,
              zIndex: el.zIndex,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                el.textAlign === 'left' ? 'flex-start'
                : el.textAlign === 'right' ? 'flex-end'
                : 'center',
              color: conditionalStyles.fontColor ?? el.fontColor ?? '#fff',
              fontSize: (el.fontSize ?? 14) * zoom,
              fontFamily: el.fontFamily || 'sans-serif',
              fontWeight: el.fontWeight === 'bold' ? 'bold' : 'normal',
              fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
              background: isBtn ? (conditionalStyles.fill ?? el.fill ?? 'transparent') : 'transparent',
              borderRadius: isBtn ? ((el.borderRadius ?? 4) * zoom) : undefined,
              border: isBtn && (conditionalStyles.stroke ?? el.stroke) ? `${(el.strokeWidth ?? 1) * zoom}px solid ${conditionalStyles.stroke ?? el.stroke}` : undefined,
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
    </>
  )
}