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

/* ── shared styles ── */
const s = {
  inp: {
    height: 30, padding: '0 8px', fontSize: 12,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    outline: 'none', width: '100%',
  } as React.CSSProperties,
  sel: {
    height: 30, padding: '0 6px', fontSize: 12,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    outline: 'none', width: '100%',
  } as React.CSSProperties,
  btn: (accent = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)',
    background: accent ? 'var(--accent)' : 'var(--bg-surface)',
    color: accent ? '#fff' : 'var(--text-secondary)',
    border: accent ? 'none' : '1px solid var(--border-strong)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    transition: 'background var(--duration-fast)',
  }),
  danger: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm)',
    background: 'var(--danger-muted)', color: 'var(--danger)',
    border: '1px solid rgba(239,68,68,0.25)',
    fontSize: 11, cursor: 'pointer',
  } as React.CSSProperties,
}

/* ── default params per mode ── */
function defaultParams(mode: Mode): string {
  switch (mode) {
    case 'random':      return JSON.stringify({ min: 0, max: 100 })
    case 'random_walk': return JSON.stringify({ min: 0, max: 100, step: 5 })
    case 'sine':        return JSON.stringify({ amplitude: 50, period: 10000, offset: 50 })
    case 'ramp':        return JSON.stringify({ min: 0, max: 100, step: 1 })
    case 'constant':    return JSON.stringify({ value: 42 })
  }
}

/* ── empty form ── */
function emptyForm(): Partial<ScadaSimPoint> {
  return { scada_code: '', link_name: '', enabled: true, mode: 'random', interval_ms: 1000, params_json: defaultParams('random') }
}

/* ── Form modal ── */
function PointForm({ initial, onSave, onCancel, saving }: {
  initial: Partial<ScadaSimPoint>
  onSave: (v: Partial<ScadaSimPoint>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<Partial<ScadaSimPoint>>(initial)
  const set = (k: keyof ScadaSimPoint, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleModeChange = (mode: Mode) => {
    setForm(f => ({ ...f, mode, params_json: defaultParams(mode) }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', width: 440, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {form.id ? '编辑点位' : '新建点位'}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>组态编码 (scada_code)</span>
          <input style={s.inp} value={form.scada_code ?? ''} onChange={e => set('scada_code', e.target.value)} placeholder="my_scada" />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>点位键 (link_name)</span>
          <input style={s.inp} value={form.link_name ?? ''} onChange={e => set('link_name', e.target.value)} placeholder="device.temperature" />
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>模式</span>
            <select style={s.sel} value={form.mode ?? 'random'} onChange={e => handleModeChange(e.target.value as Mode)}>
              {MODES.map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </select>
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>间隔 (ms)</span>
            <input style={s.inp} type="number" min={100} value={form.interval_ms ?? 1000} onChange={e => set('interval_ms', Number(e.target.value))} />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>参数 JSON</span>
          <textarea
            value={form.params_json ?? '{}'}
            onChange={e => set('params_json', e.target.value)}
            rows={3}
            style={{
              ...s.inp, height: 'auto', padding: '6px 8px',
              fontFamily: 'var(--font-mono)', resize: 'vertical',
            }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.enabled ?? true} onChange={e => set('enabled', e.target.checked)} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>启用</span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button style={s.btn()} onClick={onCancel}>取消</button>
          <button style={s.btn(true)} onClick={() => onSave(form)} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function SimPointsPage() {
  const qc = useQueryClient()
  const [filterCode, setFilterCode] = useState('')
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>模拟点位</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            配置组态实时数据模拟引擎的点位（random / sine / ramp 等）
          </div>
        </div>
        <button style={s.btn(true)} onClick={() => setEditing(emptyForm())}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建点位
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          style={{ ...s.inp, width: 240 }}
          placeholder="按 scada_code 筛选…"
          value={filterCode}
          onChange={e => setFilterCode(e.target.value)}
        />
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {['ID', '组态编码', '点位键', '模式', '间隔(ms)', '启用', '操作'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                  color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.05em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>暂无点位</td></tr>
            ) : rows.map((row, i) => (
              <tr key={row.id} style={{
                borderBottom: '1px solid var(--border)',
                background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)',
              }}>
                <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{row.id}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{row.scada_code}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)' }}>{row.link_name}</td>
                <td style={{ padding: '7px 12px' }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
                    background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                    fontSize: 11, color: 'var(--text-secondary)',
                  }}>
                    {MODE_LABELS[row.mode as Mode] ?? row.mode}
                  </span>
                </td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)' }}>{row.interval_ms}</td>
                <td style={{ padding: '7px 12px' }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 11,
                    background: row.enabled ? 'rgba(74,222,128,0.12)' : 'var(--bg-overlay)',
                    color: row.enabled ? '#4ade80' : 'var(--text-muted)',
                    border: `1px solid ${row.enabled ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                  }}>
                    {row.enabled ? '启用' : '停用'}
                  </span>
                </td>
                <td style={{ padding: '7px 12px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={s.btn()} onClick={() => setEditing(row)}>编辑</button>
                    <button
                      style={s.danger}
                      onClick={() => { if (confirm(`删除点位 "${row.link_name}"？`)) del.mutate(row.id) }}
                    >删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mode reference */}
      <div style={{
        marginTop: 24, padding: 16,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>模式参数参考</div>
        <div><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>random</code>：<code style={{ fontFamily: 'var(--font-mono)' }}>{`{"min":0,"max":100}`}</code></div>
        <div><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>random_walk</code>：<code style={{ fontFamily: 'var(--font-mono)' }}>{`{"min":0,"max":100,"step":5}`}</code></div>
        <div><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>sine</code>：<code style={{ fontFamily: 'var(--font-mono)' }}>{`{"amplitude":50,"period":10000,"offset":50}`}</code></div>
        <div><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>ramp</code>：<code style={{ fontFamily: 'var(--font-mono)' }}>{`{"min":0,"max":100,"step":1}`}</code></div>
        <div><code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>constant</code>：<code style={{ fontFamily: 'var(--font-mono)' }}>{`{"value":42}`}</code></div>
      </div>

      {editing && (
        <PointForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={create.isPending || update.isPending}
        />
      )}
    </div>
  )
}
