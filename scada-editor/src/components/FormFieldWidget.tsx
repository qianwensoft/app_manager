import { useState, useEffect } from 'react'
import type { CanvasElement, CanvasData, FormFieldRule, FormFieldReaction } from '@/types'
import type { PointDataMap } from '@/hooks/useStompPointData'
import { dataBindingApi } from '@/api/dataBinding'
import { mergeAnimStyle } from '@/runtime/animationExecutor'

// ── validation event ──────────────────────────────────────────────────────────

function dispatchFormErrors(groupId: string, errors: Record<string, string>) {
  window.dispatchEvent(new CustomEvent('scada:form-errors', { detail: { groupId, errors } }))
}

function dispatchFormClearErrors(groupId: string) {
  window.dispatchEvent(new CustomEvent('scada:form-errors', { detail: { groupId, errors: {} } }))
}

// reaction value event: a field broadcasts its current value so siblings can react
function dispatchFieldValue(groupId: string, fieldKey: string, value: string) {
  window.dispatchEvent(new CustomEvent('scada:field-value', { detail: { groupId, fieldKey, value } }))
}

// ── built-in rule validators ──────────────────────────────────────────────────

const PATTERNS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  phone: /^1[3-9]\d{9}$/,
  idcard: /^\d{17}[\dXx]$/,
}

function applyRule(rule: FormFieldRule, value: string, fieldLabel: string): string | null {
  const label = fieldLabel || '该字段'
  if (rule.required && !value.trim()) return rule.message ?? `${label} 不能为空`
  if (!value.trim()) return null
  if (rule.type && rule.type !== 'string' && rule.type !== 'number' && rule.type !== 'pattern') {
    const re = PATTERNS[rule.type]
    if (re && !re.test(value)) return rule.message ?? `${label} 格式不正确`
  }
  if (rule.type === 'pattern' && rule.pattern) {
    try {
      if (!new RegExp(rule.pattern).test(value)) return rule.message ?? `${label} 格式不正确`
    } catch { /* bad regex */ }
  }
  if (rule.min !== undefined) {
    const numVal = Number(value)
    if (rule.type === 'number' && !isNaN(numVal)) {
      if (numVal < rule.min) return rule.message ?? `${label} 最小值为 ${rule.min}`
    } else if (value.length < rule.min) {
      return rule.message ?? `${label} 最少 ${rule.min} 个字符`
    }
  }
  if (rule.max !== undefined) {
    const numVal = Number(value)
    if (rule.type === 'number' && !isNaN(numVal)) {
      if (numVal > rule.max) return rule.message ?? `${label} 最大值为 ${rule.max}`
    } else if (value.length > rule.max) {
      return rule.message ?? `${label} 最多 ${rule.max} 个字符`
    }
  }
  if (rule.validator) {
    try {
      const fn = new Function('value', 'rule', `return (${rule.validator})(value, rule)`)
      const result = fn(value, rule)
      if (typeof result === 'string') return result
    } catch (e) {
      return `${label} 验证出错: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  return null
}

function validateField(el: CanvasElement, value: string): string {
  const label = el.formFieldLabel || el.formFieldKey || ''
  if (el.formFieldRequired && !value.trim()) return `${label || '该字段'} 不能为空`
  for (const rule of el.formFieldRules ?? []) {
    const err = applyRule(rule, value, label)
    if (err) return err
  }
  return ''
}

// ── reaction engine ───────────────────────────────────────────────────────────

function evalReactions(
  reactions: FormFieldReaction[],
  watchedValues: Record<string, string>,
): { visible: boolean; required: boolean; overrideValue: string | undefined } {
  let visible = true, required = false
  let overrideValue: string | undefined = undefined
  for (const r of reactions) {
    const watched = watchedValues[r.watch] ?? ''
    let triggered = false
    if (r.when) {
      try { triggered = !!new Function('$deps', `return (${r.when})`)([watched]) } catch { /* ignore */ }
    } else {
      triggered = !!watched
    }
    const branch = triggered ? r.fulfill : r.otherwise
    if (branch?.state) {
      if (branch.state.visible !== undefined) visible = branch.state.visible
      if (branch.state.required !== undefined) required = branch.state.required
      if (branch.state.value !== undefined) {
        try {
          overrideValue = String(new Function('$deps', `return (${branch.state.value})`)([watched]))
        } catch { /* ignore */ }
      }
    }
  }
  return { visible, required, overrideValue }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function collectGroupValues(
  groupId: string,
  canvasElements: CanvasElement[],
  valuesRef: React.MutableRefObject<Record<string, string>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const el of canvasElements) {
    if (el.formGroupId !== groupId || !el.formFieldKey) continue
    if (el.type === 'form-submit') continue
    result[el.formFieldKey] = valuesRef.current[el.id] ?? el.formFieldDefaultValue ?? ''
  }
  return result
}

function validateGroup(
  groupId: string,
  canvasElements: CanvasElement[],
  valuesRef: React.MutableRefObject<Record<string, string>>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const el of canvasElements) {
    if (el.formGroupId !== groupId || !el.formFieldKey) continue
    if (el.type === 'form-submit') continue
    const val = valuesRef.current[el.id] ?? el.formFieldDefaultValue ?? ''
    const err = validateField(el, val)
    if (err) errors[el.formFieldKey] = err
  }
  return errors
}

// ── submit handler ────────────────────────────────────────────────────────────

async function submitForm(
  el: CanvasElement,
  canvas: CanvasData,
  valuesRef: React.MutableRefObject<Record<string, string>>,
  setStatus: (s: 'idle' | 'loading' | 'ok' | 'err') => void,
  setErrMsg: (m: string) => void,
) {
  if (!el.formGroupId) return

  const validationErrors = validateGroup(el.formGroupId, canvas.elements, valuesRef)
  if (Object.keys(validationErrors).length > 0) {
    dispatchFormErrors(el.formGroupId, validationErrors)
    return
  }
  dispatchFormClearErrors(el.formGroupId)

  let payload: Record<string, unknown> = collectGroupValues(el.formGroupId, canvas.elements, valuesRef)
  if (el.formSubmitParamJson) {
    try { Object.assign(payload, JSON.parse(el.formSubmitParamJson)) } catch { /* ignore */ }
  }

  if (el.formBeforeScript?.trim()) {
    try {
      const fn = new Function('data', `return (async (data) => { ${el.formBeforeScript} })(data)`)
      const result = await fn(payload)
      if (result === false) return
      if (result !== undefined && result !== null) payload = result as Record<string, unknown>
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrMsg(msg)
      setStatus('err')
      setTimeout(() => { setStatus('idle'); setErrMsg('') }, 3000)
      return
    }
  }

  if (!el.formSubmitWebhookId) {
    console.warn('[FormFieldWidget] no formSubmitWebhookId on submit button', el.id)
    return
  }

  setStatus('loading')
  try {
    const webhooks = await dataBindingApi.listOutboundWebhooks(el.formSubmitAppId ?? 0)
    const wh = webhooks.data.find((w) => w.id === el.formSubmitWebhookId)
    if (!wh) throw new Error('webhook not found')
    const res = await fetch(`/api/outbound/apps/${el.formSubmitAppId}/webhooks/${el.formSubmitWebhookId}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setStatus('ok')
    dispatchFormClearErrors(el.formGroupId)
    setTimeout(() => setStatus('idle'), 2000)
  } catch (e) {
    console.error('[FormFieldWidget] submit error', e)
    setStatus('err')
    setTimeout(() => setStatus('idle'), 3000)
  }
}

// ── shared styles ─────────────────────────────────────────────────────────────

function baseInputStyle(el: CanvasElement, zoom: number, hasError?: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: hasError ? '#f87171' : (el.fontColor || '#ccc'),
    fontSize: (el.fontSize ?? 13) * zoom,
    fontFamily: el.fontFamily || 'sans-serif',
    padding: `0 ${6 * zoom}px`,
    boxSizing: 'border-box',
  }
}

// ── error text overlay ────────────────────────────────────────────────────────

function ErrorTip({ msg, zoom }: { msg: string; zoom: number }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: -18 * zoom,
      left: 0,
      fontSize: 10 * zoom,
      color: '#f87171',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 9999,
    }}>
      {msg}
    </div>
  )
}

// ── shared label row ──────────────────────────────────────────────────────────

function LabelRow({ el, zoom, required, children }: { el: CanvasElement; zoom: number; required?: boolean; children: React.ReactNode }) {
  const isRequired = required ?? el.formFieldRequired
  if (!el.formFieldLabel) return <>{children}</>
  const labelW = Math.min(el.width * zoom * 0.35, 90 * zoom)
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
      <span style={{
        width: labelW, flexShrink: 0, paddingLeft: 6 * zoom,
        fontSize: (el.fontSize ?? 13) * zoom, color: el.fontColor || '#aaa',
        fontFamily: el.fontFamily || 'sans-serif',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {el.formFieldLabel}{isRequired ? <span style={{ color: '#f87171', marginLeft: 2 }}>*</span> : null}
      </span>
      <div style={{ flex: 1, height: '100%' }}>{children}</div>
    </div>
  )
}

// ── field renderers ───────────────────────────────────────────────────────────

interface FieldProps {
  el: CanvasElement
  zoom: number
  isPreview: boolean
  value: string
  onChange: (v: string) => void
  error?: string
  required?: boolean
}

function FormFieldInput({ el, zoom, isPreview, value, onChange, error, required }: FieldProps) {
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <input
        type={el.type === 'form-number' ? 'number' : el.type === 'form-date' ? 'date' : 'text'}
        value={value}
        placeholder={el.formFieldPlaceholder || ''}
        disabled={!isPreview}
        onChange={(e) => onChange(e.target.value)}
        style={baseInputStyle(el, zoom, !!error)}
      />
    </LabelRow>
  )
}

function FormFieldTextarea({ el, zoom, isPreview, value, onChange, error, required }: FieldProps) {
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <textarea
        value={value}
        placeholder={el.formFieldPlaceholder || ''}
        disabled={!isPreview}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...baseInputStyle(el, zoom, !!error), resize: 'none', paddingTop: 4 * zoom }}
      />
    </LabelRow>
  )
}

function FormFieldSelect({ el, zoom, isPreview, value, onChange, error, required }: FieldProps) {
  const options = (el.formFieldOptions || '').split(',').map((s) => s.trim()).filter(Boolean)
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <select
        value={value}
        disabled={!isPreview}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...baseInputStyle(el, zoom, !!error), cursor: isPreview ? 'pointer' : 'default' }}
      >
        <option value="">{el.formFieldPlaceholder || '请选择'}</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </LabelRow>
  )
}

function FormFieldSwitch({ el, zoom, isPreview, value, onChange, required }: FieldProps) {
  const on = value === 'true' || value === '1'
  const trackW = 32 * zoom
  const trackH = 18 * zoom
  const knobSize = 14 * zoom
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 * zoom, height: '100%' }}>
        <div
          onClick={() => isPreview && onChange(on ? 'false' : 'true')}
          style={{
            width: trackW, height: trackH, borderRadius: trackH / 2,
            background: on ? '#4a9eff' : 'rgba(255,255,255,0.2)',
            position: 'relative', cursor: isPreview ? 'pointer' : 'default',
            transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute',
            top: (trackH - knobSize) / 2,
            left: on ? trackW - knobSize - (trackH - knobSize) / 2 : (trackH - knobSize) / 2,
            width: knobSize, height: knobSize, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }} />
        </div>
      </div>
    </LabelRow>
  )
}

function FormFieldRadio({ el, zoom, isPreview, value, onChange, required }: FieldProps) {
  const options = (el.formFieldOptions || '').split(',').map((s) => s.trim()).filter(Boolean)
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: `${4 * zoom}px`, paddingLeft: 6 * zoom, height: '100%' }}>
        {options.map((opt) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 3 * zoom, cursor: isPreview ? 'pointer' : 'default', userSelect: 'none' }}>
            <input
              type="radio"
              disabled={!isPreview}
              checked={value === opt}
              onChange={() => onChange(opt)}
              style={{ accentColor: '#4a9eff', width: 12 * zoom, height: 12 * zoom }}
            />
            <span style={{ color: el.fontColor || '#ccc', fontSize: (el.fontSize ?? 13) * zoom }}>{opt}</span>
          </label>
        ))}
      </div>
    </LabelRow>
  )
}

function FormFieldCheckbox({ el, zoom, isPreview, value, onChange, required }: FieldProps) {
  const options = (el.formFieldOptions || '').split(',').map((s) => s.trim()).filter(Boolean)
  const checked = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
  const toggle = (opt: string) => {
    const next = checked.includes(opt) ? checked.filter((v) => v !== opt) : [...checked, opt]
    onChange(next.join(','))
  }
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: `${4 * zoom}px`, paddingLeft: 6 * zoom, height: '100%' }}>
        {options.map((opt) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 3 * zoom, cursor: isPreview ? 'pointer' : 'default', userSelect: 'none' }}>
            <input
              type="checkbox"
              disabled={!isPreview}
              checked={checked.includes(opt)}
              onChange={() => toggle(opt)}
              style={{ accentColor: '#4a9eff', width: 12 * zoom, height: 12 * zoom }}
            />
            <span style={{ color: el.fontColor || '#ccc', fontSize: (el.fontSize ?? 13) * zoom }}>{opt}</span>
          </label>
        ))}
      </div>
    </LabelRow>
  )
}

function FormFieldRate({ el, zoom, isPreview, value, onChange, required }: FieldProps) {
  const max = 5
  const current = Number(value) || 0
  const [hover, setHover] = useState(-1)
  const display = isPreview && hover >= 0 ? hover + 1 : current
  const starSize = Math.min(el.height * zoom * 0.55, 24 * zoom)
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 * zoom, gap: 2 * zoom, height: '100%' }}>
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            onClick={() => isPreview && onChange(String(i + 1))}
            onMouseEnter={() => isPreview && setHover(i)}
            onMouseLeave={() => isPreview && setHover(-1)}
            style={{
              fontSize: starSize, lineHeight: 1,
              cursor: isPreview ? 'pointer' : 'default',
              color: i < display ? '#f59e0b' : 'rgba(255,255,255,0.2)',
              transition: 'color 0.1s', userSelect: 'none',
            }}
          >★</span>
        ))}
      </div>
    </LabelRow>
  )
}

function FormFieldSlider({ el, zoom, isPreview, value, onChange, required }: FieldProps) {
  const num = Number(value) || 0
  return (
    <LabelRow el={el} zoom={zoom} required={required}>
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 * zoom, paddingRight: 6 * zoom, gap: 8 * zoom, height: '100%', flex: 1 }}>
        <input
          type="range" min={0} max={100} value={num}
          disabled={!isPreview}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, accentColor: '#4a9eff' }}
        />
        <span style={{ color: el.fontColor || '#ccc', fontSize: (el.fontSize ?? 13) * zoom, minWidth: 28 * zoom, textAlign: 'right' }}>{num}</span>
      </div>
    </LabelRow>
  )
}

// ── submit button ─────────────────────────────────────────────────────────────

interface SubmitProps {
  el: CanvasElement
  zoom: number
  isPreview: boolean
  canvas: CanvasData
  valuesRef: React.MutableRefObject<Record<string, string>>
}

function FormSubmitButton({ el, zoom, isPreview, canvas, valuesRef }: SubmitProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const label = status === 'loading' ? '提交中…' : status === 'ok' ? '✓ 成功' : status === 'err' ? (errMsg || '✗ 失败') : (el.text || '提交')
  const bg = status === 'ok' ? '#27ae60' : status === 'err' ? '#c0392b' : (el.fill || '#2980b9')
  return (
    <div
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, borderRadius: (el.borderRadius ?? 4) * zoom,
        color: el.fontColor || '#fff', fontSize: (el.fontSize ?? 14) * zoom,
        fontFamily: el.fontFamily || 'sans-serif',
        cursor: isPreview && status === 'idle' ? 'pointer' : 'default',
        transition: 'background 0.2s', userSelect: 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        padding: `0 ${4 * zoom}px`,
      }}
      onClick={() => { if (isPreview && status === 'idle') submitForm(el, canvas, valuesRef, setStatus, setErrMsg) }}
    >
      {label}
    </div>
  )
}

// ── main export ───────────────────────────────────────────────────────────────

interface Props {
  el: CanvasElement
  zoom: number
  isPreview: boolean
  canvas: CanvasData
  valuesRef: React.MutableRefObject<Record<string, string>>
  pointData?: PointDataMap
}

export default function FormFieldWidget({ el, zoom, isPreview, canvas, valuesRef, pointData = {} }: Props) {
  const [value, setValue] = useState<string>(() => valuesRef.current[el.id] ?? el.formFieldDefaultValue ?? '')
  const [error, setError] = useState<string>('')
  // watched values from sibling fields (keyed by formFieldKey) for reactions
  const [watchedValues, setWatchedValues] = useState<Record<string, string>>({})

  const handleChange = (v: string) => {
    valuesRef.current[el.id] = v
    setValue(v)
    if (error) setError('')
    // broadcast so sibling fields with reactions can update
    if (el.formGroupId && el.formFieldKey) {
      dispatchFieldValue(el.formGroupId, el.formFieldKey, v)
    }
  }

  // init default
  useEffect(() => {
    if (valuesRef.current[el.id] === undefined && el.formFieldDefaultValue) {
      valuesRef.current[el.id] = el.formFieldDefaultValue
      setValue(el.formFieldDefaultValue)
    }
  }, [el.id, el.formFieldDefaultValue, valuesRef])

  // listen for validation errors
  useEffect(() => {
    if (el.type === 'form-submit' || !el.formGroupId || !el.formFieldKey) return
    const handler = (e: Event) => {
      const { groupId, errors } = (e as CustomEvent<{ groupId: string; errors: Record<string, string> }>).detail
      if (groupId !== el.formGroupId) return
      setError(errors[el.formFieldKey!] ?? '')
    }
    window.addEventListener('scada:form-errors', handler)
    return () => window.removeEventListener('scada:form-errors', handler)
  }, [el.type, el.formGroupId, el.formFieldKey])

  // listen for sibling field value changes (for reactions)
  useEffect(() => {
    if (!el.formGroupId || !el.formFieldReactions?.length) return
    const handler = (e: Event) => {
      const { groupId, fieldKey, value: fv } = (e as CustomEvent<{ groupId: string; fieldKey: string; value: string }>).detail
      if (groupId !== el.formGroupId) return
      setWatchedValues((prev) => ({ ...prev, [fieldKey]: fv }))
    }
    window.addEventListener('scada:field-value', handler)
    return () => window.removeEventListener('scada:field-value', handler)
  }, [el.formGroupId, el.formFieldReactions])

  // evaluate reactions
  const reactions = el.formFieldReactions ?? []
  const { visible: rxVisible, required: rxRequired, overrideValue } = evalReactions(reactions, watchedValues)

  // apply overrideValue from reaction
  useEffect(() => {
    if (overrideValue !== undefined && overrideValue !== value) {
      valuesRef.current[el.id] = overrideValue
      setValue(overrideValue)
    }
  }, [overrideValue]) // eslint-disable-line react-hooks/exhaustive-deps

  // hidden by reaction
  if (!rxVisible) return null

  const hasError = !!error
  const effectiveRequired = rxRequired || !!el.formFieldRequired

  const wrapStyle: React.CSSProperties = mergeAnimStyle(el, pointData, {
    position: 'absolute',
    left: el.x * zoom, top: el.y * zoom,
    width: el.width * zoom, height: el.height * zoom,
    zIndex: el.zIndex, opacity: el.opacity ?? 1,
    background: el.fill || 'rgba(255,255,255,0.06)',
    border: `${(el.strokeWidth ?? 1) * zoom}px solid ${hasError ? '#f87171' : (el.stroke || 'rgba(255,255,255,0.18)')}`,
    borderRadius: (el.borderRadius ?? 3) * zoom,
    boxSizing: 'border-box', overflow: 'visible',
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    pointerEvents: isPreview ? 'auto' : 'none',
  })

  if (el.type === 'form-submit') {
    return (
      <div style={{ ...wrapStyle, background: 'transparent', border: 'none', padding: 0, overflow: 'hidden' }}>
        <FormSubmitButton el={el} zoom={zoom} isPreview={isPreview} canvas={canvas} valuesRef={valuesRef} />
      </div>
    )
  }

  const fieldProps: FieldProps = { el, zoom, isPreview, value, onChange: handleChange, error, required: effectiveRequired }

  const inner = (() => {
    switch (el.type) {
      case 'form-select':   return <FormFieldSelect   {...fieldProps} />
      case 'form-textarea': return <FormFieldTextarea {...fieldProps} />
      case 'form-switch':   return <FormFieldSwitch   {...fieldProps} />
      case 'form-radio':    return <FormFieldRadio    {...fieldProps} />
      case 'form-checkbox': return <FormFieldCheckbox {...fieldProps} />
      case 'form-rate':     return <FormFieldRate     {...fieldProps} />
      case 'form-slider':   return <FormFieldSlider   {...fieldProps} />
      default:              return <FormFieldInput    {...fieldProps} />
    }
  })()

  return (
    <div style={wrapStyle}>
      {inner}
      {hasError && <ErrorTip msg={error} zoom={zoom} />}
    </div>
  )
}
