import { useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { pushHistory } from '@/hooks/useHistory'
import { scadaApi } from '@/api/scada'

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
          </Section>

          <Section title="样式">
            <Row label="名称"><Inp val={selectedEl.name} onChange={(v) => update('name', v)} /></Row>
            <Row label="填充"><ColorPicker val={selectedEl.fill || '#000000'} onChange={(v) => update('fill', v)} /></Row>
            <Row label="描边"><ColorPicker val={selectedEl.stroke || '#000000'} onChange={(v) => update('stroke', v)} /></Row>
          </Section>

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
