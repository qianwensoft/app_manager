/**
 * 打印模板高级设计器（独立全屏页面）。
 * 路由：/print-designer/:pageId/:tplId
 *
 * 三种布局模式：
 *  - flow：顺序流指令（与基础编辑器一致，逐行堆叠）
 *  - canvas：坐标自由布局（mm 画布上绝对摆放文本/条码/二维码/线/框）
 *  - raw：原始协议模板（TSPL/CPCL 指令文本，支持 {{占位}}）
 *
 * 右栏内嵌设备调试：选在线设备 + 样例数据 → 下发实打印 → 日志反馈。
 * 仅修改 config_json.printers 中 id===tplId 的模板，整体 PUT 回页面。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button, Input, InputNumber, Select, Radio, Space, message, Spin, Alert, Tooltip, Divider, Modal, AutoComplete,
} from 'antd'
import { authed } from '@/console/api'
import type {
  PrinterTemplate, PrintElement, PrintLayoutMode, PrintProtocol, PaperType, PrintCondition, PrintCondOp,
} from '@/runtime/printerTypes'
import { buildPrintPayload } from '@/runtime/printBridge'

const PX_PER_MM = 4 // 画布基准缩放：1mm = 4px（再乘以 zoom 倍率）
const MIN_ZOOM = 0.1 // 缩放下限（防止缩到不可见）
const MAX_ZOOM = 64 // 缩放上限（仅防溢出，实际近似不限制）
const ZOOM_STEP = 1.2 // 按钮每次缩放倍率
const MAX_FONT_MULT = 10 // 文本字号最大倍数

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

let _seq = 0
function genId(prefix: string): string {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

type DeviceOpt = { id: string; name: string }

export default function PrintDesignerPage() {
  const { pageId, tplId } = useParams<{ pageId: string; tplId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageTitle, setPageTitle] = useState('')
  const [fields, setFields] = useState<any[]>([])
  const [tpl, setTpl] = useState<PrinterTemplate | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const rawConfigRef = useRef<any>({}) // 完整 config_json，保存时只改 printers 对应项

  // ── 加载 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pageId || !tplId) return
    setLoading(true)
    authed(`/api/form-app/pages/${pageId}`, 'GET')
      .then(res => {
        const d = res.data
        setPageTitle(d.title || '')
        const config = d.config_json ? JSON.parse(d.config_json) : {}
        rawConfigRef.current = config
        setFields(Array.isArray(config.field_definitions) ? config.field_definitions : [])
        const printers: PrinterTemplate[] = Array.isArray(config.printers) ? config.printers : []
        const found = printers.find(p => p.id === tplId)
        if (!found) { message.error('未找到该打印模板'); return }
        // 兼容：旧 frontend 视同 raw
        if (!found.layout_mode) {
          found.layout_mode = (found.gen_side === 'frontend') ? 'raw' : 'flow'
        }
        setTpl(found)
      })
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false))
  }, [pageId, tplId])

  const upd = (patch: Partial<PrinterTemplate>) => setTpl(prev => (prev ? { ...prev, ...patch } : prev))
  const updPaper = (patch: any) => setTpl(prev => (prev ? { ...prev, paper: { ...(prev.paper || { type: 'continuous' }), ...patch } } : prev))

  // ── 保存 ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!tpl || !pageId) return
    setSaving(true)
    try {
      const config = { ...rawConfigRef.current }
      const printers: PrinterTemplate[] = Array.isArray(config.printers) ? [...config.printers] : []
      const idx = printers.findIndex(p => p.id === tpl.id)
      if (idx >= 0) printers[idx] = tpl
      else printers.push(tpl)
      config.printers = printers
      await authed(`/api/form-app/pages/${pageId}`, 'PUT', { config_json: JSON.stringify(config) })
      rawConfigRef.current = config
      message.success('已保存')
    } catch (e: any) {
      message.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ── 画布元素操作 ────────────────────────────────────────────────────
  const elements = tpl?.elements || []
  const setElements = (next: PrintElement[]) => upd({ elements: next })
  const addElement = (type: PrintElement['type']) => {
    const base: PrintElement = { id: genId('el'), type, x_mm: 2, y_mm: 2 }
    if (type === 'text') Object.assign(base, { text: '文本', font_size: 1 })
    if (type === 'barcode') Object.assign(base, { data: '{{code}}', format: 'code128', height_mm: 10 })
    if (type === 'qrcode') Object.assign(base, { data: '{{code}}', cell: 4 })
    if (type === 'line') Object.assign(base, { width_mm: 20, thickness_mm: 0.5 })
    if (type === 'rect') Object.assign(base, { width_mm: 20, height_mm: 10, thickness_mm: 0.5 })
    setElements([...elements, base])
    setSelId(base.id)
  }
  const updElement = (id: string, patch: Partial<PrintElement>) =>
    setElements(elements.map(e => (e.id === id ? { ...e, ...patch } : e)))
  const removeElement = (id: string) => {
    setElements(elements.filter(e => e.id !== id))
    if (selId === id) setSelId(null)
  }
  const duplicateElement = (id: string) => {
    const src = elements.find(e => e.id === id)
    if (!src) return
    const copy: PrintElement = { ...src, id: genId('el'), x_mm: src.x_mm + 2, y_mm: src.y_mm + 2 }
    setElements([...elements, copy])
    setSelId(copy.id)
  }
  // 层级调整：front 置顶（数组末尾，绘制在上层），back 置底（数组开头）
  const reorderElement = (id: string, dir: 'front' | 'back') => {
    const idx = elements.findIndex(e => e.id === id)
    if (idx < 0) return
    const next = [...elements]
    const [el] = next.splice(idx, 1)
    if (dir === 'front') next.push(el)
    else next.unshift(el)
    setElements(next)
  }

  const selected = elements.find(e => e.id === selId) || null

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
  if (!tpl) return <div style={{ padding: 48, textAlign: 'center' }}>模板不存在 <Button onClick={() => navigate(-1)}>返回</Button></div>

  const mode: PrintLayoutMode = tpl.layout_mode || 'flow'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <span style={{ color: '#64748b', fontSize: 13 }}>页面：{pageTitle}</span>
        <Input style={{ width: 180 }} value={tpl.name} onChange={e => upd({ name: e.target.value })} placeholder="模板名称" />
        <Select<PrintProtocol>
          style={{ width: 150 }}
          value={tpl.protocol}
          onChange={v => {
            if (mode === 'canvas' && elements.length > 0 && v !== tpl.protocol) {
              Modal.confirm({
                title: '切换打印协议',
                content: `当前已有 ${elements.length} 个坐标元素（按 ${tpl.protocol.toUpperCase()} 设计）。CPCL 与 TSPL 的字体大小、行高不同，切换后打印效果会变化。建议为不同打印机分别建立模板。`,
                okText: '仍然切换',
                cancelText: '取消',
                onOk: () => upd({ protocol: v }),
              })
            } else {
              upd({ protocol: v })
            }
          }}
          options={[
            { value: 'escpos', label: 'ESC/POS（小票）' },
            { value: 'cpcl', label: 'CPCL（标签）' },
            { value: 'tspl', label: 'TSPL（标签机）' },
          ]}
        />
        <Radio.Group value={mode} onChange={e => upd({ layout_mode: e.target.value })} optionType="button" buttonStyle="solid">
          <Radio.Button value="flow">顺序流</Radio.Button>
          <Radio.Button value="canvas">坐标布局</Radio.Button>
          <Radio.Button value="raw">原始协议</Radio.Button>
        </Radio.Group>
        <div style={{ flex: 1 }} />
        <Button type="primary" loading={saving} onClick={save}>保存</Button>
      </div>

      {/* 纸张设置 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>纸张</span>
        <Select<PaperType> size="small" style={{ width: 130 }} value={tpl.paper?.type || 'continuous'}
          onChange={v => updPaper(v === 'label'
            ? { type: 'label', width_mm: tpl.paper?.width_mm ?? 40, height_mm: tpl.paper?.height_mm ?? 30, gap_mm: tpl.paper?.gap_mm ?? 2, dpi: tpl.paper?.dpi, offset_x_mm: tpl.paper?.offset_x_mm, offset_y_mm: tpl.paper?.offset_y_mm }
            : { type: 'continuous', dpi: tpl.paper?.dpi, offset_x_mm: tpl.paper?.offset_x_mm, offset_y_mm: tpl.paper?.offset_y_mm })}
          options={[{ value: 'continuous', label: '连续小票纸' }, { value: 'label', label: '标签纸' }]} />
        {tpl.paper?.type === 'label' && (
          <>
            <span style={{ fontSize: 12 }}>宽</span>
            <InputNumber size="small" min={1} max={300} style={{ width: 70 }} value={tpl.paper?.width_mm} onChange={v => updPaper({ width_mm: Number(v) || undefined })} />
            <span style={{ fontSize: 12 }}>× 高</span>
            <InputNumber size="small" min={1} max={300} style={{ width: 70 }} value={tpl.paper?.height_mm} onChange={v => updPaper({ height_mm: Number(v) || undefined })} />
            <span style={{ fontSize: 12 }}>间距</span>
            <InputNumber size="small" min={0} max={20} style={{ width: 60 }} value={tpl.paper?.gap_mm ?? 2} onChange={v => updPaper({ gap_mm: Number(v) || 0 })} />
            <span style={{ fontSize: 12 }}>mm</span>
          </>
        )}
        <Divider type="vertical" />
        <Tooltip title="打印机分辨率，决定坐标/尺寸 mm→点 的换算。打印整体偏移或缩放不对时，先核对此项（203dpi 机型选 203，300dpi 机型选 300）。">
          <span style={{ fontSize: 12, color: '#64748b' }}>分辨率</span>
        </Tooltip>
        <Select
          size="small"
          style={{ width: 120 }}
          value={tpl.paper?.dpi ?? 203}
          onChange={v => updPaper({ dpi: Number(v) || 203 })}
          options={[
            { value: 203, label: '203 dpi' },
            { value: 300, label: '300 dpi' },
            { value: 600, label: '600 dpi' },
          ]}
        />
        {tpl.protocol === 'cpcl' && (
          <>
            <Divider type="vertical" />
            <Tooltip title="ZR138 简体中文通常使用 GBUNSG24.CPF；字体必须已安装在打印机中。CPCL 文本会自动使用 GB18030 编码并声明 ENCODING GB18030。">
              <span style={{ fontSize: 12, color: '#64748b' }}>CPCL 字体</span>
            </Tooltip>
            <AutoComplete
              size="small"
              style={{ width: 180 }}
              allowClear
              placeholder="GBUNSG24.CPF（默认）"
              value={tpl.paper?.cpcl_font || undefined}
              onChange={v => updPaper({ cpcl_font: v || undefined })}
              filterOption={(input, opt) =>
                (opt?.value as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={[
                { label: 'GBUNSG24.CPF – 简体中文 24×24', value: 'GBUNSG24.CPF' },
                { label: 'GBUNSG16.CPF – 简体中文 16×16', value: 'GBUNSG16.CPF' },
                { label: 'CTUNMK24.CPF – 繁体中文', value: 'CTUNMK24.CPF' },
              ]}
            />
          </>
        )}
        {tpl.protocol === 'tspl' && (
          <>
            <Divider type="vertical" />
            <Tooltip title={'TSPL 文本字体。内置编号字体（0~8）无需字体文件，所有机型均可用；文字不打印通常是字体文件在打印机内存中不存在。\n简体中文机：CHNGB.BF2\n繁体中文机：TSS24.BF2\n英文机内置：0 / 1 / 2 / 4\n自定义 TTF：ROMAN.TTF 等'}>
              <span style={{ fontSize: 12, color: '#64748b' }}>字体</span>
            </Tooltip>
            <AutoComplete
              size="small"
              style={{ width: 160 }}
              allowClear
              placeholder="CHNGB.BF2（默认）"
              value={tpl.paper?.tspl_font || undefined}
              onChange={v => updPaper({ tspl_font: v || undefined })}
              filterOption={(input, opt) =>
                (opt?.value as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={[
                { label: '0 – 内置（英文，始终可用）', value: '0' },
                { label: '1 – 内置（英文，始终可用）', value: '1' },
                { label: '2 – 内置（英文，始终可用）', value: '2' },
                { label: '4 – 内置（英文，始终可用）', value: '4' },
                { label: 'CHNGB.BF2 – 简体中文', value: 'CHNGB.BF2' },
                { label: 'TSS24.BF2 – 繁体中文', value: 'TSS24.BF2' },
                { label: 'ROMAN.TTF – 英文 TTF', value: 'ROMAN.TTF' },
              ]}
            />
          </>
        )}
        <Tooltip title="整体原点偏移（mm）：当打印结果整体平移时，用它把内容推回正确位置。可为负值。仅作用于坐标布局。">
          <span style={{ fontSize: 12, color: '#64748b' }}>偏移</span>
        </Tooltip>
        <span style={{ fontSize: 12 }}>X</span>
        <InputNumber size="small" step={0.5} style={{ width: 64 }} value={tpl.paper?.offset_x_mm ?? 0} onChange={v => updPaper({ offset_x_mm: Number(v) || 0 })} />
        <span style={{ fontSize: 12 }}>Y</span>
        <InputNumber size="small" step={0.5} style={{ width: 64 }} value={tpl.paper?.offset_y_mm ?? 0} onChange={v => updPaper({ offset_y_mm: Number(v) || 0 })} />
        <span style={{ fontSize: 12 }}>mm</span>
        <Divider type="vertical" />
        <Tooltip title="纸张整体旋转角度。90° 时宽高互换（如 50×40→40×50），打印内容同步旋转。仅作用于坐标布局。">
          <span style={{ fontSize: 12, color: '#64748b' }}>旋转</span>
        </Tooltip>
        <Select<0 | 90 | 180 | 270>
          size="small"
          style={{ width: 80 }}
          value={tpl.paper?.rotate ?? 0}
          onChange={v => updPaper({ rotate: v })}
          options={([0, 90, 180, 270] as const).map(r => ({ value: r, label: `${r}°` }))}
        />
      </div>

      {/* 主体：左编辑 + 右属性/调试 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左栏 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {mode === 'canvas' && (
            <CanvasEditor
              tpl={tpl}
              elements={elements}
              selId={selId}
              onSelect={setSelId}
              onAdd={addElement}
              onMove={(id, x, y) => updElement(id, { x_mm: x, y_mm: y })}
              onResize={(id, patch) => updElement(id, patch)}
              onRemove={removeElement}
              onDuplicate={duplicateElement}
              onReorder={reorderElement}
            />
          )}
          {mode === 'raw' && (
            <div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>原始协议指令（支持 {'{{字段}}'} 占位）</div>
              <Input.TextArea
                rows={20}
                value={tpl.raw_template || ''}
                onChange={e => upd({ raw_template: e.target.value })}
                placeholder={'TSPL 示例:\nSIZE 40 mm,30 mm\nGAP 2 mm,0 mm\nCLS\nTEXT 20,20,"TSS24.BF2",0,1,1,"{{name}}"\nBARCODE 20,60,"128",60,1,0,2,2,"{{code}}"\nPRINT 1,1'}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          )}
          {mode === 'flow' && (
            <Alert
              type="info"
              showIcon
              message="顺序流模式"
              description="顺序流（逐行堆叠）请在页面编辑器的「打印模板」基础编辑区维护；本设计器主要用于坐标布局与原始协议。切到「坐标布局」可自由摆放元素。"
            />
          )}
        </div>

        {/* 右栏 */}
        <div style={{ width: 320, borderLeft: '1px solid #e2e8f0', background: '#fff', overflow: 'auto', padding: 14 }}>
          {mode === 'canvas' && (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>元素属性</div>
              {selected ? (
                <ElementProps el={selected} fields={fields} onChange={patch => updElement(selected.id, patch)} onRemove={() => removeElement(selected.id)} />
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 12 }}>在画布中选择一个元素以编辑属性</div>
              )}
              <Divider />
            </>
          )}
          <DebugPanel tpl={tpl} fields={fields} />
        </div>
      </div>
    </div>
  )
}

// ── 画布编辑器 ────────────────────────────────────────────────────────
function CanvasEditor({
  tpl, elements, selId, onSelect, onAdd, onMove, onResize, onRemove, onDuplicate, onReorder,
}: {
  tpl: PrinterTemplate
  elements: PrintElement[]
  selId: string | null
  onSelect: (id: string | null) => void
  onAdd: (type: PrintElement['type']) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, patch: Partial<PrintElement>) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, dir: 'front' | 'back') => void
}) {
  const rawW = tpl.paper?.type === 'label' ? (tpl.paper?.width_mm || 40) : 60
  const rawH = tpl.paper?.type === 'label' ? (tpl.paper?.height_mm || 30) : 80
  const rotate = (tpl.paper?.rotate ?? 0) as 0 | 90 | 180 | 270
  const isSwapped = rotate === 90 || rotate === 270
  const wMm = isSwapped ? rawH : rawW
  const hMm = isSwapped ? rawW : rawH
  const [zoom, setZoom] = useState(1)
  const pxPerMm = PX_PER_MM * zoom
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  // 右键菜单：屏幕坐标 + 目标元素
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const zoomOut = () => setZoom(z => clampZoom(z / ZOOM_STEP))
  const zoomIn = () => setZoom(z => clampZoom(z * ZOOM_STEP))

  // 触控板双指缩放 / Ctrl+滚轮缩放：以光标为锚点，保持锚点下的画布位置不动。
  // macOS 触控板双指捏合会触发带 ctrlKey 的 wheel 事件，与 Ctrl+滚轮同路径处理。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // 仅在双指捏合 / Ctrl+滚轮时缩放，普通滚轮保留滚动
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      // 锚点在内容坐标系中的位置（含当前滚动量）
      const ax = e.clientX - rect.left + el.scrollLeft
      const ay = e.clientY - rect.top + el.scrollTop
      setZoom(prev => {
        const factor = Math.exp(-e.deltaY * 0.0015) // 平滑指数缩放
        const next = clampZoom(prev * factor)
        if (next === prev) return prev
        const ratio = next / prev
        // 缩放后调整滚动，使锚点保持在光标下
        requestAnimationFrame(() => {
          el.scrollLeft = ax * ratio - (e.clientX - rect.left)
          el.scrollTop = ay * ratio - (e.clientY - rect.top)
        })
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 关闭右键菜单：任意点击/Esc
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // 选中元素后支持 Delete 键删除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return // 不拦截属性面板输入
        e.preventDefault()
        onRemove(selId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selId, onRemove])

  const onMouseDown = (e: React.MouseEvent, el: PrintElement) => {
    if (e.button !== 0) return // 仅左键拖拽
    e.stopPropagation()
    onSelect(el.id)
    dragRef.current = { id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x_mm, origY: el.y_mm, moved: false }
    const onMM = (ev: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const dxMm = (ev.clientX - d.startX) / pxPerMm
      const dyMm = (ev.clientY - d.startY) / pxPerMm
      if (Math.abs(ev.clientX - d.startX) > 2 || Math.abs(ev.clientY - d.startY) > 2) d.moved = true
      const nx = Math.max(0, Math.min(wMm, Math.round(d.origX + dxMm)))
      const ny = Math.max(0, Math.min(hMm, Math.round(d.origY + dyMm)))
      onMove(d.id, nx, ny)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMM)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMM)
    window.addEventListener('mouseup', onUp)
  }

  const onElementContextMenu = (e: React.MouseEvent, el: PrintElement) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(el.id)
    setMenu({ x: e.clientX, y: e.clientY, id: el.id })
  }

  // 拖拽右下角手柄缩放：按元素类型映射到不同尺寸属性。
  // text→字号倍数（按高度增量近似）；barcode→高度；qrcode→倍率；line→长度；rect→宽高。
  const onResizeStart = (e: React.MouseEvent, el: PrintElement) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(el.id)
    const startX = e.clientX
    const startY = e.clientY
    const origFont = el.font_size || 1
    const origH = el.height_mm || 10
    const origCell = el.cell || 4
    const origW = el.width_mm || 20
    const onMM = (ev: MouseEvent) => {
      const dxMm = (ev.clientX - startX) / pxPerMm
      const dyMm = (ev.clientY - startY) / pxPerMm
      switch (el.type) {
        case 'text': {
          // 文本以约 3mm/倍 的步进缩放字号倍数
          const next = Math.round(origFont + dyMm / 3)
          onResize(el.id, { font_size: Math.max(1, Math.min(MAX_FONT_MULT, next)) })
          break
        }
        case 'barcode': {
          onResize(el.id, { height_mm: Math.max(1, Math.round(origH + dyMm)) })
          break
        }
        case 'qrcode': {
          // 二维码等比：取较大位移方向，约 1.5mm/级
          const delta = Math.max(dxMm, dyMm)
          onResize(el.id, { cell: Math.max(1, Math.min(20, Math.round(origCell + delta / 1.5))) })
          break
        }
        case 'line': {
          onResize(el.id, { width_mm: Math.max(1, Math.round(origW + dxMm)) })
          break
        }
        case 'rect': {
          onResize(el.id, {
            width_mm: Math.max(1, Math.round(origW + dxMm)),
            height_mm: Math.max(1, Math.round(origH + dyMm)),
          })
          break
        }
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMM)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMM)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div>
      <Space wrap size={6} style={{ marginBottom: 10 }}>
        <Button size="small" onClick={() => onAdd('text')}>+文本</Button>
        <Button size="small" onClick={() => onAdd('barcode')}>+条码</Button>
        <Button size="small" onClick={() => onAdd('qrcode')}>+二维码</Button>
        <Button size="small" onClick={() => onAdd('line')}>+线</Button>
        <Button size="small" onClick={() => onAdd('rect')}>+框</Button>
        {selId && <Button size="small" danger onClick={() => onRemove(selId)}>删除选中</Button>}
        <Divider type="vertical" />
        <Button size="small" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>－</Button>
        <span style={{ fontSize: 12, color: '#475569', width: 44, textAlign: 'center', display: 'inline-block' }}>{Math.round(zoom * 100)}%</span>
        <Button size="small" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>＋</Button>
        <Button size="small" type="link" onClick={() => setZoom(1)} disabled={zoom === 1}>复位</Button>
      </Space>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
        {rotate !== 0
          ? <span>纸张已旋转 <strong>{rotate}°</strong>（显示尺寸 {wMm}×{hMm} mm）；实际打印宽高为 {rawW}×{rawH} mm。{wMm}×{hMm} mm 示意（1mm={PX_PER_MM}px×{Math.round(zoom * 100)}%）。</span>
          : <span>画布按 {wMm}×{hMm} mm 示意（1mm={PX_PER_MM}px×{Math.round(zoom * 100)}%）。</span>
        }
        左键拖动定位，拖右下角蓝点缩放，触控板双指或 Ctrl+滚轮缩放画布，右键菜单可删除/复制/调层，选中后按 Delete 删除。
      </div>
      <div ref={scrollRef} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)', padding: 8, background: '#f8fafc', borderRadius: 6 }}>
        <div style={{ display: 'inline-block', position: 'relative' }}>
          {rotate !== 0 && (
            <div style={{
              position: 'absolute', left: -28, top: '50%', transform: 'translateY(-50%)',
              background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '2px 6px',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', zIndex: 10,
            }}>
              ↻ {rotate}°
            </div>
          )}
          <div
            onClick={() => onSelect(null)}
            style={{
              position: 'relative',
              width: wMm * pxPerMm,
              height: hMm * pxPerMm,
              background: '#fff',
              border: '1px dashed #94a3b8',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              backgroundImage: 'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)',
              backgroundSize: `${pxPerMm * 5}px ${pxPerMm * 5}px`,
              transform: `rotate(${rotate}deg)`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease',
            }}
          >
          {elements.map(el => (
            <div
              key={el.id}
              onMouseDown={e => onMouseDown(e, el)}
              onContextMenu={e => onElementContextMenu(e, el)}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: el.x_mm * pxPerMm,
                top: el.y_mm * pxPerMm,
                cursor: 'move',
                border: selId === el.id ? '1px solid #2563eb' : '1px solid transparent',
                outline: selId === el.id ? '1px solid rgba(37,99,235,0.3)' : 'none',
                padding: 1,
                userSelect: 'none',
              }}
            >
              <ElementGlyph el={el} pxPerMm={pxPerMm} />
              {el.print_when?.field && (
                <div
                  title="此元素带打印条件"
                  style={{
                    position: 'absolute', top: -7, left: -7, width: 14, height: 14,
                    background: '#f59e0b', color: '#fff', borderRadius: '50%',
                    fontSize: 9, lineHeight: '14px', textAlign: 'center',
                    border: '1.5px solid #fff', boxShadow: '0 0 2px rgba(0,0,0,0.4)', pointerEvents: 'none',
                  }}
                >?</div>
              )}
              {selId === el.id && (
                <div
                  onMouseDown={e => onResizeStart(e, el)}
                  title="拖拽缩放"
                  style={{
                    position: 'absolute',
                    right: -5,
                    bottom: -5,
                    width: 10,
                    height: 10,
                    background: '#2563eb',
                    border: '1.5px solid #fff',
                    borderRadius: 2,
                    cursor: 'nwse-resize',
                    boxShadow: '0 0 2px rgba(0,0,0,0.4)',
                  }}
                />
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onDelete={() => { onRemove(menu.id); setMenu(null) }}
          onDuplicate={() => { onDuplicate(menu.id); setMenu(null) }}
          onFront={() => { onReorder(menu.id, 'front'); setMenu(null) }}
          onBack={() => { onReorder(menu.id, 'back'); setMenu(null) }}
        />
      )}
    </div>
  )
}

// 画布元素右键菜单
function ContextMenu({
  x, y, onDelete, onDuplicate, onFront, onBack,
}: {
  x: number; y: number
  onDelete: () => void; onDuplicate: () => void; onFront: () => void; onBack: () => void
}) {
  const item = (label: string, fn: () => void, danger?: boolean) => (
    <div
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); fn() }}
      style={{ padding: '6px 16px', fontSize: 13, cursor: 'pointer', color: danger ? '#dc2626' : '#1e293b', whiteSpace: 'nowrap' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </div>
  )
  return (
    <div
      style={{
        position: 'fixed', left: x, top: y, zIndex: 2000,
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.16)', padding: '4px 0', minWidth: 140,
      }}
      onClick={e => e.stopPropagation()}
    >
      {item('复制', onDuplicate)}
      {item('置于顶层', onFront)}
      {item('置于底层', onBack)}
      <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
      {item('删除', onDelete, true)}
    </div>
  )
}

// 画布上元素的示意渲染
function ElementGlyph({ el, pxPerMm }: { el: PrintElement; pxPerMm: number }) {
  if (el.type === 'text') {
    // 字号倍数近似为像素：约 8px×倍数，并随画布缩放联动
    const px = 8 * (el.font_size || 1) * (pxPerMm / PX_PER_MM)
    return <span style={{ fontSize: px, lineHeight: 1.1, fontWeight: el.bold ? 700 : 400, whiteSpace: 'nowrap', color: '#111' }}>{el.text || '文本'}</span>
  }
  if (el.type === 'barcode') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ height: (el.height_mm || 10) * pxPerMm, width: 20 * pxPerMm, backgroundImage: 'repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px)' }} />
        <div style={{ fontSize: 8 * (pxPerMm / PX_PER_MM), color: '#555' }}>{el.data || ''}</div>
      </div>
    )
  }
  if (el.type === 'qrcode') {
    const s = (el.cell || 4) * 1.5 * pxPerMm
    return <div style={{ width: s, height: s, background: 'repeating-conic-gradient(#111 0% 25%, #fff 0% 50%) 50%/6px 6px' }} />
  }
  if (el.type === 'line') {
    return <div style={{ width: (el.width_mm || 20) * pxPerMm, height: Math.max(1, (el.thickness_mm || 0.5) * pxPerMm), background: '#111' }} />
  }
  // rect
  return <div style={{ width: (el.width_mm || 20) * pxPerMm, height: (el.height_mm || 10) * pxPerMm, border: `${Math.max(1, (el.thickness_mm || 0.5) * pxPerMm)}px solid #111` }} />
}

// ── 元素属性面板 ──────────────────────────────────────────────────────
function ElementProps({ el, fields, onChange, onRemove }: { el: PrintElement; fields: any[]; onChange: (p: Partial<PrintElement>) => void; onRemove: () => void }) {
  const row = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: 56, fontSize: 12, color: '#64748b' }}>{label}</span>
      <div style={{ flex: 1 }}>{node}</div>
    </div>
  )
  return (
    <div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>类型：{el.type}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {row('X(mm)', <InputNumber size="small" style={{ width: '100%' }} min={0} value={el.x_mm} onChange={v => onChange({ x_mm: Number(v) || 0 })} />)}
        {row('Y(mm)', <InputNumber size="small" style={{ width: '100%' }} min={0} value={el.y_mm} onChange={v => onChange({ y_mm: Number(v) || 0 })} />)}
      </div>

      {el.type === 'text' && (
        <>
          {row('文本', <Input size="small" value={el.text} onChange={e => onChange({ text: e.target.value })} placeholder="支持 {{字段}}" />)}
          {row('字号', <Select size="small" style={{ width: '100%' }} value={el.font_size || 1} onChange={v => onChange({ font_size: v })}
            options={Array.from({ length: MAX_FONT_MULT }, (_, i) => i + 1).map(s => ({ value: s, label: `${s} 倍` }))} />)}
          {row('加粗', <Radio.Group size="small" value={!!el.bold} onChange={e => onChange({ bold: e.target.value })}
            options={[{ label: '否', value: false }, { label: '是', value: true }]} optionType="button" />)}
          {row('旋转', <Select<0 | 90 | 180 | 270> size="small" style={{ width: '100%' }} value={el.rotate || 0} onChange={v => onChange({ rotate: v })}
            options={([0, 90, 180, 270] as const).map(r => ({ value: r, label: `${r}°` }))} />)}
        </>
      )}

      {el.type === 'barcode' && (
        <>
          {row('数据', <Input size="small" value={el.data} onChange={e => onChange({ data: e.target.value })} placeholder="支持 {{字段}}" />)}
          {row('格式', <Select size="small" style={{ width: '100%' }} value={el.format || 'code128'} onChange={v => onChange({ format: v })}
            options={[{ value: 'code128', label: 'CODE128' }, { value: 'code39', label: 'CODE39' }, { value: 'ean13', label: 'EAN13' }, { value: 'ean8', label: 'EAN8' }]} />)}
          {row('高(mm)', <InputNumber size="small" style={{ width: '100%' }} min={1} max={100} value={el.height_mm || 10} onChange={v => onChange({ height_mm: Number(v) || 10 })} />)}
        </>
      )}

      {el.type === 'qrcode' && (
        <>
          {row('数据', <Input size="small" value={el.data} onChange={e => onChange({ data: e.target.value })} placeholder="支持 {{字段}}" />)}
          {row('倍率', <InputNumber size="small" style={{ width: '100%' }} min={1} max={10} value={el.cell || 4} onChange={v => onChange({ cell: Number(v) || 4 })} />)}
        </>
      )}

      {el.type === 'line' && (
        <>
          {row('长(mm)', <InputNumber size="small" style={{ width: '100%' }} min={1} max={300} value={el.width_mm || 20} onChange={v => onChange({ width_mm: Number(v) || 20 })} />)}
          {row('线宽', <InputNumber size="small" style={{ width: '100%' }} min={0.1} step={0.1} value={el.thickness_mm || 0.5} onChange={v => onChange({ thickness_mm: Number(v) || 0.5 })} />)}
        </>
      )}

      {el.type === 'rect' && (
        <>
          {row('宽(mm)', <InputNumber size="small" style={{ width: '100%' }} min={1} max={300} value={el.width_mm || 20} onChange={v => onChange({ width_mm: Number(v) || 20 })} />)}
          {row('高(mm)', <InputNumber size="small" style={{ width: '100%' }} min={1} max={300} value={el.height_mm || 10} onChange={v => onChange({ height_mm: Number(v) || 10 })} />)}
          {row('线宽', <InputNumber size="small" style={{ width: '100%' }} min={0.1} step={0.1} value={el.thickness_mm || 0.5} onChange={v => onChange({ thickness_mm: Number(v) || 0.5 })} />)}
        </>
      )}

      <Divider style={{ margin: '12px 0 10px' }} />
      <PrintConditionEditor cond={el.print_when} fields={fields} onChange={c => onChange({ print_when: c })} />

      <Button size="small" danger onClick={onRemove} style={{ marginTop: 12 }}>删除元素</Button>
    </div>
  )
}

// ── 打印条件编辑器 ────────────────────────────────────────────────────
// 按表单参数判定本元素是否参与打印。缺省（未启用）= 始终打印。
const COND_OPS: { value: PrintCondOp; label: string; needValue: boolean }[] = [
  { value: 'eq', label: '等于', needValue: true },
  { value: 'ne', label: '不等于', needValue: true },
  { value: 'gt', label: '大于', needValue: true },
  { value: 'gte', label: '大于等于', needValue: true },
  { value: 'lt', label: '小于', needValue: true },
  { value: 'lte', label: '小于等于', needValue: true },
  { value: 'contains', label: '包含', needValue: true },
  { value: 'len_eq', label: '长度等于', needValue: true },
  { value: 'len_gt', label: '长度大于', needValue: true },
  { value: 'len_lt', label: '长度小于', needValue: true },
  { value: 'not_empty', label: '非空', needValue: false },
  { value: 'empty', label: '为空', needValue: false },
]

function PrintConditionEditor({ cond, fields, onChange }: { cond?: PrintCondition; fields: any[]; onChange: (c: PrintCondition | undefined) => void }) {
  const enabled = !!cond
  const op = cond?.op || 'not_empty'
  const needValue = COND_OPS.find(o => o.value === op)?.needValue ?? true
  const fieldOpts = (fields || [])
    .filter((f: any) => f && f.field)
    .map((f: any) => ({ value: f.field as string, label: `${f.label || f.field}（${f.field}）` }))

  const toggle = (on: boolean) => {
    if (on) onChange({ field: cond?.field || (fieldOpts[0]?.value ?? ''), op: cond?.op || 'not_empty', value: cond?.value })
    else onChange(undefined)
  }
  const patch = (p: Partial<PrintCondition>) => onChange({ field: cond?.field || '', op: cond?.op || 'not_empty', value: cond?.value, ...p })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>打印条件</span>
        <Radio.Group size="small" value={enabled} onChange={e => toggle(e.target.value)}
          options={[{ label: '始终打印', value: false }, { label: '按条件', value: true }]} optionType="button" />
      </div>
      {enabled && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
          <div style={{ marginBottom: 8 }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={cond?.field || undefined}
              onChange={v => patch({ field: v })}
              placeholder="选择参数字段"
              showSearch
              optionFilterProp="label"
              options={fieldOpts}
              notFoundContent="无可用字段，可手动输入"
              dropdownRender={menu => (
                <>
                  {menu}
                  <Divider style={{ margin: '4px 0' }} />
                  <Input
                    size="small"
                    placeholder="或手动输入字段名"
                    style={{ margin: '0 4px 4px', width: 'calc(100% - 8px)' }}
                    onPressEnter={e => patch({ field: (e.target as HTMLInputElement).value.trim() })}
                  />
                </>
              )}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Select<PrintCondOp>
              size="small"
              style={{ width: needValue ? 110 : '100%' }}
              value={op}
              onChange={v => patch({ op: v })}
              options={COND_OPS.map(o => ({ value: o.value, label: o.label }))}
            />
            {needValue && (
              <Input size="small" style={{ flex: 1 }} value={cond?.value ?? ''} onChange={e => patch({ value: e.target.value })} placeholder="比较值" />
            )}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            条件成立时才打印此元素。数值类比较（大于/小于等）按数字解析，长度类按字符长度。
          </div>
        </div>
      )}
    </div>
  )
}

// ── 调试面板（内嵌）────────────────────────────────────────────────────
function DebugPanel({ tpl, fields }: { tpl: PrinterTemplate; fields: any[] }) {
  const [devices, setDevices] = useState<DeviceOpt[]>([])
  const [loadingDev, setLoadingDev] = useState(false)
  const [deviceId, setDeviceIdLocal] = useState<string>(tpl.debug_device_id || '')
  const [sample, setSampleLocal] = useState<Record<string, string>>(tpl.debug_sample || {})
  const [printing, setPrinting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const placeholders = useMemo(() => collectPlaceholders(tpl), [tpl])

  // 选择变更时回写到模板对象，让保存动作一并持久化
  const setDeviceId = (id: string) => {
    setDeviceIdLocal(id)
    if (id !== (tpl.debug_device_id || '')) {
      ;(tpl as any).debug_device_id = id || undefined
    }
  }
  const setSample = (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setSampleLocal(prev => {
      const val = typeof next === 'function' ? (next as any)(prev) : next
      ;(tpl as any).debug_sample = val
      return val
    })
  }

  const loadDevices = () => {
    setLoadingDev(true)
    authed('/api/devices', 'GET')
      .then(res => {
        const list: any[] = Array.isArray(res?.data) ? res.data : []
        const online = list.filter(d => d.agent_connected).map(d => ({ id: String(d.id), name: `${d.name || d.serial || d.id}` }))
        setDevices(online)
        // 优先恢复模板保存的目标设备；只有在模板未记录或设备已不在线时，才退回到列表第一项
        const savedId = tpl.debug_device_id
        if (savedId && online.some(d => d.id === savedId)) {
          setDeviceId(savedId)
        } else if (online.length && !deviceId) {
          setDeviceId(online[0].id)
        }
      })
      .catch(() => setDevices([]))
      .finally(() => setLoadingDev(false))
  }
  useEffect(loadDevices, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 占位符或字段变化时，补全样例数据初始化；优先保留用户已填值与模板已保存值
  useEffect(() => {
    setSample(prev => {
      let changed = false
      const next: Record<string, string> = {}
      placeholders.forEach(ph => {
        if (prev[ph] != null && prev[ph] !== '') {
          next[ph] = prev[ph]
        } else {
          const f = fields.find((x: any) => x.field === ph)
          next[ph] = f?.label ? `示例-${f.label}` : ph
          changed = true
        }
      })
      // 同步到模板对象，使保存时一并持久化
      ;(tpl as any).debug_sample = next
      return changed ? next : prev
    })
  }, [placeholders.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const doPrint = async () => {
    if (!deviceId) { message.warning('请选择目标设备'); return }
    setPrinting(true)
    setResult(null)
    try {
      const payload = buildPrintPayload(tpl, sample)
      const res = await authed('/api/form-app/print-debug', 'POST', {
        device_id: deviceId,
        protocol: payload.protocol,
        gen_side: payload.gen_side,
        layout_mode: payload.layout_mode,
        content: payload.content,
        elements: payload.elements,
        raw_base64: payload.raw_base64,
        paper: payload.paper,
      })
      const ok = !!res?.data?.success
      setResult({ ok, msg: res?.data?.output || (ok ? '打印成功' : '打印失败') })
      if (ok) message.success('已下发并打印')
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || '下发失败' })
      message.error(e?.message || '下发失败')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>设备调试</span>
        <Button size="small" type="link" onClick={loadDevices}>刷新设备</Button>
      </div>
      {loadingDev ? <Spin size="small" /> : (
        <Select
          style={{ width: '100%', marginBottom: 10 }}
          value={deviceId || undefined}
          onChange={setDeviceId}
          placeholder={devices.length ? '选择在线设备' : '暂无在线设备'}
          notFoundContent="暂无在线设备"
          options={devices.map(d => ({ label: d.name, value: d.id }))}
        />
      )}

      {placeholders.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>样例数据</div>
          {placeholders.map(ph => {
            const f = fields.find((x: any) => x.field === ph)
            return (
              <div key={ph} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <Tooltip title={`{{${ph}}}`}>
                  <span style={{ width: 90, fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f?.label || ph}</span>
                </Tooltip>
                <Input size="small" value={sample[ph] ?? ''} onChange={e => setSample(prev => ({ ...prev, [ph]: e.target.value }))} />
              </div>
            )
          })}
        </div>
      )}

      <Button type="primary" block loading={printing} disabled={!deviceId} onClick={doPrint}>下发打印</Button>

      {result && (
        <Alert
          style={{ marginTop: 10 }}
          type={result.ok ? 'success' : 'error'}
          message={result.ok ? '打印反馈' : '打印失败'}
          description={result.msg}
          showIcon
        />
      )}
    </div>
  )
}

// 收集模板中所有 {{字段}} 占位名（按当前 layout_mode）
function collectPlaceholders(tpl: PrinterTemplate): string[] {
  const set = new Set<string>()
  const scan = (s?: string) => {
    if (!s) return
    const re = /\{\{\s*([\w.]+)\s*\}\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) set.add(m[1])
  }
  const mode = tpl.layout_mode || 'flow'
  if (mode === 'raw') scan(tpl.raw_template)
  else if (mode === 'canvas') (tpl.elements || []).forEach(el => { scan(el.text); scan(el.data) })
  else (tpl.content || []).forEach((op: any) => { scan(op.text); scan(op.data) })
  return Array.from(set)
}
