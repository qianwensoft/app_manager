import { useMemo, useState } from 'react'
import { Button, Select, Segmented, Drawer, message } from 'antd'
import type { FormAppInfo, FormAppPage } from './api'
import { authed } from './api'
import AiChatPanel from '@/pages/AiChatPanel'
import { fieldDefsToSchema } from '@/pages/schemaConverter'
import type { FieldDef } from '@/runtime/types'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
  reload?: () => void
}

const DEVICE_PRESETS: Record<string, { w: number; h: number }> = {
  手机: { w: 390, h: 760 },
  平板: { w: 768, h: 900 },
  桌面: { w: 1024, h: 720 },
}

export default function PreviewPanel({ app, pages, reload }: Props) {
  const [pageKey, setPageKey] = useState(pages[0]?.page_key || 'form')
  const [device, setDevice] = useState<'手机' | '平板' | '桌面'>('手机')
  const [nonce, setNonce] = useState(0)
  const [aiOpen, setAiOpen] = useState(false)

  const src = useMemo(() => {
    const debugBase = localStorage.getItem('qr_form_app_base_url')?.trim().replace(/\/$/, '') || ''
    const base = `${debugBase}/form-app/runtime/${encodeURIComponent(app.code)}`
    const q = new URLSearchParams()
    if (pageKey) q.set('page', pageKey)
    q.set('embed', '1') // 内嵌模式：隐藏运行时自带的页面导航/URL 栏
    q.set('_', String(nonce))
    const token = localStorage.getItem('token')
    if (token) q.set('_token', token)
    return `${base}?${q.toString()}`
  }, [app.code, pageKey, nonce])

  const size = DEVICE_PRESETS[device]

  // 当前选中页面
  const currentPage = pages.find(p => p.page_key === pageKey)

  // 当前页已有字段（供 AI 参考）
  const currentFields: FieldDef[] = (() => {
    if (!currentPage?.config_json) return []
    try { return JSON.parse(currentPage.config_json).field_definitions || [] } catch { return [] }
  })()

  // 当前页已有事件（供 AI 参考）
  const currentEvents = (() => {
    if (!currentPage?.config_json) return []
    try { const e = JSON.parse(currentPage.config_json).events; return Array.isArray(e) ? e : [] } catch { return [] }
  })()

  // 当前页已有打印模板（供 AI 参考）
  const currentPrinters = (() => {
    if (!currentPage?.config_json) return []
    try { const p = JSON.parse(currentPage.config_json).printers; return Array.isArray(p) ? p : [] } catch { return [] }
  })()

  // AI 生成的字段/事件/打印模板直接保存到当前页面，并刷新预览
  const saveFieldsToPage = async (f: FieldDef[], source?: string, events?: any[], printers?: any[]) => {
    if (!currentPage) { message.warning('请先选择页面'); return }
    let config: any = {}
    try { config = JSON.parse(currentPage.config_json || '{}') } catch { config = {} }
    config.field_definitions = f
    if (events !== undefined) config.events = events
    if (printers !== undefined) config.printers = printers
    const designSchema = fieldDefsToSchema(f)
    await authed(`/api/form-app/pages/${currentPage.id}/ai-save`, 'POST', {
      config_json: JSON.stringify(config),
      design_schema: JSON.stringify(designSchema),
      source: source || '',
    })
    reload?.()           // 重新拉取 pages，让 currentFields 更新
    setNonce(n => n + 1) // 刷新 iframe 立即看到效果
  }

  return (
    <div>
      <h2>实时预览</h2>
      <p style={{ color: '#64748b' }}>直接内嵌真实运行时（与设备端一致），切换页面与设备尺寸即时查看。可用「AI 对话编辑」直接修改当前页字段。</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span>页面：</span>
        <Select value={pageKey} onChange={setPageKey} style={{ width: 220 }}>
          {pages.map(p => <Select.Option key={p.page_key} value={p.page_key}>{p.title} ({p.page_key})</Select.Option>)}
        </Select>
        <Segmented value={device} onChange={v => setDevice(v as any)} options={Object.keys(DEVICE_PRESETS)} />
        <Button onClick={() => setNonce(n => n + 1)}>刷新</Button>
        <Button type="primary" onClick={() => setAiOpen(true)} disabled={!currentPage}>AI 对话编辑</Button>
        <Button type="link" onClick={() => {
          const debugBase = localStorage.getItem('qr_form_app_base_url')?.trim().replace(/\/$/, '') || ''
          const q = new URLSearchParams()
          if (pageKey) q.set('page', pageKey)
          const token = localStorage.getItem('token')
          if (token) q.set('_token', token)
          window.open(`${debugBase}/form-app/runtime/${encodeURIComponent(app.code)}?${q.toString()}`, '_blank')
        }}>新窗口打开</Button>
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

      <Drawer
        title={currentPage ? `AI 对话编辑：${currentPage.title}` : 'AI 对话编辑'}
        visible={aiOpen}
        onClose={() => setAiOpen(false)}
        width={480}
        bodyStyle={{ padding: 16, height: '100%' }}
      >
        {currentPage && (
          <AiChatPanel
            currentFields={currentFields}
            currentEvents={currentEvents}
            currentPrinters={currentPrinters}
            pageId={currentPage.id}
            onApplyFields={() => { /* 预览页无内嵌编辑器，直接走保存到页面 */ }}
            onSaveToPage={saveFieldsToPage}
            onAfterRollback={() => { reload?.(); setNonce(n => n + 1) }}
          />
        )}
      </Drawer>
    </div>
  )
}
