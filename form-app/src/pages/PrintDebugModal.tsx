/**
 * 打印模板远程调试：选择在线设备 → 用样例数据渲染模板 payload → 下发到设备实打印。
 * 服务端 POST /api/form-app/print-debug 把 payload 经 Agent WS（action=print）下发并等待结果。
 */
import { useEffect, useMemo, useState } from 'react'
import { Modal, Select, Input, Button, message, Spin, Alert } from 'antd'
import type { FieldDef } from '@/runtime/types'
import type { PrinterTemplate } from '@/runtime/printerTypes'
import { buildPrintPayload } from '@/runtime/printBridge'
import { authed } from '@/console/api'

type DeviceOpt = { id: string; name: string }

export default function PrintDebugModal({
  open,
  template,
  fields,
  onClose,
}: {
  open: boolean
  template: PrinterTemplate | null
  fields: FieldDef[]
  onClose: () => void
}) {
  const [devices, setDevices] = useState<DeviceOpt[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [sample, setSample] = useState<Record<string, string>>({})
  const [printing, setPrinting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // 模板里引用到的占位字段（{{xxx}}），供填写样例数据
  const placeholders = useMemo(() => collectPlaceholders(template), [template])

  useEffect(() => {
    if (!open) return
    setResult(null)
    setLoadingDevices(true)
    authed('/api/devices', 'GET')
      .then(res => {
        const list: any[] = Array.isArray(res?.data) ? res.data : []
        // 仅展示 Agent 在线的设备
        const online = list
          .filter(d => d.agent_connected)
          .map(d => ({ id: String(d.id), name: `${d.name || d.serial || d.id}` }))
        setDevices(online)
        if (online.length && !deviceId) setDeviceId(online[0].id)
      })
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 初始化样例数据：用字段 label 占位
  useEffect(() => {
    if (!open) return
    const init: Record<string, string> = {}
    placeholders.forEach(ph => {
      const f = fields.find(x => x.field === ph)
      init[ph] = sample[ph] ?? (f?.label ? `示例-${f.label}` : ph)
    })
    setSample(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placeholders.join(',')])

  const doPrint = async () => {
    if (!template) return
    if (!deviceId) { message.warning('请选择目标设备'); return }
    setPrinting(true)
    setResult(null)
    try {
      const payload = buildPrintPayload(template, sample)
      const res = await authed('/api/form-app/print-debug', 'POST', {
        device_id: deviceId,
        protocol: payload.protocol,
        gen_side: payload.gen_side,
        content: payload.content,
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
    <Modal
      title={`调试打印：${template?.name || ''}`}
      visible={open}
      onCancel={onClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose}>关闭</Button>,
        <Button key="print" type="primary" loading={printing} disabled={!deviceId} onClick={doPrint}>
          下发打印
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>目标设备（仅在线 Agent）</div>
        {loadingDevices ? <Spin size="small" /> : (
          <Select
            style={{ width: '100%' }}
            value={deviceId || undefined}
            onChange={setDeviceId}
            placeholder={devices.length ? '选择设备' : '暂无在线设备'}
            notFoundContent="暂无在线设备"
            options={devices.map(d => ({ label: d.name, value: d.id }))}
          />
        )}
      </div>

      {template?.paper?.type === 'label' && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
          标签纸：{template.paper.width_mm} × {template.paper.height_mm} mm（间距 {template.paper.gap_mm ?? 2} mm）
        </div>
      )}

      {placeholders.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>样例数据（用于渲染 {'{{占位}}'}）</div>
          {placeholders.map(ph => {
            const f = fields.find(x => x.field === ph)
            return (
              <div key={ph} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 140, fontSize: 12, color: '#475569' }}>
                  {f?.label || ph} <code style={{ color: '#94a3b8' }}>{`{{${ph}}}`}</code>
                </span>
                <Input
                  size="small"
                  value={sample[ph] ?? ''}
                  onChange={e => setSample(prev => ({ ...prev, [ph]: e.target.value }))}
                />
              </div>
            )
          })}
        </div>
      )}

      {result && (
        <Alert
          type={result.ok ? 'success' : 'error'}
          message={result.ok ? '打印反馈' : '打印失败'}
          description={result.msg}
          showIcon
        />
      )}
    </Modal>
  )
}

// 收集模板中所有 {{字段}} 占位名（去重）
function collectPlaceholders(tpl: PrinterTemplate | null): string[] {
  if (!tpl) return []
  const set = new Set<string>()
  const scan = (s?: string) => {
    if (!s) return
    const re = /\{\{\s*([\w.]+)\s*\}\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) set.add(m[1])
  }
  if ((tpl.gen_side || 'agent') === 'frontend') {
    scan(tpl.raw_template)
  } else {
    (tpl.content || []).forEach((op: any) => { scan(op.text); scan(op.data) })
  }
  return Array.from(set)
}
