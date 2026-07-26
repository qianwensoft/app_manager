/**
 * 外部库管理：为工作流脚本注册可用的外部 JS 库（ctx.libs.<name>）。
 * 两种来源：填 URL 直接引用，或上传 .js 文件到 /api/scada/resource 后引用其 URL。
 * 清单存入 CanvasProject.workflowLibs，随 save-canvas 持久化。
 */
import { useRef, useState } from 'react'
import type { WorkflowLib } from '@/types/workflow'
import { scadaApi } from '@/api/scada'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  libs: WorkflowLib[]
  onChange: (libs: WorkflowLib[]) => void
  onClose: () => void
}

export default function LibManagerModal({ libs, onChange, onClose }: Props) {
  const [name, setName] = useState('')
  const [globalVar, setGlobalVar] = useState('')
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addUrlLib = () => {
    setErr('')
    if (!name.trim() || !url.trim()) { setErr('名称与 URL 必填'); return }
    if (libs.some((l) => l.name === name.trim())) { setErr('库名已存在'); return }
    onChange([...libs, { name: name.trim(), source: 'url', url: url.trim(), globalVar: globalVar.trim() || undefined }])
    setName(''); setGlobalVar(''); setUrl('')
  }

  const onUpload = async (file: File) => {
    setErr('')
    if (!name.trim()) { setErr('请先填库名再上传'); return }
    if (libs.some((l) => l.name === name.trim())) { setErr('库名已存在'); return }
    setUploading(true)
    try {
      const { url: uploadedUrl } = await scadaApi.uploadResource(file, 'lib')
      onChange([...libs, { name: name.trim(), source: 'upload', url: uploadedUrl, globalVar: globalVar.trim() || undefined }])
      setName(''); setGlobalVar('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setErr(`上传失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploading(false)
    }
  }

  const remove = (n: string) => onChange(libs.filter((l) => l.name !== n))

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>外部库管理</DialogTitle>
          <DialogDescription>注册后脚本中可通过 ctx.libs.&lt;库名&gt; 访问（UMD 全局变量）</DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 新增区 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>库名 (ctx.libs.xxx)</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="dayjs" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>全局变量名 (可选)</label>
                <Input value={globalVar} onChange={(e) => setGlobalVar(e.target.value)} placeholder="dayjs" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>URL 引用</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js" />
                <Button size="sm" variant="outline" onClick={addUrlLib}>添加 URL</Button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>或上传 .js 文件</label>
              <input
                ref={fileRef}
                type="file"
                accept=".js,text/javascript,application/javascript"
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f) }}
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
              />
              {uploading && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>上传中…</span>}
            </div>
            {err && <div style={{ fontSize: 11, color: 'var(--danger, #ef4444)' }}>{err}</div>}
          </div>

          {/* 列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto' }}>
            {libs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>暂无外部库</div>}
            {libs.map((l) => (
              <div key={l.name} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{l.name}</span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 8,
                  background: l.source === 'upload' ? 'rgba(74,158,255,0.15)' : 'var(--bg-elevated)',
                  color: l.source === 'upload' ? 'var(--accent)' : 'var(--text-muted)',
                }}>{l.source === 'upload' ? '上传' : 'URL'}</span>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</span>
                <Button size="sm" variant="ghost" onClick={() => remove(l.name)}>删除</Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4,
}
