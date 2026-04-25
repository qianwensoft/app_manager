import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scadaApi } from '@/api/scada'

const s = {
  btn: (accent = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)',
    background: accent ? 'var(--accent)' : 'var(--bg-surface)',
    color: accent ? '#fff' : 'var(--text-secondary)',
    border: accent ? 'none' : '1px solid var(--border-strong)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
  }),
  inp: {
    height: 30, padding: '0 8px', fontSize: 12,
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    outline: 'none',
  } as React.CSSProperties,
  danger: {
    display: 'inline-flex', alignItems: 'center',
    height: 26, padding: '0 10px', borderRadius: 'var(--radius-sm)',
    background: 'var(--danger-muted)', color: 'var(--danger)',
    border: '1px solid rgba(239,68,68,0.25)',
    fontSize: 11, cursor: 'pointer',
  } as React.CSSProperties,
}

interface CustomizeComponent {
  id: number
  name: string
  code: string
  type: string
  file_url: string
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const upload = useMutation({
    mutationFn: (fd: FormData) => scadaApi.createCustomizeComponent(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scada', 'customize-components'] })
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '上传失败'
      setErr(msg)
    },
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPreview(URL.createObjectURL(f))
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    if (!code) setCode(f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())
  }

  const handleSave = () => {
    setErr('')
    const file = fileRef.current?.files?.[0]
    if (!file) { setErr('请选择文件'); return }
    if (!name.trim()) { setErr('请填写名称'); return }
    if (!code.trim()) { setErr('请填写编码'); return }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name.trim())
    fd.append('code', code.trim())
    fd.append('type', 'image')
    upload.mutate(fd)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', width: 420, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>上传自定义组件</div>

        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            height: 120, border: '2px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', overflow: 'hidden', background: 'var(--bg-surface)',
          }}
        >
          {preview
            ? <img src={preview} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>点击选择图片 / SVG / GIF</span>
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*,.svg" style={{ display: 'none' }} onChange={handleFile} />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>名称</span>
          <input style={{ ...s.inp, width: '100%' }} value={name} onChange={e => setName(e.target.value)} placeholder="我的组件" />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>编码 (唯一标识)</span>
          <input style={{ ...s.inp, width: '100%', fontFamily: 'var(--font-mono)' }} value={code} onChange={e => setCode(e.target.value)} placeholder="my_component" />
        </label>

        {err && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={s.btn()} onClick={onClose}>取消</button>
          <button style={s.btn(true)} onClick={handleSave} disabled={upload.isPending}>
            {upload.isPending ? '上传中…' : '上传'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomizeComponentsPage() {
  const qc = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['scada', 'customize-components'],
    queryFn: () => scadaApi.listCustomizeComponents().then(r => r.data),
  })

  const del = useMutation({
    mutationFn: (id: number) => scadaApi.deleteCustomizeComponent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scada', 'customize-components'] }),
  })

  const items: CustomizeComponent[] = data ?? []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>自定义组件</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            上传图片 / SVG / GIF 作为可拖拽组件在组态编辑器中使用
          </div>
        </div>
        <button style={s.btn(true)} onClick={() => setShowUpload(true)}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          上传组件
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>加载中…</div>
      ) : items.length === 0 ? (
        <div style={{
          padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
        }}>
          暂无自定义组件，点击「上传组件」添加
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}>
          {items.map(item => (
            <div key={item.id} style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Preview */}
              <div style={{
                height: 100, background: 'var(--bg-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <img
                  src={item.file_url}
                  alt={item.name}
                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
              {/* Info */}
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.code}
                </div>
                <div style={{ marginTop: 6 }}>
                  <button
                    style={s.danger}
                    onClick={() => { if (confirm(`删除组件 "${item.name}"？`)) del.mutate(item.id) }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
