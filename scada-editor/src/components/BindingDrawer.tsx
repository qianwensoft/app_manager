import { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { PointBinding } from '@/types'
import { getChartSchema, type BindingFieldDef } from '@/schema/chartSchema'

interface Props {
  elementId: string
  onClose: () => void
}

const Inp = ({ val, onChange, placeholder = '' }: {
  val: string; onChange: (v: string) => void; placeholder?: string
}) => (
  <input
    value={val}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%', height: 28, background: 'var(--bg-base)',
      border: '1px solid var(--border)', color: 'var(--text-primary)',
      padding: '0 8px', borderRadius: 'var(--radius-sm)', fontSize: 12,
      outline: 'none', fontFamily: 'var(--font-mono)',
    }}
    onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
  />
)

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{children}</div>
)

const Field = ({ label, optional, children }: {
  label: string; optional?: boolean; children: React.ReactNode
}) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <Label>{label}</Label>
      {optional && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-overlay)',
          padding: '1px 4px', borderRadius: 2, border: '1px solid var(--border)' }}>可选</span>
      )}
    </div>
    {children}
  </div>
)

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '5px 8px', marginTop: 4,
    fontFamily: 'var(--font-mono)',
  }}>
    {children}
  </div>
)

// ── 图表绑定字段渲染 ──────────────────────────────────────────────────────────

interface ChartBindingState {
  // seriesKeys[i] 对应 schema 中 seriesIndex=i 的字段，存为逗号分隔字符串
  seriesInputs: string[]
  categoryInput: string
}

function initChartState(pb: PointBinding, fieldCount: number): ChartBindingState {
  const seriesInputs: string[] = []
  for (let i = 0; i < fieldCount; i++) {
    seriesInputs.push((pb.chartSeriesKeys?.[i] ?? []).join(', '))
  }
  return {
    seriesInputs,
    categoryInput: pb.chartCategoryKey ?? '',
  }
}

function ChartBindingFields({
  fields,
  state,
  onChange,
}: {
  fields: BindingFieldDef[]
  state: ChartBindingState
  onChange: (s: ChartBindingState) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {fields.map((f) => {
        if (f.kind === 'category') {
          return (
            <Field key={f.key} label={f.label} optional={f.optional}>
              <Inp
                val={state.categoryInput}
                onChange={(v) => onChange({ ...state, categoryInput: v })}
                placeholder={f.placeholder}
              />
              {f.hint && <Hint>{f.hint}</Hint>}
            </Field>
          )
        }
        // series or single — indexed by seriesIndex
        const idx = f.seriesIndex ?? 0
        return (
          <Field key={f.key} label={f.label} optional={f.optional}>
            <Inp
              val={state.seriesInputs[idx] ?? ''}
              onChange={(v) => {
                const next = [...state.seriesInputs]
                next[idx] = v
                onChange({ ...state, seriesInputs: next })
              }}
              placeholder={f.placeholder}
            />
            {f.hint && <Hint>{f.hint}</Hint>}
          </Field>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BindingDrawer({ elementId, onClose }: Props) {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const el = canvas?.elements.find((e) => e.id === elementId)
  if (!el) return null

  const pb = el.pointBinding ?? { pointKey: '', deviceCode: '' }
  const schema = getChartSchema(el.type)
  const isChart = !!schema

  // max seriesIndex across bindingFields
  const maxSeriesIdx = schema
    ? Math.max(0, ...schema.bindingFields.filter((f) => f.kind !== 'category').map((f) => f.seriesIndex ?? 0))
    : 0

  const [draft, setDraft] = useState<PointBinding>({ ...pb })
  const [chartState, setChartState] = useState<ChartBindingState>(() =>
    initChartState(pb, maxSeriesIdx + 1)
  )

  const update = (patch: Partial<PointBinding>) =>
    setDraft((prev) => ({ ...prev, ...patch }))

  const save = () => {
    const binding: PointBinding = {
      ...draft,
      pointKey: draft.pointKey?.trim() ?? '',
      deviceCode: draft.deviceCode?.trim() ?? '',
    }
    if (isChart && schema) {
      binding.chartSeriesKeys = chartState.seriesInputs.map((s) =>
        s.split(',').map((k) => k.trim()).filter(Boolean)
      )
      binding.chartCategoryKey = chartState.categoryInput.trim() || undefined
    }
    store.updateElement(elementId, { pointBinding: binding })
    onClose()
  }

  const clear = () => {
    store.updateElement(elementId, { pointBinding: undefined })
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000 }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 10001,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-strong)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        borderRadius: '12px 12px 0 0',
        padding: '0 0 24px',
        maxHeight: '65vh',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 12px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>数据绑定</span>
            <span style={{
              fontSize: 10, color: 'var(--text-muted)',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--font-mono)',
            }}>{el.type}</span>
            {schema && (
              <span style={{
                fontSize: 10, color: 'var(--accent)',
                background: 'var(--accent-muted)', border: '1px solid var(--border-accent)',
                borderRadius: 3, padding: '1px 5px',
              }}>{schema.label}</span>
            )}
            {el.name && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{el.name}</span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>

          {/* Left — common fields */}
          <div>
            {/* 非图表元素：pointKey */}
            {!isChart && (
              <Field label="点位键 (pointKey)">
                <Inp val={draft.pointKey ?? ''} onChange={(v) => update({ pointKey: v })} placeholder="device.tag" />
                <Hint>对应实时数据 Map 中的 key，如 temp_01</Hint>
              </Field>
            )}

            <Field label="转换表达式 (transform)">
              <Inp
                val={draft.transform ?? ''}
                onChange={(v) => update({ transform: v || undefined })}
                placeholder="v * 0.01"
              />
              <Hint>{'变量 v 为原始值，如：v * 0.01  |  Math.round(v)  |  v > 0 ? 1 : 0'}</Hint>
            </Field>

            <Field label="设备编码 (deviceCode)">
              <Inp val={draft.deviceCode ?? ''} onChange={(v) => update({ deviceCode: v })} placeholder="device_001" />
            </Field>

            <Field label="链路名 (linkName)" optional>
              <Inp val={draft.linkName ?? ''} onChange={(v) => update({ linkName: v || undefined })} placeholder="可选" />
            </Field>
          </div>

          {/* Right — chart binding fields from schema */}
          {isChart && schema && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                marginBottom: 12, paddingBottom: 6,
                borderBottom: '1px solid var(--border)',
              }}>
                {schema.label} 数据绑定
              </div>
              <ChartBindingFields
                fields={schema.bindingFields}
                state={chartState}
                onChange={setChartState}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '12px 20px 0',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={clear}
            style={{
              padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              background: 'var(--danger-muted)', color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)',
            }}
          >清除绑定</button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            }}
          >取消</button>
          <button
            onClick={save}
            style={{
              padding: '6px 16px', fontSize: 12, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
            }}
          >保存</button>
        </div>
      </div>
    </>
  )
}
