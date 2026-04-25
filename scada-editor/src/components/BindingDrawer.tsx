import { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { PointBinding } from '@/types'

interface Props {
  elementId: string
  onClose: () => void
}

const isChart = (type: string) => type.startsWith('echarts-')
const isGauge = (type: string) => type === 'echarts-gauge'

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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 12 }}>
    <Label>{label}</Label>
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

export default function BindingDrawer({ elementId, onClose }: Props) {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const el = canvas?.elements.find((e) => e.id === elementId)
  if (!el) return null

  const pb = el.pointBinding ?? { pointKey: '', deviceCode: '' }
  const chart = isChart(el.type)
  const gauge = isGauge(el.type)

  // local draft state
  const [draft, setDraft] = useState<PointBinding>({ ...pb })
  // chart series keys: each series is a comma-separated string in the UI
  const [seriesInputs, setSeriesInputs] = useState<string[]>(
    (pb.chartSeriesKeys ?? [[]]).map((arr) => arr.join(', '))
  )
  const [categoryInput, setCategoryInput] = useState(pb.chartCategoryKey ?? '')

  const update = (patch: Partial<PointBinding>) =>
    setDraft((prev) => ({ ...prev, ...patch }))

  const save = () => {
    const binding: PointBinding = {
      ...draft,
      pointKey: draft.pointKey.trim(),
      deviceCode: draft.deviceCode?.trim() ?? '',
    }
    if (chart) {
      binding.chartSeriesKeys = seriesInputs
        .map((s) => s.split(',').map((k) => k.trim()).filter(Boolean))
        .filter((arr) => arr.length > 0)
      binding.chartCategoryKey = categoryInput.trim() || undefined
    }
    store.updateElement(elementId, { pointBinding: binding })
    onClose()
  }

  const clear = () => {
    store.updateElement(elementId, { pointBinding: undefined })
    onClose()
  }

  const addSeries = () => setSeriesInputs((prev) => [...prev, ''])
  const removeSeries = (i: number) => setSeriesInputs((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 10001,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-strong)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        borderRadius: '12px 12px 0 0',
        padding: '0 0 24px',
        maxHeight: '60vh',
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
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>数据绑定</span>
            <span style={{
              marginLeft: 8, fontSize: 10, color: 'var(--text-muted)',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--font-mono)',
            }}>{el.type}</span>
            {el.name && (
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}>{el.name}</span>
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
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>

          {/* Left column — common */}
          <div>
            {!chart && (
              <Field label="点位键 (pointKey)">
                <Inp val={draft.pointKey} onChange={(v) => update({ pointKey: v })} placeholder="device.tag" />
                <Hint>对应实时数据 Map 中的 key，如 temp_01</Hint>
              </Field>
            )}

            {gauge && (
              <Field label="仪表盘值键">
                <Inp
                  val={seriesInputs[0] ?? ''}
                  onChange={(v) => setSeriesInputs([v])}
                  placeholder="gauge_value"
                />
              </Field>
            )}

            <Field label="转换表达式 (transform)">
              <Inp val={draft.transform ?? ''} onChange={(v) => update({ transform: v || undefined })} placeholder="v * 0.01" />
              <Hint>{'变量 v 为原始值，如：v * 0.01  |  Math.round(v)  |  v > 0 ? 1 : 0'}</Hint>
            </Field>

            <Field label="设备编码 (deviceCode)">
              <Inp val={draft.deviceCode ?? ''} onChange={(v) => update({ deviceCode: v })} placeholder="device_001" />
            </Field>

            <Field label="链路名 (linkName)">
              <Inp val={draft.linkName ?? ''} onChange={(v) => update({ linkName: v || undefined })} placeholder="可选" />
            </Field>
          </div>

          {/* Right column — chart series */}
          {chart && !gauge && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Label>系列数据键（每行一个系列，多个键用逗号分隔）</Label>
                <button
                  onClick={addSeries}
                  style={{
                    fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                    background: 'var(--accent-muted)', color: 'var(--accent)',
                    border: '1px solid var(--border-accent)', borderRadius: 3,
                  }}
                >+ 系列</button>
              </div>
              {seriesInputs.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <Inp
                      val={s}
                      onChange={(v) => setSeriesInputs((prev) => prev.map((x, idx) => idx === i ? v : x))}
                      placeholder={`系列${i + 1}: key1, key2, key3`}
                    />
                  </div>
                  {seriesInputs.length > 1 && (
                    <button
                      onClick={() => removeSeries(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0 4px' }}
                    >
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              <Field label="分类轴标签键 (chartCategoryKey)">
                <Inp val={categoryInput} onChange={setCategoryInput} placeholder="可选，对应字符串数组" />
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '0 20px',
          borderTop: '1px solid var(--border)', paddingTop: 12,
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
