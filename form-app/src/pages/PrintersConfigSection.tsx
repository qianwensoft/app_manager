/**
 * 页面级蓝牙打印模板配置（config_json.printers[]）。
 * 每个模板：名称 + 协议(cpcl/escpos/tspl) + 生成侧(agent/frontend) + 结构化指令行 或 原始模板。
 * 指令文本/数据支持 {{字段名}} 占位，运行时用表单值渲染。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, InputNumber, Select, Switch, Collapse, Space, Tooltip, Modal } from 'antd'
import type { FieldDef } from '@/runtime/types'
import type { PrinterTemplate, PrintOp, PrintProtocol, PrintGenSide, PaperType, PrintElement } from '@/runtime/printerTypes'
import PrintDebugModal from './PrintDebugModal'

let _seq = 0
function genId(prefix: string): string {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }

export default function PrintersConfigSection({
  printers,
  onChange,
  fields,
  pageId,
  onOpenAI,
}: {
  printers: PrinterTemplate[]
  onChange: (next: PrinterTemplate[]) => void
  fields: FieldDef[]
  pageId?: string
  onOpenAI?: () => void
}) {
  const navigate = useNavigate()
  const [debugTpl, setDebugTpl] = useState<PrinterTemplate | null>(null)
  const fieldHint = fields.length > 0
    ? `可用占位：${fields.slice(0, 6).map(f => `{{${f.field}}}`).join(' ')}${fields.length > 6 ? ' …' : ''}`
    : '文本/数据支持 {{字段名}} 占位'

  const addTemplate = () => {
    onChange([...printers, {
      id: genId('tpl'),
      name: `打印模板 ${printers.length + 1}`,
      protocol: 'escpos',
      gen_side: 'agent',
      content: [{ op: 'text', text: '', align: 'left', size: 1 }],
    }])
  }

  const updTemplate = (idx: number, patch: Partial<PrinterTemplate>) => {
    onChange(printers.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }

  const removeTemplate = (idx: number) => {
    onChange(printers.filter((_, i) => i !== idx))
  }

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Button size="small" type="dashed" onClick={addTemplate} style={{ flex: 1 }}>
          + 添加打印模板
        </Button>
        {onOpenAI && (
          <Button size="small" type="primary" ghost onClick={onOpenAI}>
            AI 助手
          </Button>
        )}
      </div>

      {printers.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>
          暂无打印模板
        </div>
      )}

      {printers.length > 0 && (
        <Collapse style={{ background: '#fff' }}>
          {printers.map((tpl, idx) => (
            <Collapse.Panel
              key={tpl.id}
              header={<span style={{ fontSize: 12, color: '#374151' }}>{tpl.name}（{tpl.protocol}）</span>}
              extra={
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                  {pageId && (
                    <span
                      onClick={e => { e.stopPropagation(); navigate(`/print-designer/${pageId}/${tpl.id}`) }}
                      style={{ color: '#7c3aed', fontSize: 12, cursor: 'pointer' }}
                    >高级设计</span>
                  )}
                  <span
                    onClick={e => { e.stopPropagation(); setDebugTpl(tpl) }}
                    style={{ color: '#2563eb', fontSize: 12, cursor: 'pointer' }}
                  >调试打印</span>
                  <span
                    onClick={e => { e.stopPropagation(); removeTemplate(idx) }}
                    style={{ color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                  >删除</span>
                </span>
              }
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <label style={labelStyle}>模板名称</label>
                  <Input size="small" value={tpl.name} onChange={e => updTemplate(idx, { name: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>协议</label>
                    <Tooltip title="协议须与打印机硬件语言一致；坐标布局模式下切换协议会影响打印效果">
                      <Select<PrintProtocol>
                        size="small" style={{ width: '100%' }}
                        value={tpl.protocol}
                        onChange={v => {
                          if (tpl.layout_mode === 'canvas' && (tpl.elements || []).length > 0 && v !== tpl.protocol) {
                            Modal.confirm({
                              title: '切换打印协议',
                              content: `当前模板已有坐标元素（按 ${tpl.protocol.toUpperCase()} 设计）。CPCL 与 TSPL 字体大小、行高不同，切换后打印效果会变化。建议在「高级设计」中为不同打印机分别建立模板。`,
                              okText: '仍然切换',
                              cancelText: '取消',
                              onOk: () => updTemplate(idx, { protocol: v }),
                            })
                          } else {
                            updTemplate(idx, { protocol: v })
                          }
                        }}
                        options={[
                          { value: 'escpos', label: 'ESC/POS（小票机）' },
                          { value: 'cpcl', label: 'CPCL（标签/便携）' },
                          { value: 'tspl', label: 'TSPL（标签机）' },
                        ]}
                      />
                    </Tooltip>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Tooltip title="agent=端上按结构化指令生成协议字节；frontend=前端写原始协议指令透传">
                      <label style={labelStyle}>生成方式</label>
                    </Tooltip>
                    <Select<PrintGenSide>
                      size="small" style={{ width: '100%' }}
                      value={tpl.gen_side || 'agent'}
                      onChange={v => updTemplate(idx, { gen_side: v })}
                      options={[
                        { value: 'agent', label: 'Agent 生成（推荐）' },
                        { value: 'frontend', label: '原始指令透传' },
                      ]}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 11, color: '#94a3b8' }}>{fieldHint}</div>

                {/* 纸张类型 + 标签纸长宽 */}
                <div>
                  <Tooltip title="标签纸需指定宽×高（mm），用于 TSPL/CPCL 标签机定位；连续纸（小票）无需尺寸">
                    <label style={labelStyle}>纸张类型</label>
                  </Tooltip>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Select<PaperType>
                      size="small" style={{ width: 140 }}
                      value={tpl.paper?.type || 'continuous'}
                      onChange={v => updTemplate(idx, {
                        paper: v === 'label'
                          ? { type: 'label', width_mm: tpl.paper?.width_mm ?? 40, height_mm: tpl.paper?.height_mm ?? 30, gap_mm: tpl.paper?.gap_mm ?? 2 }
                          : { type: 'continuous' },
                      })}
                      options={[
                        { value: 'continuous', label: '连续小票纸' },
                        { value: 'label', label: '标签纸' },
                      ]}
                    />
                    {tpl.paper?.type === 'label' && (
                      <>
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 2 }}>宽(mm)</label>
                          <InputNumber size="small" min={1} max={300} style={{ width: 80 }}
                            value={tpl.paper?.width_mm}
                            onChange={v => updTemplate(idx, { paper: { ...tpl.paper!, width_mm: Number(v) || undefined } })} />
                        </div>
                        <div style={{ fontSize: 16, color: '#94a3b8', paddingBottom: 4 }}>×</div>
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 2 }}>高(mm)</label>
                          <InputNumber size="small" min={1} max={300} style={{ width: 80 }}
                            value={tpl.paper?.height_mm}
                            onChange={v => updTemplate(idx, { paper: { ...tpl.paper!, height_mm: Number(v) || undefined } })} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 2 }}>间距(mm)</label>
                          <InputNumber size="small" min={0} max={20} style={{ width: 80 }}
                            value={tpl.paper?.gap_mm ?? 2}
                            onChange={v => updTemplate(idx, { paper: { ...tpl.paper!, gap_mm: Number(v) || 0 } })} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 2 }}>旋转</label>
                          <Select<0 | 90 | 180 | 270>
                            size="small" style={{ width: 80 }}
                            value={tpl.paper?.rotate ?? 0}
                            onChange={v => updTemplate(idx, { paper: { ...tpl.paper!, rotate: v } })}
                            options={([0, 90, 180, 270] as const).map(r => ({ value: r, label: `${r}°` }))}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* CPCL 二维码长度前缀配置 */}
                {tpl.protocol === 'cpcl' && (
                  <div>
                    <Tooltip title="CPCL 二维码指令格式：默认使用 MM,数据（不带长度）；部分斑马打印机需要 MA,长度 格式避免缺位，勾选此项启用">
                      <label style={labelStyle}>CPCL 二维码带长度</label>
                    </Tooltip>
                    <Radio.Group
                      size="small"
                      value={!!tpl.paper?.cpcl_qr_with_length}
                      onChange={e => updTemplate(idx, {
                        paper: { ...(tpl.paper || { type: 'continuous' }), cpcl_qr_with_length: e.target.value }
                      })}
                      optionType="button"
                      options={[
                        { label: '否（默认）', value: false },
                        { label: '是', value: true },
                      ]}
                    />
                  </div>
                )}

                {(tpl.gen_side || 'agent') === 'frontend' ? (
                  <div>
                    <label style={labelStyle}>原始协议指令（支持 {'{{字段}}'} 占位）</label>
                    <Input.TextArea
                      rows={6}
                      value={tpl.raw_template || ''}
                      onChange={e => updTemplate(idx, { raw_template: e.target.value })}
                      placeholder={'如 CPCL:\n! 0 200 200 210 1\nTEXT 4 0 30 40 {{product_name}}\nFORM\nPRINT'}
                    />
                  </div>
                ) : (
                  <OpEditor
                    content={tpl.content || []}
                    onChange={content => updTemplate(idx, { content })}
                  />
                )}
              </Space>
            </Collapse.Panel>
          ))}
        </Collapse>
      )}

      <PrintDebugModal
        open={!!debugTpl}
        template={debugTpl}
        fields={fields}
        onClose={() => setDebugTpl(null)}
      />
    </div>
  )
}

// ── 结构化指令行编辑器 ──────────────────────────────────────────────
function OpEditor({ content, onChange }: { content: PrintOp[]; onChange: (c: PrintOp[]) => void }) {
  const add = (op: PrintOp) => onChange([...content, op])
  const upd = (i: number, patch: any) => onChange(content.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) as PrintOp[])
  const remove = (i: number) => onChange(content.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= content.length) return
    const n = [...content]
    ;[n[i], n[j]] = [n[j], n[i]]
    onChange(n)
  }

  return (
    <div>
      <label style={labelStyle}>打印内容（按顺序）</label>
      {content.map((op, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start', background: '#f8fafc', padding: 6, borderRadius: 6 }}>
          <Select
            size="small" style={{ width: 90 }}
            value={op.op}
            onChange={v => {
              // 切换类型时重置为该类型默认结构
              const defaults: Record<string, PrintOp> = {
                text: { op: 'text', text: '', align: 'left', size: 1 },
                barcode: { op: 'barcode', format: 'code128', data: '' },
                qrcode: { op: 'qrcode', data: '', size: 6 },
                line: { op: 'line' },
                feed: { op: 'feed', lines: 1 },
                cut: { op: 'cut' },
              }
              upd(i, defaults[v] as any)
            }}
            options={[
              { value: 'text', label: '文本' },
              { value: 'barcode', label: '条码' },
              { value: 'qrcode', label: '二维码' },
              { value: 'line', label: '分隔线' },
              { value: 'feed', label: '走纸' },
              { value: 'cut', label: '切纸' },
            ]}
          />
          <div style={{ flex: 1 }}>
            {op.op === 'text' && (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Input size="small" placeholder="文本，支持 {{字段}}" value={op.text} onChange={e => upd(i, { text: e.target.value })} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <Select size="small" style={{ flex: 1 }} value={op.align || 'left'} onChange={v => upd(i, { align: v })}
                    options={[{ value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }]} />
                  <Select size="small" style={{ flex: 1 }} value={op.size || 1} onChange={v => upd(i, { size: v })}
                    options={[{ value: 1, label: '正常' }, { value: 2, label: '大' }, { value: 3, label: '特大' }]} />
                  <Switch size="small" checkedChildren="粗" unCheckedChildren="细" checked={!!op.bold} onChange={v => upd(i, { bold: v })} />
                </div>
              </Space>
            )}
            {op.op === 'barcode' && (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Input size="small" placeholder="条码数据，支持 {{字段}}" value={op.data} onChange={e => upd(i, { data: e.target.value })} />
                <Select size="small" style={{ width: '100%' }} value={op.format || 'code128'} onChange={v => upd(i, { format: v })}
                  options={[{ value: 'code128', label: 'CODE128' }, { value: 'code39', label: 'CODE39' }, { value: 'ean13', label: 'EAN13' }, { value: 'ean8', label: 'EAN8' }]} />
              </Space>
            )}
            {op.op === 'qrcode' && (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Input size="small" placeholder="二维码内容，支持 {{字段}}" value={op.data} onChange={e => upd(i, { data: e.target.value })} />
                <Select size="small" style={{ width: '100%' }} value={op.size || 6} onChange={v => upd(i, { size: v })}
                  options={[3, 4, 5, 6, 7, 8].map(s => ({ value: s, label: `尺寸 ${s}` }))} />
              </Space>
            )}
            {op.op === 'feed' && (
              <Input size="small" type="number" placeholder="走纸行数" value={op.lines ?? 1} onChange={e => upd(i, { lines: Number(e.target.value) })} />
            )}
            {(op.op === 'line' || op.op === 'cut') && (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{op.op === 'line' ? '一条分隔线' : '切纸'}</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button size="small" type="text" style={{ padding: '0 4px', height: 18 }} onClick={() => move(i, -1)}>↑</Button>
            <Button size="small" type="text" style={{ padding: '0 4px', height: 18 }} onClick={() => move(i, 1)}>↓</Button>
          </div>
          <Button size="small" danger type="text" onClick={() => remove(i)}>×</Button>
        </div>
      ))}
      <Space wrap size={4} style={{ marginTop: 4 }}>
        <Button size="small" onClick={() => add({ op: 'text', text: '', align: 'left', size: 1 })}>+文本</Button>
        <Button size="small" onClick={() => add({ op: 'barcode', format: 'code128', data: '' })}>+条码</Button>
        <Button size="small" onClick={() => add({ op: 'qrcode', data: '', size: 6 })}>+二维码</Button>
        <Button size="small" onClick={() => add({ op: 'line' })}>+分隔线</Button>
        <Button size="small" onClick={() => add({ op: 'feed', lines: 1 })}>+走纸</Button>
        <Button size="small" onClick={() => add({ op: 'cut' })}>+切纸</Button>
      </Space>
    </div>
  )
}
