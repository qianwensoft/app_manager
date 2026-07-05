import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { message } from '@/lib/message'
import { createForm, onFieldValueChange, type Form as FormilyForm } from '@formily/core'
import { FormProvider, createSchemaField } from '@formily/react'
import { SubmitButtonContext } from './SubmitButtonContext'
import { FormActionContext } from './FormActionContext'
import type { FieldBinding, FieldOption } from './types'
import { bindingsTriggeredBy, buildBindingParamValues } from './fieldLogic'
import type { ScannerConfig } from '@/pages/PageEditorPage'
import type { PageEvent } from './eventTypes'
import { setupPageEvents, resolvePageEvents, type ButtonTrigger } from './eventEngine'
import { createFormilyPageState } from './formilyPageState'
import { useAppState } from './AppStateContext'
import type { StateScope } from './pageState'
import { PrintButtonContext } from './PrintButtonContext'
import {
  clearLocalDraft, clearServerDraft, draftStorageKey,
  loadLocalDraft, loadServerDraft, saveLocalDraft, saveServerDraft,
} from './formDraft'
import { shadcnComponents, ShadcnFormContainer } from './componentLibraries/shadcn'
import { antdComponents } from './componentLibraries/antd'
import { loadLibrary, type LibraryKey, type ComponentRegistry } from './componentLibraries'

// 默认 shadcn 的 SchemaField（同步可用，移动库按 libraryKey 动态加载后重建）。
const defaultSchemaField = createSchemaField({ components: shadcnComponents })

type SchemaFormRendererProps = {
  designSchema: any
  bindings?: FieldBinding[]
  initialValues?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
  submitLabel?: string
  /** 当布局中没有任何提交按钮时，是否在底部渲染兜底提交按钮。默认 false。 */
  showDefaultSubmit?: boolean
  formCode?: string
  pageKey?: string
  onQueryOptions?: (interfaceCode: string, paramValues: Record<string, any>) => Promise<FieldOption[]>
  scannerConfig?: ScannerConfig
  /** 页面级统一事件配置（与 scannerConfig 共存，scannerConfig 自动适配进事件链） */
  events?: PageEvent[]
  onScanInterface?: (interfaceCode: string, paramValues: Record<string, any>, type?: 'internal' | 'third_party' | 'connector', endpointId?: number) => Promise<any>
  /** 触发打印（阶段4：走 AndroidBridge）；模板由 templateId 在 doPrint 内查找 */
  doPrint?: (templateId: string, values: Record<string, any>, extra?: Record<string, any>) => Promise<void>
  /** 跳页（事件动作 navigate 用） */
  onNavigate?: (pageKey: string, params: Record<string, any>) => void
  /** 渲染用的组件库（多端切换）。默认桌面 antd。 */
  libraryKey?: LibraryKey
  /** 是否启用草稿自动保存（本地 + 服务端，需 formCode+pageKey）。默认关闭。 */
  enableDraft?: boolean
  /** 把本页 pageState 注册为「当前活动页」，供 app 级常驻事件的 page 作用域动作转发。 */
  onActivePageState?: (state: StateScope | null) => void
  /** URL 参数（预览时传入，可在表达式中通过 $url.xxx 访问） */
  urlParams?: Record<string, any>
}

export default function SchemaFormRenderer({
  designSchema,
  bindings = [],
  initialValues = {},
  onSubmit,
  submitLabel = '提交',
  showDefaultSubmit = false,
  onQueryOptions,
  scannerConfig,
  events,
  onScanInterface,
  doPrint,
  onNavigate,
  libraryKey = 'shadcn',
  formCode,
  pageKey,
  enableDraft = false,
  onActivePageState,
  urlParams = {},
}: SchemaFormRendererProps) {
  const [loading, setLoading] = useState(false)
  const valuesRef = useRef<Record<string, any>>(initialValues)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)

  // 按 libraryKey 构建 SchemaField：shadcn 同步可用；移动库动态加载后重建。
  const [registry, setRegistry] = useState<ComponentRegistry>(shadcnComponents)
  useEffect(() => {
    let alive = true
    loadLibrary(libraryKey)
      .then((comps) => { if (alive) setRegistry(comps) })
      .catch(() => { /* 加载失败时保持 shadcn 兜底 */ })
    return () => { alive = false }
  }, [libraryKey])
  const SchemaField = useMemo(
    () => (registry === shadcnComponents ? defaultSchemaField : createSchemaField({ components: registry })),
    [registry],
  )

  // form 实例与 schema 随 designSchema 变化重建
  const form: FormilyForm = useMemo(
    () => createForm({ initialValues }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designSchema],
  )

  const schema = useMemo(() => designSchema?.schema || {}, [designSchema])
  // schema 中是否已含提交类按钮节点（设计器拖入 SubmitButton / ActionButton）；
  // 有则由按钮组件驱动提交，配合 showDefaultSubmit 决定是否再渲染底部兜底按钮。
  const hasSubmitButton = useMemo(() => {
    const json = JSON.stringify(schema || {})
    return json.includes('"SubmitButton"') || json.includes('"ActionButton"')
  }, [schema])
  const formProps = useMemo(() => {
    const f = designSchema?.form || {}
    // 从 schema 根节点提取样式（如果 Form 组件有 x-component-props）
    const rootSchema = designSchema?.schema || {}
    const rootProps = rootSchema['x-component-props'] || {}

    return {
      labelCol: f.labelCol ?? 6,
      wrapperCol: f.wrapperCol ?? 14,
      ...f,
      // 合并根节点的 style 和 className
      style: { ...f.style, ...rootProps.style },
      className: rootProps.className || f.className,
    }
  }, [designSchema])

  // 拉取并写入某字段的动态选项（dataSource）
  const applyOptions = async (fieldPath: string, interfaceCode: string, params: Record<string, any>) => {
    if (!onQueryOptions || !interfaceCode) return
    try {
      const opts = await onQueryOptions(interfaceCode, params)
      const target = form.query(fieldPath).take()
      if (target) {
        ;(target as any).setComponentProps?.({ options: opts })
        ;(target as any).dataSource = opts
      }
    } catch {
      /* 忽略选项拉取错误，不阻断表单 */
    }
  }

  // 监听字段值变化 → 触发 binding 重新拉取选项；同步 valuesRef
  useEffect(() => {
    const effectId = 'schema-form-binding-effects'
    form.addEffects(effectId, () => {
      onFieldValueChange('*', (field: any) => {
        valuesRef.current = form.values
        const addr: string = field?.address?.toString?.() || field?.path?.toString?.() || ''
        const shortName = addr.split('.').pop() || addr
        const triggered = bindingsTriggeredBy(bindings, shortName)
        for (const b of triggered) {
          if (!b.query_interface_code) continue
          const params = buildBindingParamValues(b, form.values)
          applyOptions(b.field, b.query_interface_code, params)
        }
      })
    })
    return () => form.removeEffects(effectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, bindings, onQueryOptions])

  // 页面级统一事件系统：扫码 / 自定义事件 / 字段变更 / 按钮 → 条件 → 动作链
  const triggerButtonRef = useRef<ButtonTrigger>(() => {})
  // 把 Formily form 适配成事件引擎认的 PageState（事件引擎已脱 Formily）
  const pageState = useMemo(
    () => createFormilyPageState(form, () => valuesRef.current, urlParams),
    [form, urlParams],
  )
  // 应用级状态（来自 MultiPageRuntime 的 Provider；旧入口无 Provider 时为 null）
  const appState = useAppState()

  // 把本页 pageState 注册为「当前活动页」，供 app 级常驻事件的 page 作用域动作转发
  useEffect(() => {
    onActivePageState?.(pageState)
    return () => { onActivePageState?.(null) }
  }, [pageState, onActivePageState])

  useEffect(() => {
    // 页面渲染器只处理页面级事件流；scope==='app' 的常驻事件由 MultiPageRuntime 统一注册
    const resolved = events && events.length > 0
      ? events
      : resolvePageEvents({ scanner: scannerConfig })
    const allEvents = resolved.filter(e => e.scope !== 'app')
    if (allEvents.length === 0) return

    const { cleanup, triggerButton, triggerLifecycle } = setupPageEvents(allEvents, {
      pageState,
      appState: appState ?? undefined,
      onScanInterface,
      doPrint,
      navigate: onNavigate,
      toast: (msg: string) => message.info(msg),
    })
    triggerButtonRef.current = triggerButton
    // 进入页面：下一帧触发，确保字段初始值已就绪
    const enterTimer = setTimeout(() => triggerLifecycle('page_enter'), 0)
    return () => {
      clearTimeout(enterTimer)
      // 退出页面：在清理监听前触发，动作仍可读到当前表单值
      try { triggerLifecycle('page_exit') } catch { /* 忽略 */ }
      cleanup()
      triggerButtonRef.current = () => {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, scannerConfig, onScanInterface, doPrint, onNavigate, pageState, appState])

  // ── 草稿自动保存（本地 + 服务端，从 FormRenderer 迁移而来）────────────
  const draftKey = enableDraft && formCode && pageKey ? draftStorageKey(formCode, pageKey) : ''
  const draftReady = useRef(false)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 载入草稿：合并进表单值（仅启用且有 key 时）
  useEffect(() => {
    draftReady.current = false
    if (!draftKey) { draftReady.current = true; return }
    let cancelled = false
    ;(async () => {
      let merged: Record<string, any> = {}
      const local = loadLocalDraft(draftKey)
      if (local) merged = { ...merged, ...local }
      if (formCode && pageKey) {
        const remote = await loadServerDraft(formCode, pageKey)
        if (remote) merged = { ...merged, ...remote }
      }
      if (!cancelled && Object.keys(merged).length > 0) {
        form.setValues(merged, 'merge')
        valuesRef.current = form.values
      }
      if (!cancelled) draftReady.current = true
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, form])

  // 值变更防抖落盘（800ms）；监听复用上方 onFieldValueChange 写入的 valuesRef
  useEffect(() => {
    if (!draftKey) return
    const id = 'schema-form-draft-effects'
    form.addEffects(id, () => {
      onFieldValueChange('*', () => {
        if (!draftReady.current) return
        if (draftTimer.current) clearTimeout(draftTimer.current)
        draftTimer.current = setTimeout(() => {
          const v = form.values
          saveLocalDraft(draftKey, v)
          if (formCode && pageKey) saveServerDraft(formCode, pageKey, v)
          setDraftSavedAt(Date.now())
        }, 800)
      })
    })
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
      form.removeEffects(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, form])

  const clearDraft = () => {
    if (draftKey) clearLocalDraft(draftKey)
    if (formCode && pageKey) clearServerDraft(formCode, pageKey)
    form.reset()
    valuesRef.current = form.values
    setDraftSavedAt(null)
    message.success('草稿已清除')
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const values = await form.submit<Record<string, any>>()
      await onSubmit(values)
      // 提交成功后清除草稿
      if (draftKey) {
        clearLocalDraft(draftKey)
        if (formCode && pageKey) await clearServerDraft(formCode, pageKey)
        setDraftSavedAt(null)
      }
    } catch (e: any) {
      if (e && Array.isArray(e)) {
        // 校验失败：Formily 返回 feedback 数组
        message.error('请检查表单必填项')
      } else if (e?.message) {
        message.error(e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <PrintButtonContext.Provider
      value={{
        print: doPrint
          ? (templateId, extra) => doPrint(templateId, valuesRef.current, extra)
          : undefined,
        triggerButton: (buttonId) => triggerButtonRef.current(buttonId),
      }}
    >
      <FormActionContext.Provider
        value={{
          submit: handleSubmit,
          submitting: loading,
          triggerButton: (buttonId) => triggerButtonRef.current(buttonId),
          navigate: onNavigate,
          callInterface: onScanInterface,
          getFormValues: () => valuesRef.current,
        }}
      >
        <SubmitButtonContext.Provider value={{ submit: handleSubmit, submitting: loading }}>
          <div style={{ padding: 16 }}>
            {draftSavedAt && (
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  草稿已自动保存
                </span>
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:underline"
                  onClick={clearDraft}
                >
                  清除草稿
                </button>
              </div>
            )}
            <FormProvider form={form}>
              <ShadcnFormContainer {...formProps}>
                <SchemaField schema={schema} />
              </ShadcnFormContainer>
            </FormProvider>
            {!hasSubmitButton && showDefaultSubmit && (
              <div className="mt-4">
                <Button disabled={loading} onClick={handleSubmit}>
                  {submitLabel}
                </Button>
              </div>
            )}
          </div>
        </SubmitButtonContext.Provider>
      </FormActionContext.Provider>
    </PrintButtonContext.Provider>
  )
}
