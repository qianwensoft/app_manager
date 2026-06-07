import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, message, Space, Tag } from 'antd'
import FieldRenderer from './FieldRenderer'
import { validateForm } from './FieldValidator'
import type { FieldBinding, FieldDef, FieldOption } from './types'
import {
  bindingsTriggeredBy,
  buildBindingParamValues,
  isFieldVisible,
} from './fieldLogic'
import {
  clearLocalDraft,
  clearServerDraft,
  draftStorageKey,
  loadLocalDraft,
  loadServerDraft,
  saveLocalDraft,
  saveServerDraft,
} from './formDraft'
import { eventManager } from './EventHandler'
import type { ScannerConfig } from '@/pages/PageEditorPage'

// ── 扫码过滤工具函数 ─────────────────────────────────────────────────

function passScanFilter(value: string, filters: ScannerConfig['filters'] = {}): boolean {
  if (filters.min_length && value.length < filters.min_length) return false
  if (filters.max_length && value.length > filters.max_length) return false
  if (filters.prefix && !value.startsWith(filters.prefix)) return false
  if (filters.contains && !value.includes(filters.contains)) return false
  if (filters.not_contains && value.includes(filters.not_contains)) return false
  if (filters.regex) {
    try { if (!new RegExp(filters.regex).test(value)) return false } catch { return false }
  }
  return true
}

function resolveNestedField(obj: any, path: string): any {
  return path.split('.').reduce((cur, key) => cur?.[key], obj)
}

type FormRendererProps = {
  fields: FieldDef[]
  bindings?: FieldBinding[]
  initialValues?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
  submitLabel?: string
  formCode?: string
  pageKey?: string
  onQueryOptions?: (interfaceCode: string, paramValues: Record<string, any>) => Promise<FieldOption[]>
  scannerConfig?: ScannerConfig
  onScanInterface?: (interfaceCode: string, paramValues: Record<string, any>) => Promise<any>
}

export default function FormRenderer({
  fields,
  bindings = [],
  initialValues = {},
  onSubmit,
  submitLabel = '提交',
  formCode,
  pageKey,
  onQueryOptions,
  scannerConfig,
  onScanInterface,
}: FormRendererProps) {
  const draftKey = formCode && pageKey ? draftStorageKey(formCode, pageKey) : ''
  const [values, setValues] = useState<Record<string, any>>(initialValues)
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, FieldOption[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      let merged = { ...initialValues }
      if (draftKey) {
        const local = loadLocalDraft(draftKey)
        if (local) merged = { ...merged, ...local }
        if (formCode && pageKey) {
          const remote = await loadServerDraft(formCode, pageKey)
          if (remote) merged = { ...merged, ...remote }
        }
      }
      if (!cancelled) {
        setValues(merged)
        setDraftReady(true)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [draftKey, formCode, pageKey])

  useEffect(() => {
    if (!draftReady || !draftKey) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      saveLocalDraft(draftKey, values)
      if (formCode && pageKey) saveServerDraft(formCode, pageKey, values)
      setDraftSavedAt(Date.now())
    }, 800)
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [values, draftKey, draftReady, formCode, pageKey])

  // ── 扫码模块运行时处理 ────────────────────────────────────────────
  const valuesRef = useRef(values)
  useEffect(() => { valuesRef.current = values }, [values])

  useEffect(() => {
    if (!scannerConfig?.enabled) return

    const handleScan = async (scanValue: string) => {
      if (!passScanFilter(scanValue, scannerConfig.filters)) return

      // 填入原始扫码值
      if (scannerConfig.fill_field) {
        setValues(prev => ({ ...prev, [scannerConfig.fill_field!]: scanValue }))
      }

      // 调用接口
      const ifaceCode = scannerConfig.action?.interface_code
      if (ifaceCode && onScanInterface) {
        try {
          const scanParam = scannerConfig.action?.scan_param || 'code'
          const paramValues: Record<string, any> = { [scanParam]: scanValue }

          // 额外参数
          for (const ep of scannerConfig.action?.extra_params || []) {
            if (!ep.param_key) continue
            if (ep.src === '$scan') {
              paramValues[ep.param_key] = scanValue
            } else if (ep.src.startsWith('$form.')) {
              paramValues[ep.param_key] = valuesRef.current[ep.src.slice(6)]
            } else {
              paramValues[ep.param_key] = ep.src
            }
          }

          const res = await onScanInterface(ifaceCode, paramValues)

          // 回填结果映射
          const rmap = scannerConfig.action?.result_map || []
          if (rmap.length > 0 && res) {
            const updates: Record<string, any> = {}
            for (const { response_field, form_field } of rmap) {
              if (!form_field) continue
              const val = resolveNestedField(res, response_field)
              if (val !== undefined && val !== null) {
                updates[form_field] = val
              }
            }
            if (Object.keys(updates).length > 0) {
              setValues(prev => ({ ...prev, ...updates }))
            }
          }
        } catch (e: any) {
          message.error(`扫码接口错误：${e.message}`)
        }
      }
    }

    eventManager.on('barcode', handleScan)
    eventManager.on('qrcode', handleScan)
    return () => {
      eventManager.off('barcode', handleScan)
      eventManager.off('qrcode', handleScan)
    }
  }, [scannerConfig, onScanInterface])

  const visibleFields = useMemo(
    () => fields.filter(f => isFieldVisible(f, values)),
    [fields, values],
  )

  const reloadBindingOptions = useCallback(async (binding: FieldBinding, sourceValues: Record<string, any>) => {
    if (!onQueryOptions || !binding.query_interface_code) return
    const params = buildBindingParamValues(binding, sourceValues)
    const opts = await onQueryOptions(binding.query_interface_code, params)
    setDynamicOptions(prev => ({ ...prev, [binding.field]: opts }))
  }, [onQueryOptions])

  const reloadFieldOptions = useCallback(async (def: FieldDef, sourceValues: Record<string, any>) => {
    if (!onQueryOptions || !def.options_interface_code) return
    const params: Record<string, any> = {}
    for (const t of def.listen_targets || []) {
      if (sourceValues[t] !== undefined) params[t] = sourceValues[t]
    }
    const opts = await onQueryOptions(def.options_interface_code, params)
    setDynamicOptions(prev => ({ ...prev, [def.field]: opts }))
  }, [onQueryOptions])

  useEffect(() => {
    if (!onQueryOptions) return
    bindings.forEach(b => {
      if (b.query_interface_code && (b.listen_targets || []).length === 0) {
        reloadBindingOptions(b, values).catch(() => {})
      }
    })
    fields.forEach(f => {
      if (f.options_interface_code && !(f.listen_targets || []).length) {
        reloadFieldOptions(f, values).catch(() => {})
      }
    })
  }, [onQueryOptions])

  const handleChange = async (field: string, value: any) => {
    setValues(prev => {
      const next = { ...prev, [field]: value }
      return next
    })
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }

    const nextValues = { ...values, [field]: value }
    const triggered = bindingsTriggeredBy(bindings, field)
    if (triggered.length) {
      setValues(v => {
        const next = { ...v }
        triggered.forEach(b => { next[b.field] = undefined })
        return next
      })
    }
    for (const b of triggered) {
      try {
        await reloadBindingOptions(b, nextValues)
      } catch { /* ignore */ }
    }
    for (const f of fields) {
      if ((f.listen_targets || []).includes(field) && f.options_interface_code) {
        setValues(v => ({ ...v, [f.field]: undefined }))
        try {
          await reloadFieldOptions(f, nextValues)
        } catch { /* ignore */ }
      }
    }
  }

  const handleSubmit = async () => {
    const validationErrors = validateForm(visibleFields, values)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      message.error('请检查表单错误')
      return
    }
    setLoading(true)
    try {
      await onSubmit(values)
      if (draftKey) clearLocalDraft(draftKey)
      if (formCode && pageKey) await clearServerDraft(formCode, pageKey)
      message.success('提交成功')
    } catch (e: any) {
      message.error(e.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const clearDraft = () => {
    if (draftKey) clearLocalDraft(draftKey)
    if (formCode && pageKey) clearServerDraft(formCode, pageKey)
    setValues({ ...initialValues })
    setDraftSavedAt(null)
    message.success('草稿已清除')
  }

  return (
    <div className="form-renderer-root" style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      {draftSavedAt && (
        <div style={{ marginBottom: 12 }}>
          <Tag color="blue">草稿已自动保存</Tag>
          <Button type="link" size="small" onClick={clearDraft}>清除草稿</Button>
        </div>
      )}
      {visibleFields.map(def => {
        const opts = dynamicOptions[def.field] ?? def.options
        return (
          <FieldRenderer
            key={def.field}
            def={{ ...def, options: opts }}
            value={values[def.field]}
            onChange={val => handleChange(def.field, val)}
            error={errors[def.field]}
          />
        )
      })}
      <Space style={{ marginTop: 16 }}>
        <Button type="primary" onClick={handleSubmit} loading={loading}>
          {submitLabel}
        </Button>
      </Space>
    </div>
  )
}
