import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scadaApi } from '@/api/scada'
import type { ScadaSimPoint } from '@/types'

const MODES = ['random', 'random_walk', 'sine', 'ramp', 'constant'] as const
type Mode = typeof MODES[number]

const MODE_LABELS: Record<Mode, string> = {
  random:      '随机',
  random_walk: '随机游走',
  sine:        '正弦波',
  ramp:        '斜坡',
  constant:    '常量',
}

const MODE_COLOR: Record<Mode, string> = {
  sine:        '#4a9eff',
  random:      '#f59e0b',
  random_walk: '#a78bfa',
  ramp:        '#34d399',
  constant:    '#94a3b8',
}

function defaultParams(mode: Mode): string {
  switch (mode) {
    case 'random':      return JSON.stringify({ min: 0, max: 100 })
    case 'random_walk': return JSON.stringify({ min: 0, max: 100, step: 5 })
    case 'sine':        return JSON.stringify({ amplitude: 50, period: 10, offset: 50 })
    case 'ramp':        return JSON.stringify({ min: 0, max: 100, step: 1 })
    case 'constant':    return JSON.stringify({ value: 42 })
  }
}

const inp: React.CSSProperties = {
  height: 28, padding: '0 8px', fontSize: 12,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const sel: React.CSSProperties = {
  ...inp, padding: '0 6px', cursor: 'pointer',
}

function btn(accent = false, danger = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm)',
    background: danger ? 'var(--danger-muted)' : accent ? 'var(--accent)' : 'var(--bg-surface)',
    color: danger ? 'var(--danger)' : accent ? '#fff' : 'var(--text-secondary)',
    border: danger ? '1px solid rgba(239,68,68,0.25)' : accent ? 'none' : '1px solid var(--border-strong)',
    fontSize: 11, fontWeight: 500, cursor: 'pointer',
  }
}

/* ── Inline row editor ── */
function RowEditor({ initial, scadaCode, onSave, onCancel, saving }: {
  initial: Partial<ScadaSimPoint>
  scadaCode: string
  onSave: (v: Partial<ScadaSimPoint>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<Partial<ScadaSimPoint>>({
    scada_code: scadaCode,
    link_name: '',
    enabled: true,
    mode: 'random',
    interval_ms: 1000,
    params_json: defaultParams('random'),
    ...initial,
  })
  const set = (k: keyof ScadaSimPoint, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const handleMode = (mode: Mode) => setForm(f => ({ ...f, mode, params_json: defaultParams(mode) }))

  return (
    <div
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000,
      }}
    >
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
        borderRadius: 10, width: 420, padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          {form.id ? '编辑点位' : '新建点位'}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>组态编码 (scada_code)</span>
          <input style={inp} value={form.scada_code ?? ''} onChange={e => set('scada_code', e.target.value)} placeholder="my_scada" />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>点位键 (link_name)</span>
          <input style={inp} value={form.link_name ?? ''} onChange={e => set('link_name', e.target.value)} placeholder="temp_01" autoFocus={!form.id} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>模式</span>
            <select style={sel} value={form.mode ?? 'random'} onChange={e => handleMode(e.target.value as Mode)}>
              {MODES.map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>推送间隔 (ms)</span>
            <input style={inp} type="number" min={100} step={100}
              value={form.interval_ms ?? 1000} onChange={e => set('interval_ms', Number(e.target.value))} />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>参数 JSON</span>
          <textarea
            value={form.params_json ?? '{}'}
            onChange={e => set('params_json', e.target.value)}
            rows={3}
            style={{ ...inp, height: 'auto', padding: '6px 8px', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={form.enabled ?? true} onChange={e => set('enabled', e.target.checked)} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>启用</span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button style={btn()} onClick={onCancel}>取消</button>
          <button style={btn(true)} onClick={() => onSave(form)} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Modal ── */
interface Props {
  scadaCode: string
  onClose: () => void
}

export default function SimPointsModal({ scadaCode, onClose }: Props) {
  const qc = useQueryClient()
  const [filterCode, setFilterCode] = useState(scadaCode)
  const [editing, setEditing] = useState<Partial<ScadaSimPoint> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['scada', 'sim-points', filterCode],
    queryFn: () => scadaApi.listSimPoints(filterCode || undefined).then(r => r.data),
  })

  const create = useMutation({
    mutationFn: (body: Partial<ScadaSimPoint>) => scadaApi.createSimPoint(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scada', 'sim-points'] }); setEditing(null) },
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ScadaSimPoint> }) => scadaApi.updateSimPoint(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scada', 'sim-points'] }); setEditing(null) },
  })

  const del = useMutation({
    mutationFn: (id: number) => scadaApi.deleteSimPoint(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scada', 'sim-points'] }),
  })

  const handleSave = (form: Partial<ScadaSimPoint>) => {
    if (form.id) update.mutate({ id: form.id, body: form })
    else create.mutate(form)
  }

  const rows = data ?? []

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10500 }} />

      {/* Modal */}
      <div
        onKeyDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', inset: 0, zIndex: 10501,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          width: 720, maxHeight: '80vh',
          background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
          borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'all',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px 12px', borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>模拟点位管理</span>
              {scadaCode && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--accent-muted)', color: 'var(--accent)',
                  border: '1px solid var(--border-accent)', fontFamily: 'var(--font-mono)',
                }}>{scadaCode}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                style={btn(true)}
                onClick={() => setEditing({ scada_code: scadaCode, link_name: '', enabled: true, mode: 'random', interval_ms: 1000, params_json: defaultParams('random') })}
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新建点位
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              style={{ ...inp, width: 220 }}
              placeholder="按 scada_code 筛选…"
              value={filterCode}
              onChange={e => setFilterCode(e.target.value)}
            />
            {filterCode !== scadaCode && scadaCode && (
              <button style={btn()} onClick={() => setFilterCode(scadaCode)}>
                回到当前组态
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              {rows.length} 条
            </span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  {['组态编码', '点位键', '模式', '间隔(ms)', '状态', '操作'].map(h => (
                    <th key={h} style={{
                      padding: '7px 12px', textAlign: 'left', fontWeight: 600,
                      color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.05em',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>加载中…</td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ marginBottom: 12 }}>暂无点位</div>
                      <button style={btn(true)} onClick={() => setEditing({ scada_code: scadaCode, link_name: '', enabled: true, mode: 'random', interval_ms: 1000, params_json: defaultParams('random') })}>
                        新建第一个点位
                      </button>
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: row.scada_code === scadaCode ? 'var(--accent)' : 'var(--text-secondary)',
                        background: row.scada_code === scadaCode ? 'var(--accent-muted)' : 'var(--bg-base)',
                        border: `1px solid ${row.scada_code === scadaCode ? 'var(--border-accent)' : 'var(--border)'}`,
                        padding: '1px 6px', borderRadius: 3,
                      }}>{row.scada_code}</span>
                    </td>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {row.link_name}
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                        background: `${MODE_COLOR[row.mode as Mode] ?? '#64748b'}18`,
                        color: MODE_COLOR[row.mode as Mode] ?? '#64748b',
                        border: `1px solid ${MODE_COLOR[row.mode as Mode] ?? '#64748b'}35`,
                        fontFamily: 'var(--font-mono)',
                      }}>{(MODE_LABELS[row.mode as Mode] ?? row.mode).toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11 }}>
                      {row.interval_ms} ms
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 3,
                        background: row.enabled ? 'rgba(74,222,128,0.1)' : 'var(--bg-overlay)',
                        color: row.enabled ? '#4ade80' : 'var(--text-muted)',
                        border: `1px solid ${row.enabled ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                      }}>
                        {row.enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btn()} onClick={() => setEditing(row)}>编辑</button>
                        <button
                          style={btn(false, true)}
                          onClick={() => { if (confirm(`删除点位 "${row.link_name}"？`)) del.mutate(row.id) }}
                        >删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Params reference */}
          <div style={{
            padding: '8px 18px', borderTop: '1px solid var(--border)',
            background: 'var(--bg-base)', flexShrink: 0,
            fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.8,
            display: 'flex', flexWrap: 'wrap', gap: '0 20px',
          }}>
            <span><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>random</code>{' '}{"{"}<em>min, max</em>{"}"}</span>
            <span><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>random_walk</code>{' '}{"{"}<em>min, max, step</em>{"}"}</span>
            <span><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>sine</code>{' '}{"{"}<em>amplitude, period, offset</em>{"}"}</span>
            <span><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>ramp</code>{' '}{"{"}<em>min, max, step</em>{"}"}</span>
            <span><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>constant</code>{' '}{"{"}<em>value</em>{"}"}</span>
          </div>
        </div>
      </div>

      {/* Row editor sub-modal */}
      {editing && (
        <RowEditor
          initial={editing}
          scadaCode={scadaCode}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={create.isPending || update.isPending}
        />
      )}
    </>
  )
}
