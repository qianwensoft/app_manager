import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scadaApi, type ScadaAccessPolicy } from '@/api/scada'
import { orgApi } from '@/api/org'

const s = {
  btn: (accent = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm)',
    background: accent ? 'var(--accent)' : 'var(--bg-surface)',
    color: accent ? '#fff' : 'var(--text-secondary)',
    border: accent ? 'none' : '1px solid var(--border-strong)',
    fontSize: 11, fontWeight: 500, cursor: 'pointer',
  }),
  inp: {
    height: 28, padding: '0 8px', fontSize: 11,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    outline: 'none',
  } as React.CSSProperties,
  sel: {
    height: 28, padding: '0 6px', fontSize: 11,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    outline: 'none',
  } as React.CSSProperties,
  danger: {
    display: 'inline-flex', alignItems: 'center',
    height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm)',
    background: 'var(--danger-muted)', color: 'var(--danger)',
    border: '1px solid rgba(239,68,68,0.25)',
    fontSize: 10, cursor: 'pointer',
  } as React.CSSProperties,
}

const TARGET_TYPES = ['device', 'user', 'department', 'position'] as const
const TARGET_LABELS: Record<string, string> = {
  device: '设备', user: '用户', department: '部门', position: '职位',
}

function emptyForm(): Partial<ScadaAccessPolicy> {
  return { target_type: 'device', target_id: 0, expire_at: null, expire_url: '', enabled: true }
}

interface AddFormProps {
  scadaId: number
  onDone: () => void
}

function AddForm({ scadaId, onDone }: AddFormProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Partial<ScadaAccessPolicy>>(emptyForm())
  const [err, setErr] = useState('')

  const { data: devices } = useQuery({ queryKey: ['org', 'devices'], queryFn: () => orgApi.listDevices().then(r => r.data) })
  const { data: users } = useQuery({ queryKey: ['org', 'users'], queryFn: () => orgApi.listUsers().then(r => r.data) })
  const { data: depts } = useQuery({ queryKey: ['org', 'departments'], queryFn: () => orgApi.listDepartments().then(r => r.data) })
  const { data: positions } = useQuery({ queryKey: ['org', 'positions'], queryFn: () => orgApi.listPositions().then(r => r.data) })

  const create = useMutation({
    mutationFn: (body: Partial<ScadaAccessPolicy>) => scadaApi.createAccessPolicy(scadaId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scada', 'access-policies', scadaId] })
      setForm(emptyForm())
      setErr('')
      onDone()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '创建失败'
      setErr(msg)
    },
  })

  const set = (k: keyof ScadaAccessPolicy, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const targetOptions = () => {
    switch (form.target_type) {
      case 'device': return (devices ?? []).map(d => ({ id: d.id, label: d.name || d.serial }))
      case 'user': return (users ?? []).map(u => ({ id: u.id, label: u.username }))
      case 'department': return (depts ?? []).map(d => ({ id: d.id, label: d.name }))
      case 'position': return (positions ?? []).map(p => ({ id: p.id, label: p.name }))
      default: return []
    }
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>新增策略</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>目标类型</span>
          <select style={s.sel} value={form.target_type} onChange={e => {
            set('target_type', e.target.value)
            set('target_id', 0)
          }}>
            {TARGET_TYPES.map(t => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>目标</span>
          <select
            style={{ ...s.sel, minWidth: 140 }}
            value={form.target_id ?? 0}
            onChange={e => set('target_id', Number(e.target.value))}
          >
            <option value={0}>— 选择 —</option>
            {targetOptions().map(o => <option key={o.id} value={o.id}>{o.label} (#{o.id})</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>过期时间（留空=永不）</span>
          <input
            style={{ ...s.inp, width: 160 }}
            type="datetime-local"
            value={form.expire_at ? form.expire_at.slice(0, 16) : ''}
            onChange={e => set('expire_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>过期跳转 URL</span>
          <input
            style={{ ...s.inp, width: '100%' }}
            placeholder="/expired"
            value={form.expire_url ?? ''}
            onChange={e => set('expire_url', e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-end', gap: 5, paddingBottom: 2, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.enabled ?? true} onChange={e => set('enabled', e.target.checked)} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>启用</span>
        </label>
      </div>

      {err && <div style={{ fontSize: 10, color: 'var(--danger)' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <button style={s.btn(true)} onClick={() => create.mutate(form)} disabled={create.isPending}>
          {create.isPending ? '添加中…' : '添加'}
        </button>
        <button style={s.btn()} onClick={onDone}>取消</button>
      </div>
    </div>
  )
}

interface Props {
  scadaId: number
  onClose: () => void
}

export default function AccessPoliciesModal({ scadaId, onClose }: Props) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['scada', 'access-policies', scadaId],
    queryFn: () => scadaApi.listAccessPolicies(scadaId).then(r => r.items ?? []),
  })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      scadaApi.updateAccessPolicy(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scada', 'access-policies', scadaId] }),
  })

  const del = useMutation({
    mutationFn: (id: number) => scadaApi.deleteAccessPolicy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scada', 'access-policies', scadaId] }),
  })

  const items: ScadaAccessPolicy[] = data ?? []

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', width: 680, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>访问策略</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              控制哪些设备/用户可访问此组态，以及访问有效期
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!showAdd && (
              <button style={s.btn(true)} onClick={() => setShowAdd(true)}>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新增策略
              </button>
            )}
            <button style={s.btn()} onClick={onClose}>关闭</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {showAdd && <AddForm scadaId={scadaId} onDone={() => setShowAdd(false)} />}

          {isLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>加载中…</div>
          ) : items.length === 0 ? (
            <div style={{
              padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}>
              暂无访问策略 — 所有人均可访问此组态
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  {['ID', '目标类型', '目标 ID', '过期时间', '过期跳转', '状态', '操作'].map(h => (
                    <th key={h} style={{
                      padding: '6px 10px', textAlign: 'left', fontWeight: 600,
                      color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.05em',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={row.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)',
                  }}>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{row.id}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 3,
                        background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                        fontSize: 10, color: 'var(--text-secondary)',
                      }}>
                        {TARGET_LABELS[row.target_type] ?? row.target_type}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{row.target_id || '—'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {row.expire_at ? new Date(row.expire_at).toLocaleString('zh-CN', { hour12: false }) : '永不'}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.expire_url || '—'}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span
                        onClick={() => toggle.mutate({ id: row.id, enabled: !row.enabled })}
                        style={{
                          display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          background: row.enabled ? 'rgba(74,222,128,0.12)' : 'var(--bg-overlay)',
                          color: row.enabled ? '#4ade80' : 'var(--text-muted)',
                          border: `1px solid ${row.enabled ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                          cursor: 'pointer',
                        }}
                        title="点击切换"
                      >
                        {row.enabled ? '启用' : '停用'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <button
                        style={s.danger}
                        onClick={() => { if (confirm(`删除策略 #${row.id}？`)) del.mutate(row.id) }}
                      >删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
