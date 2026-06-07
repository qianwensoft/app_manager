import { useMemo, useState } from 'react'
import { Button, Select, Segmented } from 'antd'
import type { FormAppInfo, FormAppPage } from './api'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
}

const DEVICE_PRESETS: Record<string, { w: number; h: number }> = {
  手机: { w: 390, h: 760 },
  平板: { w: 768, h: 900 },
  桌面: { w: 1024, h: 720 },
}

export default function PreviewPanel({ app, pages }: Props) {
  const [pageKey, setPageKey] = useState(pages[0]?.page_key || 'form')
  const [device, setDevice] = useState<'手机' | '平板' | '桌面'>('手机')
  const [nonce, setNonce] = useState(0)

  const src = useMemo(() => {
    const base = `/form-app/runtime/${encodeURIComponent(app.code)}`
    const q = new URLSearchParams()
    if (pageKey) q.set('page', pageKey)
    q.set('_', String(nonce))
    return `${base}?${q.toString()}`
  }, [app.code, pageKey, nonce])

  const size = DEVICE_PRESETS[device]

  return (
    <div>
      <h2>实时预览</h2>
      <p style={{ color: '#64748b' }}>直接内嵌真实运行时（与设备端一致），切换页面与设备尺寸即时查看。</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span>页面：</span>
        <Select value={pageKey} onChange={setPageKey} style={{ width: 220 }}>
          {pages.map(p => <Select.Option key={p.page_key} value={p.page_key}>{p.title} ({p.page_key})</Select.Option>)}
        </Select>
        <Segmented value={device} onChange={v => setDevice(v as any)} options={Object.keys(DEVICE_PRESETS)} />
        <Button onClick={() => setNonce(n => n + 1)}>刷新</Button>
        <Button type="link" onClick={() => window.open(src, '_blank')}>新窗口打开</Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', background: '#f1f5f9', padding: 24, borderRadius: 8 }}>
        <iframe
          key={src}
          title="form-app-preview"
          src={src}
          style={{
            width: size.w,
            height: size.h,
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        />
      </div>
    </div>
  )
}
