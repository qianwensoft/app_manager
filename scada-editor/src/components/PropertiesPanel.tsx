import { useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { pushHistory } from '@/hooks/useHistory'
import { scadaApi } from '@/api/scada'
import { getChartSchema, type StyleFieldDef } from '@/schema/chartSchema'
import type { CanvasElement, TableColumn, ElementEvent, FormFieldRule, FormFieldReaction } from '@/types'

/* ── Shared input ── */
const Inp = ({ val, onChange, type = 'text', placeholder = '' }: {
  val: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) => (
  <input
    type={type}
    value={val}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%', height: 26,
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      color: 'var(--text-primary)',
      padding: '0 6px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
      outline: 'none',
      transition: 'border-color var(--duration-fast)',
      fontFamily: type === 'number' ? 'var(--font-mono)' : 'inherit',
    }}
    onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
  />
)

/* ── Color picker ── */
const ColorPicker = ({ val, onChange }: { val: string; onChange: (v: string) => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <input
      type="color"
      value={val}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 26, height: 26,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-base)',
        cursor: 'pointer', padding: 2,
      }}
    />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{val}</span>
  </div>
)

/* ── Toggle ── */
const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: checked ? 'var(--accent)' : 'var(--bg-overlay)',
        border: `1px solid ${checked ? 'var(--accent-dim)' : 'var(--border-strong)'}`,
        position: 'relative', cursor: 'pointer',
        transition: 'all var(--duration-base)',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 'calc(100% - 16px)' : '2px',
        width: 12, height: 12, borderRadius: '50%',
        background: '#fff',
        transition: 'left var(--duration-base)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
    {label && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>}
  </label>
)

/* ── Collapsible section ── */
const Section = ({ title, children, defaultOpen = true, accent = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; accent?: boolean
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 10px', background: 'var(--bg-surface)',
          border: 'none', cursor: 'pointer',
          color: accent ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          transition: 'color var(--duration-fast)',
        }}
      >
        {title}
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Property row ── */
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="prop-row">
    <span className="prop-label">{label}</span>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
)

/* ── XY pair ── */
const PairRow = ({ l1, v1, l2, v2, on1, on2 }: {
  l1: string; v1: number; l2: string; v2: number
  on1: (v: string) => void; on2: (v: string) => void
}) => (
  <div style={{ display: 'flex', gap: 5 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: '0.04em' }}>{l1}</div>
      <Inp val={Math.round(v1)} onChange={on1} type="number" />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: '0.04em' }}>{l2}</div>
      <Inp val={Math.round(v2)} onChange={on2} type="number" />
    </div>
  </div>
)

/* ── Image resource section with upload ── */
function ImageResourceSection({ imageUrl, onUpdate }: { imageUrl?: string; onUpdate: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await scadaApi.uploadResource(file, 'image')
      onUpdate(res.url)
    } catch {
      // ignore
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <Section title="图片资源">
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 4, marginBottom: 4, background: '#111' }}
        />
      )}
      <Row label="图片URL">
        <Inp val={imageUrl || ''} onChange={onUpdate} placeholder="/images/bg/bg01.jpg" />
      </Row>
      <div style={{ marginTop: 4 }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          {uploading ? '上传中…' : '上传图片'}
        </button>
      </div>
    </Section>
  )
}

// ── Chart Config Section ──────────────────────────────────────────────────────

function ChartConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const schema = getChartSchema(el.type)
  if (!schema) return null

  const cfg = (el.properties?.chartConfig ?? {}) as Record<string, unknown>

  const setField = (field: StyleFieldDef, value: unknown) => {
    onUpdate('properties', {
      ...el.properties,
      chartConfig: { ...cfg, [field.key]: value },
    })
  }

  // group fields by field.group
  const groups: Record<string, StyleFieldDef[]> = {}
  for (const f of schema.styleFields) {
    const g = f.group ?? '其他'
    if (!groups[g]) groups[g] = []
    groups[g].push(f)
  }

  return (
    <>
      {Object.entries(groups).map(([groupName, fields]) => (
        <Section key={groupName} title={groupName} defaultOpen={groupName === '标题' ? false : true}>
          {fields.map((f) => {
            const val = cfg[f.key] !== undefined ? cfg[f.key] : f.default
            if (f.type === 'color') {
              return (
                <Row key={f.key} label={f.label}>
                  <ColorPicker
                    val={typeof val === 'string' && val !== 'transparent' ? val : '#000000'}
                    onChange={(v) => setField(f, v)}
                  />
                </Row>
              )
            }
            if (f.type === 'boolean') {
              return (
                <Row key={f.key} label={f.label}>
                  <Toggle
                    checked={!!val}
                    onChange={(v) => setField(f, v)}
                    label={val ? '开' : '关'}
                  />
                </Row>
              )
            }
            if (f.type === 'select' && f.options) {
              return (
                <Row key={f.key} label={f.label}>
                  <select
                    value={String(val)}
                    onChange={(e) => setField(f, e.target.value)}
                    style={{
                      width: '100%', height: 26,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                      fontSize: 11, padding: '0 4px', outline: 'none',
                    }}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Row>
              )
            }
            // text / number
            return (
              <Row key={f.key} label={f.label}>
                <Inp
                  val={f.type === 'number' ? Number(val) : String(val ?? '')}
                  type={f.type === 'number' ? 'number' : 'text'}
                  onChange={(v) => setField(f, f.type === 'number' ? Number(v) : v)}
                  placeholder={f.hint ?? ''}
                />
              </Row>
            )
          })}
        </Section>
      ))}
    </>
  )
}

// ── Table Config Section ──────────────────────────────────────────────────────

function TableConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const cols: TableColumn[] = el.tableColumns ?? []
  const rows: Record<string, unknown>[] = el.tableData ?? []

  const setCol = (i: number, patch: Partial<TableColumn>) => {
    const next = cols.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onUpdate('tableColumns', next)
  }

  const addCol = () => {
    onUpdate('tableColumns', [...cols, { key: `col${cols.length + 1}`, title: `列${cols.length + 1}`, align: 'left' }])
  }

  const removeCol = (i: number) => {
    onUpdate('tableColumns', cols.filter((_, idx) => idx !== i))
  }

  const moveCol = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cols.length) return
    const next = [...cols]
    ;[next[i], next[j]] = [next[j], next[i]]
    onUpdate('tableColumns', next)
  }

  const setCell = (rowIdx: number, key: string, val: string) => {
    const next = rows.map((r, i) => i === rowIdx ? { ...r, [key]: val } : r)
    onUpdate('tableData', next)
  }

  const addRow = () => {
    const empty: Record<string, unknown> = {}
    cols.forEach((c) => { empty[c.key] = '' })
    onUpdate('tableData', [...rows, empty])
  }

  const removeRow = (i: number) => {
    onUpdate('tableData', rows.filter((_, idx) => idx !== i))
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>列配置</div>
      {cols.map((col, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 7px', marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>列 {i + 1}</span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={() => moveCol(i, -1)} disabled={i === 0} style={btnStyle}>↑</button>
              <button onClick={() => moveCol(i, 1)} disabled={i === cols.length - 1} style={btnStyle}>↓</button>
              <button onClick={() => removeCol(i)} style={{ ...btnStyle, color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>标题</div>
                <Inp val={col.title} onChange={(v) => setCol(i, { title: v })} placeholder="列标题" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>字段键</div>
                <Inp val={col.key} onChange={(v) => setCol(i, { key: v })} placeholder="field_key" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>宽度(px)</div>
                <Inp val={col.width ?? ''} type="number" onChange={(v) => setCol(i, { width: v ? Number(v) : undefined })} placeholder="自动" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>合并列数</div>
                <Inp val={col.colSpan ?? 1} type="number" onChange={(v) => setCol(i, { colSpan: Number(v) || 1 })} placeholder="1" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>对齐</div>
                <select
                  value={col.align ?? 'left'}
                  onChange={(e) => setCol(i, { align: e.target.value as TableColumn['align'] })}
                  style={selectStyle}
                >
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addCol} style={{
        width: '100%', padding: '5px 0', cursor: 'pointer',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px dashed var(--border-accent)',
        borderRadius: 'var(--radius-sm)', fontSize: 11,
      }}>
        + 添加列
      </button>

      {/* ── Static data rows ── */}
      {cols.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>静态数据</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} style={{
                      padding: '3px 4px', textAlign: 'left', fontWeight: 600,
                      color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap', fontSize: 9,
                    }}>{c.title}</th>
                  ))}
                  <th style={{ width: 18 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {cols.map((c) => (
                      <td key={c.key} style={{ padding: '2px 2px' }}>
                        <input
                          value={String(row[c.key] ?? '')}
                          onChange={(e) => setCell(ri, c.key, e.target.value)}
                          style={{
                            width: '100%', height: 22, fontSize: 10,
                            background: 'var(--bg-base)', border: '1px solid var(--border)',
                            color: 'var(--text-primary)', borderRadius: 3,
                            padding: '0 4px', outline: 'none', fontFamily: 'inherit',
                            boxSizing: 'border-box',
                          }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '2px 2px', textAlign: 'center' }}>
                      <button onClick={() => removeRow(ri)} style={{ ...btnStyle, color: 'var(--danger)', width: 18, height: 18 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addRow} style={{
            width: '100%', marginTop: 4, padding: '4px 0', cursor: 'pointer',
            background: 'var(--bg-base)', color: 'var(--text-muted)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-sm)', fontSize: 10,
          }}>
            + 添加行
          </button>
        </div>
      )}
    </div>
  )
}

// ── Form Field Config Section ─────────────────────────────────────────────────
// ── Form field config — multi-tab (属性 | 校验 | 联动) ────────────────────────

const RULE_TYPE_OPTIONS = [
  { value: '', label: '自定义' },
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: '手机号' },
  { value: 'idcard', label: '身份证' },
  { value: 'pattern', label: '正则' },
]

const miniInput: React.CSSProperties = {
  width: '100%', height: 22,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', padding: '0 4px',
  borderRadius: 'var(--radius-sm)', fontSize: 10, outline: 'none', boxSizing: 'border-box',
}

function RuleEditor({ rules, onChange }: { rules: FormFieldRule[]; onChange: (r: FormFieldRule[]) => void }) {
  const addRule = () => onChange([...rules, {}])
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i))
  const upd = (i: number, p: Partial<FormFieldRule>) => onChange(rules.map((r, idx) => idx === i ? { ...r, ...p } : r))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rules.map((rule, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 8px',
          display: 'flex', flexDirection: 'column', gap: 4, position: 'relative',
        }}>
          <button onClick={() => remove(i)} style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>类型</div>
              <select value={rule.type ?? ''} onChange={(e) => upd(i, { type: (e.target.value || undefined) as FormFieldRule['type'] })} style={{ ...miniInput, cursor: 'pointer' }}>
                {RULE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>错误消息</div>
              <input value={rule.message ?? ''} onChange={(e) => upd(i, { message: e.target.value || undefined })} placeholder="自动" style={miniInput} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>最小</div>
              <input type="number" value={rule.min ?? ''} onChange={(e) => upd(i, { min: e.target.value ? Number(e.target.value) : undefined })} style={miniInput} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>最大</div>
              <input type="number" value={rule.max ?? ''} onChange={(e) => upd(i, { max: e.target.value ? Number(e.target.value) : undefined })} style={miniInput} />
            </div>
          </div>
          {rule.type === 'pattern' && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>正则</div>
              <input value={rule.pattern ?? ''} onChange={(e) => upd(i, { pattern: e.target.value || undefined })} placeholder="^\d+$" style={miniInput} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>自定义 <span style={{ opacity: 0.6 }}>(v,rule)=&gt;true|'msg'</span></div>
            <input value={rule.validator ?? ''} onChange={(e) => upd(i, { validator: e.target.value || undefined })} placeholder="(v)=>v>0||'必须>0'" style={miniInput} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!rule.required} onChange={(e) => upd(i, { required: e.target.checked })} style={{ width: 10, height: 10 }} />
            触发必填
          </label>
        </div>
      ))}
      <button onClick={addRule} style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer', textAlign: 'left' }}>
        + 添加规则
      </button>
    </div>
  )
}

function ReactionEditor({ reactions, onChange }: { reactions: FormFieldReaction[]; onChange: (r: FormFieldReaction[]) => void }) {
  const add = () => onChange([...reactions, { watch: '' }])
  const remove = (i: number) => onChange(reactions.filter((_, idx) => idx !== i))
  const upd = (i: number, p: Partial<FormFieldReaction>) => onChange(reactions.map((r, idx) => idx === i ? { ...r, ...p } : r))
  const updState = (i: number, branch: 'fulfill' | 'otherwise', key: string, val: unknown) => {
    const r = reactions[i]
    const existing = r[branch]?.state ?? {}
    upd(i, { [branch]: { ...r[branch], state: { ...existing, [key]: val === '' ? undefined : val } } })
  }
  const stateVal = (r: FormFieldReaction, branch: 'fulfill' | 'otherwise', key: string): unknown =>
    (r[branch]?.state as Record<string, unknown> | undefined)?.[key] ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {reactions.map((r, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '8px', position: 'relative',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <button onClick={() => remove(i)} style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>监听字段键 (watch)</div>
            <input value={r.watch} onChange={(e) => upd(i, { watch: e.target.value })} placeholder="other_field_key" style={miniInput} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>触发条件 <span style={{ opacity: 0.6 }}>($deps[0])=&gt;bool，空=非空即触发</span></div>
            <input value={r.when ?? ''} onChange={(e) => upd(i, { when: e.target.value || undefined })} placeholder="$deps[0]==='是'" style={miniInput} />
          </div>
          {(['fulfill', 'otherwise'] as const).map((branch) => (
            <div key={branch} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 6px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>{branch === 'fulfill' ? '✓ 触发时' : '✗ 否则'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>显示</div>
                  <select
                    value={stateVal(r, branch, 'visible') as string}
                    onChange={(e) => updState(i, branch, 'visible', e.target.value === '' ? undefined : e.target.value === 'true')}
                    style={{ ...miniInput, cursor: 'pointer' }}
                  >
                    <option value="">不变</option>
                    <option value="true">显示</option>
                    <option value="false">隐藏</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>必填</div>
                  <select
                    value={stateVal(r, branch, 'required') as string}
                    onChange={(e) => updState(i, branch, 'required', e.target.value === '' ? undefined : e.target.value === 'true')}
                    style={{ ...miniInput, cursor: 'pointer' }}
                  >
                    <option value="">不变</option>
                    <option value="true">必填</option>
                    <option value="false">非必填</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>赋值 <span style={{ opacity: 0.6 }}>JS表达式，$deps[0]=监听值</span></div>
                <input
                  value={stateVal(r, branch, 'value') as string}
                  onChange={(e) => updState(i, branch, 'value', e.target.value || undefined)}
                  placeholder="$deps[0]+'_suffix'"
                  style={miniInput}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
      <button onClick={add} style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer', textAlign: 'left' }}>
        + 添加联动
      </button>
    </div>
  )
}

const HAS_OPTIONS = new Set(['form-select', 'form-radio', 'form-checkbox'])

function FormFieldConfigSection({ el, onUpdate }: { el: CanvasElement; onUpdate: (k: keyof CanvasElement, v: unknown) => void }) {
  const [tab, setTab] = useState<'props' | 'validate' | 'reactions'>('props')
  const isSubmit = el.type === 'form-submit'

  const tabSt = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '4px 0', fontSize: 11, border: 'none', cursor: 'pointer',
    background: active ? 'var(--bg-panel)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
        <button style={tabSt(tab === 'props')} onClick={() => setTab('props')}>属性</button>
        {!isSubmit && <button style={tabSt(tab === 'validate')} onClick={() => setTab('validate')}>校验</button>}
        {!isSubmit && <button style={tabSt(tab === 'reactions')} onClick={() => setTab('reactions')}>联动</button>}
      </div>

      {/* 属性 tab */}
      {tab === 'props' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Row label="表单组 ID">
            <Inp val={el.formGroupId ?? ''} onChange={(v) => onUpdate('formGroupId', v || undefined)} placeholder="form1" />
          </Row>
          {!isSubmit && (
            <>
              <Row label="字段键">
                <Inp val={el.formFieldKey ?? ''} onChange={(v) => onUpdate('formFieldKey', v || undefined)} placeholder="field_key" />
              </Row>
              <Row label="标签">
                <Inp val={el.formFieldLabel ?? ''} onChange={(v) => onUpdate('formFieldLabel', v || undefined)} placeholder="字段标签" />
              </Row>
              <Row label="占位符">
                <Inp val={el.formFieldPlaceholder ?? ''} onChange={(v) => onUpdate('formFieldPlaceholder', v || undefined)} placeholder="请输入…" />
              </Row>
              <Row label="默认值">
                <Inp val={el.formFieldDefaultValue ?? ''} onChange={(v) => onUpdate('formFieldDefaultValue', v || undefined)} />
              </Row>
              {HAS_OPTIONS.has(el.type) && (
                <Row label="选项">
                  <Inp val={el.formFieldOptions ?? ''} onChange={(v) => onUpdate('formFieldOptions', v || undefined)} placeholder="A,B,C" />
                </Row>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!el.formFieldRequired} onChange={(e) => onUpdate('formFieldRequired', e.target.checked)} style={{ width: 12, height: 12 }} />
                必填
              </label>
            </>
          )}
          {isSubmit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>提交目标</div>
              <Row label="应用 ID">
                <Inp val={el.formSubmitAppId ?? ''} type="number" onChange={(v) => onUpdate('formSubmitAppId', v ? Number(v) : undefined)} placeholder="App.id" />
              </Row>
              <Row label="Webhook ID">
                <Inp val={el.formSubmitWebhookId ?? ''} type="number" onChange={(v) => onUpdate('formSubmitWebhookId', v ? Number(v) : undefined)} placeholder="Webhook.id" />
              </Row>
              <Row label="附加参数">
                <Inp val={el.formSubmitParamJson ?? ''} onChange={(v) => onUpdate('formSubmitParamJson', v || undefined)} placeholder='{"key":"val"}' />
              </Row>
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                  提交前脚本 <span style={{ opacity: 0.6 }}>async(data)=&gt;...</span>
                </div>
                <textarea
                  value={el.formBeforeScript ?? ''}
                  onChange={(e) => onUpdate('formBeforeScript', e.target.value || undefined)}
                  placeholder={'// return data;    继续提交\n// return false;   取消\n// throw \'reason\'; 中止并提示'}
                  rows={5}
                  style={{
                    width: '100%', resize: 'vertical',
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', padding: '4px 6px',
                    borderRadius: 'var(--radius-sm)', fontSize: 11, outline: 'none',
                    fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 校验 tab */}
      {tab === 'validate' && !isSubmit && (
        <RuleEditor
          rules={el.formFieldRules ?? []}
          onChange={(r) => onUpdate('formFieldRules', r.length ? r : undefined)}
        />
      )}

      {/* 联动 tab */}
      {tab === 'reactions' && !isSubmit && (
        <ReactionEditor
          reactions={el.formFieldReactions ?? []}
          onChange={(r) => onUpdate('formFieldReactions', r.length ? r : undefined)}
        />
      )}
    </div>
  )
}

// ── Layout Config Section ─────────────────────────────────────────────────────

function LayoutConfigSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const project = useEditorStore((s) => s.project)
  const canvasList = Object.values(project.canvases)

  if (el.type === 'layout-carousel') {
    const slides = el.layoutSlides ?? 3
    const slideCanvases = el.layoutSlideCanvases ?? []

    const setSlideCanvas = (i: number, canvasId: number) => {
      const next = [...slideCanvases]
      next[i] = canvasId
      onUpdate('layoutSlideCanvases', next)
    }

    return (
      <Section title="轮播配置">
        <Row label="幻灯片数">
          <Inp val={slides} type="number" onChange={(v) => onUpdate('layoutSlides', Math.max(1, Number(v)))} />
        </Row>
        <Row label="切换间隔(ms)">
          <Inp val={el.layoutInterval ?? 3000} type="number" onChange={(v) => onUpdate('layoutInterval', Number(v))} placeholder="0=手动" />
        </Row>
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>幻灯片绑定画布</div>
          {Array.from({ length: slides }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 40, flexShrink: 0 }}>第 {i + 1} 页</span>
              <select
                value={slideCanvases[i] ?? ''}
                onChange={(e) => setSlideCanvas(i, Number(e.target.value))}
                style={selectStyle}
              >
                <option value="">— 不绑定 —</option>
                {canvasList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Section>
    )
  }

  if (el.type === 'layout-modal') {
    return (
      <Section title="弹窗配置">
        <Row label="标题">
          <Inp val={el.layoutModalTitle ?? ''} onChange={(v) => onUpdate('layoutModalTitle', v)} placeholder="弹窗标题" />
        </Row>
        <Row label="显示关闭">
          <Toggle checked={el.layoutShowClose !== false} onChange={(v) => onUpdate('layoutShowClose', v)} label={el.layoutShowClose !== false ? '显示' : '隐藏'} />
        </Row>
        <Row label="默认显示">
          <Toggle checked={!!el.layoutModalDefaultVisible} onChange={(v) => onUpdate('layoutModalDefaultVisible', v)} label={el.layoutModalDefaultVisible ? '显示' : '隐藏'} />
        </Row>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>绑定画布（弹窗内容）</div>
          <select
            value={el.layoutModalCanvasId ?? ''}
            onChange={(e) => onUpdate('layoutModalCanvasId', e.target.value ? Number(e.target.value) : undefined)}
            style={selectStyle}
          >
            <option value="">— 不绑定 —</option>
            {canvasList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 2 }}>
          预览/发布时的初始状态。编辑模式下可通过图层面板眼睛图标切换显示。
        </div>
      </Section>
    )
  }
  return null
}

// ── Event Editor Section ──────────────────────────────────────────────────────

const EVENT_ACTIONS: { value: ElementEvent['action']; label: string }[] = [
  { value: 'open-modal',      label: '打开弹窗' },
  { value: 'close-modal',     label: '关闭弹窗' },
  { value: 'navigate-canvas', label: '跳转画布' },
  { value: 'navigate',        label: '打开链接' },
  { value: 'popup',           label: '弹出窗口' },
  { value: 'script',          label: '执行脚本' },
]

function EventEditorSection({ el, onUpdate }: {
  el: CanvasElement
  onUpdate: (key: string, value: unknown) => void
}) {
  const project = useEditorStore((s) => s.project)
  const canvasList = Object.values(project.canvases)
  const modalElements = Object.values(project.canvases)
    .flatMap((c) => c.elements)
    .filter((e) => e.type === 'layout-modal')

  const events: ElementEvent[] = el.events ?? []

  const setEvent = (i: number, patch: Partial<ElementEvent>) => {
    const next = events.map((ev, idx) => idx === i ? { ...ev, ...patch } : ev)
    onUpdate('events', next)
  }

  const addEvent = () => {
    onUpdate('events', [...events, { trigger: 'click', action: 'open-modal', target: '' }])
  }

  const removeEvent = (i: number) => {
    onUpdate('events', events.filter((_, idx) => idx !== i))
  }

  const targetInput = (ev: ElementEvent, i: number) => {
    if (ev.action === 'open-modal' || ev.action === 'close-modal') {
      return (
        <select value={ev.target ?? ''} onChange={(e) => setEvent(i, { target: e.target.value })} style={selectStyle}>
          <option value="">— 选择弹窗 —</option>
          {modalElements.map((m) => (
            <option key={m.id} value={m.id}>{m.layoutModalTitle || m.name || m.id}</option>
          ))}
        </select>
      )
    }
    if (ev.action === 'navigate-canvas') {
      return (
        <select value={ev.target ?? ''} onChange={(e) => setEvent(i, { target: e.target.value })} style={selectStyle}>
          <option value="">— 选择画布 —</option>
          {canvasList.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      )
    }
    if (ev.action === 'script') {
      return (
        <Inp val={ev.script ?? ''} onChange={(v) => setEvent(i, { script: v })} placeholder="alert('hello')" />
      )
    }
    return (
      <Inp val={ev.target ?? ''} onChange={(v) => setEvent(i, { target: v })} placeholder="https://..." />
    )
  }

  return (
    <Section title="交互事件" defaultOpen={events.length > 0}>
      {events.map((ev, i) => (
        <div key={i} style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 7px', marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>事件 {i + 1}</span>
            <button onClick={() => removeEvent(i)} style={{ ...btnStyle, color: 'var(--danger)' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>触发</div>
              <select value={ev.trigger} onChange={(e) => setEvent(i, { trigger: e.target.value as ElementEvent['trigger'] })} style={selectStyle}>
                <option value="click">点击</option>
                <option value="dblclick">双击</option>
                <option value="hover">悬停</option>
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <div style={labelStyle}>动作</div>
              <select value={ev.action} onChange={(e) => setEvent(i, { action: e.target.value as ElementEvent['action'], target: '' })} style={selectStyle}>
                {EVENT_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div style={labelStyle}>目标</div>
            {targetInput(ev, i)}
          </div>
        </div>
      ))}
      <button onClick={addEvent} style={{
        width: '100%', padding: '5px 0', cursor: 'pointer',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px dashed var(--border-accent)',
        borderRadius: 'var(--radius-sm)', fontSize: 11,
      }}>
        + 添加事件
      </button>
    </Section>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  width: 20, height: 20, padding: 0, cursor: 'pointer',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 3, fontSize: 10, color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: '0.04em',
}
const selectStyle: React.CSSProperties = {
  width: '100%', height: 26,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
  fontSize: 11, padding: '0 4px', outline: 'none',
}

export default function PropertiesPanel() {
  const store = useEditorStore()
  const canvas = store.activeCanvas()
  const selectedIds = store.selectedIds

  // multi-select: show batch panel when 2+ selected
  const isMulti = selectedIds.length >= 2
  const selectedEl = !isMulti ? canvas?.elements.find((e) => selectedIds.includes(e.id)) : undefined

  const update = (key: string, value: unknown) => {
    if (selectedEl) store.updateElement(selectedEl.id, { [key]: value })
  }

  const updateBatch = (key: string, value: unknown) => {
    selectedIds.forEach((id) => store.updateElement(id, { [key]: value }))
  }

  const updateCanvas = (key: string, value: unknown) => {
    if (canvas) store.updateCanvas(canvas.id, { [key]: value })
  }

  return (
    <div
      className="scada-scroll"
      style={{
        width: 'var(--panel-r-w)',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* ── Multi-select batch panel ── */}
      {isMulti ? (
        <>
          <div style={{
            padding: '7px 10px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              批量属性
            </span>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-base)',
              padding: '2px 5px', borderRadius: 3, border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
            }}>
              {selectedIds.length} 个元素
            </span>
          </div>
          <Section title="填充 / 描边">
            <Row label="填充"><ColorPicker val="#000000" onChange={(v) => updateBatch('fill', v)} /></Row>
            <Row label="描边"><ColorPicker val="#000000" onChange={(v) => updateBatch('stroke', v)} /></Row>
            <Row label="透明度">
              <Inp val={1} type="number" onChange={(v) => updateBatch('opacity', Number(v))} />
            </Row>
          </Section>
          <Section title="组合操作" accent>
            <button
              onClick={() => { pushHistory(store.project); store.groupSelected() }}
              style={{
                width: '100%', padding: '6px 0', cursor: 'pointer',
                background: 'var(--accent-muted)', color: 'var(--accent)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-sm)', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              组合 (Ctrl+G)
            </button>
          </Section>
          <div style={{ padding: '10px', marginTop: 'auto' }}>
            <button
              onClick={() => { pushHistory(store.project); store.deleteElements(selectedIds); store.clearSelection() }}
              style={{
                width: '100%', padding: '6px 0',
                background: 'var(--danger-muted)', color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
              删除全部
            </button>
          </div>
        </>

      ) : selectedEl ? (
        <>
          {/* Header */}
          <div style={{
            padding: '7px 10px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              元件属性
            </span>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-base)',
              padding: '2px 5px', borderRadius: 3, border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
            }}>
              {selectedEl.type}
            </span>
          </div>

          {/* Group: ungroup button */}
          {selectedEl.type === 'group' && (
            <Section title="组合" accent>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                包含 {selectedEl.children?.length ?? 0} 个子元素
              </div>
              <button
                onClick={() => { pushHistory(store.project); store.ungroup(selectedEl.id) }}
                style={{
                  width: '100%', padding: '5px 0', cursor: 'pointer',
                  background: 'var(--warning-muted)', color: 'var(--warning)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 'var(--radius-sm)', fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                解组 (Ctrl+Shift+G)
              </button>
            </Section>
          )}

          <Section title="位置 / 尺寸">
            <PairRow l1="X" v1={selectedEl.x} l2="Y" v2={selectedEl.y}
              on1={(v) => update('x', Number(v))}
              on2={(v) => update('y', Number(v))} />
            <PairRow l1="宽度" v1={selectedEl.width} l2="高度" v2={selectedEl.height}
              on1={(v) => update('width', Number(v))}
              on2={(v) => update('height', Number(v))} />
            <PairRow l1="旋转°" v1={selectedEl.rotation} l2="透明度" v2={selectedEl.opacity ?? 1}
              on1={(v) => update('rotation', Number(v))}
              on2={(v) => update('opacity', Number(v))} />
            <Row label="禁止选中">
              <Toggle
                checked={selectedEl.selectable === false}
                onChange={(v) => update('selectable', v ? false : true)}
                label={selectedEl.selectable === false ? '已禁止' : '可选中'}
              />
            </Row>
          </Section>

          <Section title="样式">
            <Row label="名称"><Inp val={selectedEl.name} onChange={(v) => update('name', v)} /></Row>
            <Row label="填充">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ColorPicker val={selectedEl.fill && selectedEl.fill !== 'transparent' ? selectedEl.fill : '#1a2a3a'} onChange={(v) => update('fill', v)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!selectedEl.fill || selectedEl.fill === 'transparent' || selectedEl.fill === ''}
                    onChange={(e) => update('fill', e.target.checked ? '' : '#1a2a3a')}
                    style={{ width: 12, height: 12 }}
                  />
                  透明
                </label>
              </div>
            </Row>
            <Row label="描边"><ColorPicker val={selectedEl.stroke || '#000000'} onChange={(v) => update('stroke', v)} /></Row>
          </Section>

          {/* 图表配置 — 仅 echarts-* 元素显示 */}
          {selectedEl.type.startsWith('echarts-') && (
            <ChartConfigSection el={selectedEl} onUpdate={update} />
          )}

          {/* Layout 容器配置 */}
          {(selectedEl.type === 'layout-carousel' || selectedEl.type === 'layout-modal') && (
            <LayoutConfigSection el={selectedEl} onUpdate={update} />
          )}

          {(selectedEl.type === 'text' || selectedEl.type === 'button') && (
            <Section title="文本">
              <Row label="内容"><Inp val={selectedEl.text || ''} onChange={(v) => update('text', v)} placeholder="输入文字" /></Row>
              <PairRow
                l1="字号" v1={selectedEl.fontSize ?? 14} l2="行高" v2={selectedEl.lineHeight ?? 1.5}
                on1={(v) => update('fontSize', Number(v))} on2={(v) => update('lineHeight', Number(v))} />
              <Row label="字色"><ColorPicker val={selectedEl.fontColor || '#ffffff'} onChange={(v) => update('fontColor', v)} /></Row>
              <Row label="粗体">
                <Toggle
                  checked={selectedEl.fontWeight === 'bold'}
                  onChange={(v) => update('fontWeight', v ? 'bold' : 'normal')}
                  label={selectedEl.fontWeight === 'bold' ? '粗体' : '常规'} />
              </Row>
            </Section>
          )}

          {(selectedEl.type === 'image-bg' || selectedEl.type === 'image-widget' ||
            selectedEl.type === 'image-decoration' || selectedEl.type === 'image-border-box') && (
            <ImageResourceSection imageUrl={selectedEl.imageUrl} onUpdate={(v) => update('imageUrl', v)} />
          )}

          {/* 交互事件 — 按钮/文本/矩形等可交互元素 */}
          {(selectedEl.type === 'button' || selectedEl.type === 'text' ||
            selectedEl.type === 'rect' || selectedEl.type === 'image-widget') && (
            <EventEditorSection el={selectedEl} onUpdate={update} />
          )}

          {/* 表单控件配置 */}
          {selectedEl.type.startsWith('form-') && (
            <Section title="表单配置" defaultOpen>
              <FormFieldConfigSection el={selectedEl} onUpdate={update} />
            </Section>
          )}

          {/* 数据绑定 */}
          {selectedEl.type === 'table' ? (            <Section title="数据绑定" defaultOpen>
              {/* Table style */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!selectedEl.tableStriped}
                    onChange={(e) => update('tableStriped', e.target.checked)} style={{ width: 12, height: 12 }} />
                  斑马纹
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedEl.tableBordered !== false}
                    onChange={(e) => update('tableBordered', e.target.checked)} style={{ width: 12, height: 12 }} />
                  边框
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>每页</span>
                  <Inp val={selectedEl.tablePageSize ?? 0} type="number"
                    onChange={(v) => update('tablePageSize', Number(v))} placeholder="0=不分页" />
                </div>
              </div>

              {/* Column editor */}
              <TableConfigSection el={selectedEl} onUpdate={update} />

              {/* Data source */}
              <Row label="数据来源">
                <select
                  value={selectedEl.tableDataBinding?.mode ?? 'static'}
                  onChange={(e) => update('tableDataBinding', { ...selectedEl.tableDataBinding, mode: e.target.value })}
                  style={selectStyle}
                >
                  <option value="static">静态数据</option>
                  <option value="interface">数据接口</option>
                </select>
              </Row>
              {(selectedEl.tableDataBinding?.mode ?? 'static') === 'interface' && (
                <>
                  <Row label="接口ID">
                    <Inp
                      val={selectedEl.tableDataBinding?.interfaceId ?? ''}
                      type="number"
                      onChange={(v) => update('tableDataBinding', { ...selectedEl.tableDataBinding, interfaceId: Number(v) })}
                      placeholder="DataInterface.id"
                    />
                  </Row>
                  <Row label="参数JSON">
                    <Inp
                      val={selectedEl.tableDataBinding?.paramJson ?? ''}
                      onChange={(v) => update('tableDataBinding', { ...selectedEl.tableDataBinding, paramJson: v })}
                      placeholder='{"key":"val"}'
                    />
                  </Row>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 2 }}>
                    接口返回数组时自动填充行；返回对象时取 <code style={{ fontFamily: 'var(--font-mono)' }}>data</code> 字段
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>列字段映射（接口字段 → 列key）</div>
                    {(selectedEl.tableColumns ?? []).map((col, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.title}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→</span>
                        <Inp
                          val={col.key}
                          onChange={(v) => {
                            const next = (selectedEl.tableColumns ?? []).map((c, ci) => ci === i ? { ...c, key: v } : c)
                            update('tableColumns', next)
                          }}
                          placeholder="接口字段名"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(selectedEl.tableDataBinding?.mode ?? 'static') === 'static' && (
                <>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>
                    JSON 数组，每行一个对象，键对应列字段键
                  </div>
                  <textarea
                    value={JSON.stringify(selectedEl.tableData ?? [], null, 2)}
                    onChange={(e) => {
                      try { update('tableData', JSON.parse(e.target.value)) } catch { /* ignore */ }
                    }}
                    rows={6}
                    style={{
                      width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                      fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 7px',
                      resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </>
              )}
            </Section>
          ) : (
            <Section title="数据绑定" defaultOpen={false}>
              <Row label="点位键">
                <Inp
                  val={selectedEl.pointBinding?.pointKey || ''}
                  placeholder="device.tag"
                  onChange={(v) => update('pointBinding', { ...selectedEl.pointBinding, pointKey: v })}
                />
              </Row>
              <Row label="转换式">
                <Inp
                  val={selectedEl.pointBinding?.transform || ''}
                  placeholder="v * 0.01"
                  onChange={(v) => update('pointBinding', { ...selectedEl.pointBinding, transform: v })}
                />
              </Row>
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '5px 7px', marginTop: 2,
              }}>
                转换式示例：<code style={{ fontFamily: 'var(--font-mono)', color: 'var(--info)' }}>v * 0.01</code>
              </div>
            </Section>
          )}

          {/* Delete */}
          <div style={{ padding: '10px 10px', marginTop: 'auto' }}>
            <button
              onClick={() => { pushHistory(store.project); store.deleteElements([selectedEl.id]); store.clearSelection() }}
              style={{
                width: '100%', padding: '6px 0',
                background: 'var(--danger-muted)', color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'background var(--duration-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--danger-muted)' }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              删除元件
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Canvas properties */}
          <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              画布属性
            </span>
          </div>

          {canvas ? (
            <Section title="画布设置" accent>
              <PairRow l1="宽度" v1={canvas.width} l2="高度" v2={canvas.height}
                on1={(v) => updateCanvas('width', Number(v))}
                on2={(v) => updateCanvas('height', Number(v))} />
              <Row label="自适应">
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select
                    value={canvas.adaptiveMode ?? 'none'}
                    onChange={(e) => updateCanvas('adaptiveMode', e.target.value)}
                    style={{
                      flex: 1, height: 22, fontSize: 11,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                      padding: '0 4px', outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="none">固定尺寸</option>
                    <option value="fit">适应内容</option>
                  </select>
                  <button
                    title="立即按内容边界调整画布尺寸"
                    onClick={() => store.fitCanvasToContent(canvas.id)}
                    style={{
                      height: 22, padding: '0 6px', fontSize: 10,
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      color: 'var(--accent)', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >适配</button>
                </div>
              </Row>
              <Row label="背景色"><ColorPicker val={canvas.backgroundColor} onChange={(v) => { updateCanvas('backgroundColor', v); updateCanvas('background', v) }} /></Row>
              <Row label="网格"><Toggle checked={canvas.showGrid} onChange={(v) => updateCanvas('showGrid', v)} label={canvas.showGrid ? '显示' : '隐藏'} /></Row>
              <Row label="吸附"><Toggle checked={canvas.snapToGrid} onChange={(v) => updateCanvas('snapToGrid', v)} label={canvas.snapToGrid ? '开启' : '关闭'} /></Row>
              <Row label="格距"><Inp val={canvas.gridSize} onChange={(v) => updateCanvas('gridSize', Number(v))} type="number" /></Row>
            </Section>
          ) : (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7 }}>
              点击画布上的元件<br />在此编辑属性
            </div>
          )}
        </>
      )}
    </div>
  )
}
