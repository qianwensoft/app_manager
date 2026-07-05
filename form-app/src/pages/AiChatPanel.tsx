import { useEffect, useRef, useState } from 'react'
import {
  Button, Input, Select, Upload, Space, message, Empty, Spin, Modal,
} from 'antd'
import type { FieldDef } from '@/runtime/types'
import type { PageEvent } from '@/runtime/eventTypes'
import type { PrinterTemplate } from '@/runtime/printerTypes'
import { authed } from '@/console/api'
import { streamAiChat, extractJSONArray, extractJSONObject, type AiChatMessage } from '@/runtime/aiChatStream'

type SkillOption = { id: number; name: string }

type ChatBubble = {
  role: 'user' | 'assistant'
  content: string
  image?: string // 预览用 dataURL
  fields?: FieldDef[] // 解析出的字段（仅 assistant）
  events?: PageEvent[] // 解析出的事件（仅 assistant）
  printers?: PrinterTemplate[] // 解析出的打印模板（仅 assistant）
  designSchema?: any // 解析出的布局配置（仅 assistant）
  source?: string // 生成该字段的用户指令（仅 assistant，用于快照来源说明）
}

type PageSnapshot = {
  id: number
  kind: string
  source: string
  created_at: string
}

type Props = {
  currentFields: FieldDef[]
  // 可选：当前页面已有事件，作为 AI 上下文 + 供「保存」时与字段一并落库。
  currentEvents?: PageEvent[]
  // 可选：当前页面已有打印模板，作为 AI 上下文 + 供「保存」时一并落库。
  currentPrinters?: PrinterTemplate[]
  // 可选：当前页面设计器布局配置（design_schema），作为 AI 上下文。
  currentDesignSchema?: any
  // 应用到本地（编辑器 state）。预览后由用户决定是否再保存。
  onApplyFields: (fields: FieldDef[]) => void
  // 可选：应用 AI 生成的事件到本地（编辑器 state）。
  onApplyEvents?: (events: PageEvent[]) => void
  // 可选：应用 AI 生成的打印模板到本地（编辑器 state）。
  onApplyPrinters?: (printers: PrinterTemplate[]) => void
  // 可选：应用 AI 生成的布局配置到本地（编辑器 state）。
  onApplyDesignSchema?: (schema: any) => void
  // 可选：直接保存到页面（写库 + 刷新）。提供时显示「保存到页面」按钮。
  // events/printers 为 AI 本次生成的内容（未生成则为 undefined，调用方应保留原值）。
  onSaveToPage?: (fields: FieldDef[], source?: string, events?: PageEvent[], printers?: PrinterTemplate[], designSchema?: any) => Promise<void>
  // 可选：页面 id，提供时显示「历史版本」并支持回滚。
  pageId?: number
  // 可选：回滚成功后的回调（刷新页面/预览）。
  onAfterRollback?: () => void
}

// 校验 AI 返回的字段数组结构是否合法
function validateFields(arr: any): arr is FieldDef[] {
  if (!Array.isArray(arr) || arr.length === 0) return false
  return arr.every(f => f && typeof f.field === 'string' && typeof f.label === 'string' && typeof f.component === 'string')
}

// 校验 AI 返回的事件数组结构是否合法
function validateEvents(arr: any): arr is PageEvent[] {
  if (!Array.isArray(arr)) return false
  return arr.every(e => e && typeof e === 'object' && e.source && typeof e.source.kind === 'string' && Array.isArray(e.actions))
}

// 校验 AI 返回的打印模板数组结构是否合法
function validatePrinters(arr: any): arr is PrinterTemplate[] {
  if (!Array.isArray(arr)) return false
  return arr.every(p => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.protocol === 'string')
}

export default function AiChatPanel({ currentFields, currentEvents, currentPrinters, currentDesignSchema, onApplyFields, onApplyEvents, onApplyPrinters, onApplyDesignSchema, onSaveToPage, pageId, onAfterRollback }: Props) {
  const [bubbles, setBubbles] = useState<ChatBubble[]>([])
  const [input, setInput] = useState('')
  const [imageBase64, setImageBase64] = useState('')   // 含 data: 前缀，用于预览与发送
  const [mediaType, setMediaType] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')      // 当前正在生成的助手文本
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([])
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([])
  const [savingIdx, setSavingIdx] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<PageSnapshot[]>([])
  const [rollbackingId, setRollbackingId] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const loadSnapshots = () => {
    if (!pageId) return
    authed(`/api/form-app/pages/${pageId}/snapshots`, 'GET')
      .then(res => setSnapshots(res.data || []))
      .catch(() => { /* 静默 */ })
  }

  useEffect(() => {
    authed('/api/form-app/skills?enabled=true', 'GET')
      .then(res => setSkillOptions((res.data || []).map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => { /* 静默 */ })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, streamText])

  const beforeUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageBase64(String(reader.result || ''))
      setMediaType(file.type || 'image/png')
    }
    reader.readAsDataURL(file)
    return false // 阻止真实上传
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault() // 阻止默认粘贴行为
          beforeUpload(file)
          message.success('图片已粘贴，可继续输入文字后发送')
          break
        }
      }
    }
  }

  const send = async () => {
    if (streaming) return
    const text = input.trim()
    if (!text && !imageBase64) {
      message.warning('请输入需求或上传图片')
      return
    }

    const userBubble: ChatBubble = { role: 'user', content: text, image: imageBase64 || undefined }
    const history = [...bubbles, userBubble]
    setBubbles(history)
    setInput('')
    const sentImage = imageBase64
    const sentMedia = mediaType
    setImageBase64('')
    setMediaType('')
    setStreaming(true)
    setStreamText('')

    // 诊断日志：显示发送给 AI 的上下文
    console.log('[AI Chat] Sending context:')
    console.log('  - current_fields:', currentFields.length, 'fields')
    console.log('  - current_events:', currentEvents?.length || 0, 'events')
    console.log('  - current_printers:', currentPrinters?.length || 0, 'printers')
    console.log('  - current_design_schema:', currentDesignSchema ? 'Yes' : 'No')
    console.log('  - messages:', history.length, 'messages')

    // 组装发给后端的消息历史（仅文本 + 本次图片）
    const messages: AiChatMessage[] = history.map((b, i) => {
      const m: AiChatMessage = { role: b.role, content: b.content }
      if (i === history.length - 1 && sentImage) {
        m.image_base64 = sentImage
        m.media_type = sentMedia
      }
      return m
    })

    const controller = new AbortController()
    abortRef.current = controller
    let acc = ''

    await streamAiChat(
      {
        messages,
        skill_ids: selectedSkillIds.length ? selectedSkillIds : undefined,
        current_fields: currentFields.length ? currentFields : undefined,
        current_events: currentEvents && currentEvents.length ? currentEvents : undefined,
        current_printers: currentPrinters && currentPrinters.length ? currentPrinters : undefined,
        current_design_schema: currentDesignSchema || undefined,
      },
      {
        onDelta: (t) => { acc += t; setStreamText(acc) },
        onDone: (payload) => {
          let fields: FieldDef[] | undefined
          let events: PageEvent[] | undefined
          let printers: PrinterTemplate[] | undefined
          let designSchema: any | undefined
          // 优先用后端解析结果；缺失时前端从累积文本兜底解析对象 { fields, events, printers, design_schema }
          const fieldsRaw = payload.fields_parsed ? payload.fields : ''
          const eventsRaw = payload.events_parsed ? payload.events : ''
          const printersRaw = payload.printers_parsed ? payload.printers : ''
          const designSchemaRaw = payload.design_schema_parsed ? payload.design_schema : ''
          try {
            if (fieldsRaw) {
              const parsed = JSON.parse(fieldsRaw)
              if (validateFields(parsed)) fields = parsed
            }
          } catch { /* ignore */ }
          try {
            if (eventsRaw) {
              const parsed = JSON.parse(eventsRaw)
              if (validateEvents(parsed)) events = parsed
            }
          } catch { /* ignore */ }
          try {
            if (printersRaw) {
              const parsed = JSON.parse(printersRaw)
              if (validatePrinters(parsed)) printers = parsed
            }
          } catch { /* ignore */ }
          try {
            if (designSchemaRaw) {
              const parsed = JSON.parse(designSchemaRaw)
              if (parsed && typeof parsed === 'object') designSchema = parsed
            }
          } catch { /* ignore */ }
          // 兜底：后端都没解析出来时，尝试从文本里解析对象或裸数组
          if (!fields && !events && !printers && !designSchema) {
            const objStr = extractJSONObject(acc)
            if (objStr) {
              try {
                const obj = JSON.parse(objStr)
                if (validateFields(obj.fields)) fields = obj.fields
                if (validateEvents(obj.events)) events = obj.events
                if (validatePrinters(obj.printers)) printers = obj.printers
                if (obj.design_schema && typeof obj.design_schema === 'object') designSchema = obj.design_schema
              } catch { /* ignore */ }
            }
            if (!fields && !events && !printers && !designSchema) {
              try {
                const arr = JSON.parse(extractJSONArray(acc))
                if (validateFields(arr)) fields = arr
              } catch { /* ignore */ }
            }
          }

          // 诊断日志：显示 AI 返回的结果
          console.log('[AI Chat] Received result:')
          console.log('  - fields:', fields?.length || 0, 'fields')
          console.log('  - events:', events?.length || 0, 'events')
          console.log('  - printers:', printers?.length || 0, 'printers')
          console.log('  - design_schema:', designSchema ? 'Yes' : 'No')
          if (fields && fields.length < currentFields.length) {
            console.warn('⚠️ Warning: AI returned fewer fields than current!')
            console.warn('   Current:', currentFields.length, 'fields')
            console.warn('   Returned:', fields.length, 'fields')
            console.warn('   Difference:', currentFields.length - fields.length, 'fields lost')
          }

          setBubbles(prev => [...prev, { role: 'assistant', content: acc, fields, events, printers, designSchema, source: text }])
          setStreamText('')
          setStreaming(false)
          abortRef.current = null
        },
        onError: (msg) => {
          message.error(msg)
          setBubbles(prev => [...prev, { role: 'assistant', content: acc || `（出错：${msg}）` }])
          setStreamText('')
          setStreaming(false)
          abortRef.current = null
        },
      },
      controller.signal,
    )
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 技能选择 + 历史版本 */}
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <Select
          mode="multiple"
          allowClear
          placeholder="选择套用的技能（可选）"
          style={{ flex: 1 }}
          value={selectedSkillIds}
          onChange={setSelectedSkillIds}
          options={skillOptions.map(s => ({ label: s.name, value: s.id }))}
          maxTagCount="responsive"
        />
        {pageId && (
          <Button onClick={() => {
            const next = !historyOpen
            setHistoryOpen(next)
            if (next) loadSnapshots()
          }}>
            {historyOpen ? '收起历史' : '历史版本'}
          </Button>
        )}
      </div>

      {/* 历史版本列表 */}
      {pageId && historyOpen && (
        <div style={{ marginBottom: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8, background: '#fff' }}>
          {snapshots.length === 0 && <div style={{ color: '#999', fontSize: 13, padding: 8 }}>暂无历史版本（保存后自动记录）</div>}
          {snapshots.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#1e293b' }}>
                  {s.kind === 'rollback' ? '↩ 回滚记录' : 'AI 保存'}
                  <span style={{ color: '#94a3b8', marginLeft: 6 }}>{new Date(s.created_at).toLocaleString()}</span>
                </div>
                {s.source && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source}</div>}
              </div>
              <Button
                size="small"
                loading={rollbackingId === s.id}
                onClick={() => {
                  Modal.confirm({
                    title: '回滚到此版本',
                    content: '将用该版本覆盖当前页面字段（当前状态会自动存为新历史），确认回滚？',
                    okText: '回滚',
                    cancelText: '取消',
                    onOk: async () => {
                      setRollbackingId(s.id)
                      try {
                        await authed(`/api/form-app/pages/${pageId}/snapshots/${s.id}/rollback`, 'POST')
                        message.success('已回滚到该版本')
                        loadSnapshots()
                        onAfterRollback?.()
                      } catch (e: any) {
                        message.error(e?.message || '回滚失败')
                      } finally {
                        setRollbackingId(null)
                      }
                    },
                  })
                }}
              >
                回滚
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 对话区 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, background: '#fafafa' }}>
        {bubbles.length === 0 && !streaming && (
          <Empty description="描述你想要的表单或事件逻辑，或上传一张界面截图，AI 会帮你生成字段与事件" />)}
        {bubbles.map((b, i) => (
          <div key={i} style={{ marginBottom: 14, textAlign: b.role === 'user' ? 'right' : 'left' }}>
            <div style={{
              display: 'inline-block', maxWidth: '90%', padding: '8px 12px', borderRadius: 8,
              background: b.role === 'user' ? '#e6f4ff' : '#fff', border: '1px solid #eee',
              textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {b.image && (
                <img src={b.image} alt="上传图片" style={{ maxWidth: 200, display: 'block', marginBottom: 6, borderRadius: 4 }} />
              )}
              {b.content}
              {(b.fields || b.events || b.printers || b.designSchema) && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {b.fields && (
                    <Button type="primary" size="small" onClick={() => {
                      onApplyFields(b.fields!)
                      message.success(`已预览 ${b.fields!.length} 个字段，可在右侧查看`)
                    }}>
                      预览字段（{b.fields.length} 项）
                    </Button>
                  )}
                  {b.events && onApplyEvents && (
                    <Button size="small" onClick={() => {
                      onApplyEvents(b.events!)
                      message.success(`已应用 ${b.events!.length} 个事件`)
                    }}>
                      应用事件（{b.events.length} 项）
                    </Button>
                  )}
                  {b.printers && onApplyPrinters && (
                    <Button size="small" onClick={() => {
                      onApplyPrinters(b.printers!)
                      message.success(`已应用 ${b.printers!.length} 个打印模板`)
                    }}>
                      应用打印模板（{b.printers.length} 项）
                    </Button>
                  )}
                  {b.designSchema && onApplyDesignSchema && (
                    <Button size="small" onClick={() => {
                      onApplyDesignSchema(b.designSchema!)
                      message.success('已应用布局配置到画布')
                    }}>
                      应用布局配置
                    </Button>
                  )}
                  {onSaveToPage && (
                    <Button
                      size="small"
                      loading={savingIdx === i}
                      onClick={() => {
                        const parts: string[] = []
                        if (b.fields) parts.push(`${b.fields.length} 个字段`)
                        if (b.events) parts.push(`${b.events.length} 个事件`)
                        if (b.printers) parts.push(`${b.printers.length} 个打印模板`)
                        if (b.designSchema) parts.push('布局配置')
                        Modal.confirm({
                          title: '保存到页面',
                          content: `将用这 ${parts.join(' 和 ')} 覆盖当前页面对应配置，确认保存？`,
                          okText: '保存',
                          cancelText: '取消',
                          onOk: async () => {
                            setSavingIdx(i)
                            try {
                              if (b.fields) onApplyFields(b.fields)
                              if (b.events && onApplyEvents) onApplyEvents(b.events)
                              if (b.printers && onApplyPrinters) onApplyPrinters(b.printers)
                              if (b.designSchema && onApplyDesignSchema) onApplyDesignSchema(b.designSchema)
                              // fields 缺省时传当前字段，保证 onSaveToPage 始终拿到完整字段集
                              await onSaveToPage(b.fields || currentFields, b.source, b.events, b.printers, b.designSchema)
                              message.success('已保存到页面')
                              loadSnapshots()
                            } catch (e: any) {
                              message.error(e?.message || '保存失败')
                            } finally {
                              setSavingIdx(null)
                            }
                          },
                        })
                      }}
                    >
                      保存到页面
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{ textAlign: 'left', marginBottom: 14 }}>
            <div style={{ display: 'inline-block', maxWidth: '90%', padding: '8px 12px', borderRadius: 8, background: '#fff', border: '1px solid #eee', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {streamText || <Spin size="small" />}
            </div>
          </div>
        )}
      </div>

      {/* 图片预览 */}
      {imageBase64 && (
        <div style={{ marginTop: 8 }}>
          <Space>
            <img src={imageBase64} alt="待发送" style={{ height: 48, borderRadius: 4 }} />
            <Button size="small" onClick={() => { setImageBase64(''); setMediaType('') }}>移除图片</Button>
          </Space>
        </div>
      )}

      {/* 输入区 */}
      <div style={{ marginTop: 8 }}>
        <Input.TextArea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="例如：做一个员工入职登记表，含姓名、部门；或：扫码后把值填入条码字段并提示成功（支持 Ctrl+V 粘贴图片）"
          autoSize={{ minRows: 2, maxRows: 4 }}
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); send() } }}
          onPaste={handlePaste}
          disabled={streaming}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <Upload beforeUpload={beforeUpload} showUploadList={false} accept="image/*">
            <Button disabled={streaming}>上传图片</Button>
          </Upload>
          {streaming
            ? <Button danger onClick={stop}>停止</Button>
            : <Button type="primary" onClick={send}>发送</Button>}
        </div>
      </div>
    </div>
  )
}
