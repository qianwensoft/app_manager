/**
 * 触发源编辑器：配置工作流的触发源（含 Agent 扫码）。
 */
import { useState, useEffect } from 'react'
import type { WorkflowSource } from '@/types/workflow'
import type { CanvasElement } from '@/types'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import http from '@/api/http'

interface Props {
  source: WorkflowSource
  onChange: (s: WorkflowSource) => void
  elements: CanvasElement[]
}

interface Device {
  id: number
  name: string
  serial: string
}

const KIND_LABELS: Record<WorkflowSource['kind'], string> = {
  point_change: '点位/数据变化',
  condition: '条件边沿(false→true)',
  component: '组件 UI 事件',
  timer: '定时器',
  canvas_enter: '画布进入',
  canvas_exit: '画布退出',
  custom_event: '自定义事件',
  context_change: '上下文变量变化',
  agent_scan: 'Agent 扫码触发',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }
const rowStyle: React.CSSProperties = { marginBottom: 10 }

function defaultForKind(kind: WorkflowSource['kind']): WorkflowSource {
  switch (kind) {
    case 'point_change': return { kind, pointKey: '' }
    case 'condition': return { kind, expr: '' }
    case 'component': return { kind, elementId: '', event: 'click' }
    case 'timer': return { kind, delay: 1000 }
    case 'canvas_enter': return { kind }
    case 'canvas_exit': return { kind }
    case 'custom_event': return { kind, eventName: '' }
    case 'context_change': return { kind, scope: 'global', key: '' }
    case 'agent_scan': return { kind, scanType: 'any' }
  }
}

export default function SourceEditor({ source, onChange, elements }: Props) {
  const kind = source.kind
  const [devices, setDevices] = useState<Device[]>([])

  useEffect(() => {
    if (source.kind === 'agent_scan') {
      http.get<{ data: Device[] }>('/devices').then((res: any) => {
        setDevices(res.data || [])
      }).catch(() => setDevices([]))
    }
  }, [source.kind])

  return (
    <div>
      <div style={rowStyle}>
        <label style={labelStyle}>触发源类型</label>
        <Select value={kind} onChange={(e) => onChange(defaultForKind(e.target.value as WorkflowSource['kind']))}>
          {(Object.keys(KIND_LABELS) as WorkflowSource['kind'][]).map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </Select>
      </div>

      {source.kind === 'point_change' && (
        <div style={rowStyle}>
          <label style={labelStyle}>点位键 (pointKey)</label>
          <Input value={source.pointKey} onChange={(e) => onChange({ ...source, pointKey: e.target.value })} placeholder="如 temp01 或 iface.field" />
        </div>
      )}

      {source.kind === 'condition' && (
        <div style={rowStyle}>
          <label style={labelStyle}>条件表达式</label>
          <Input value={source.expr} onChange={(e) => onChange({ ...source, expr: e.target.value })} placeholder="$point.temp01 > 80" />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>格式：左值 运算符 右值，支持 $point./$global./$workflow.</div>
        </div>
      )}

      {source.kind === 'component' && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>元素</label>
            <Select value={source.elementId} onChange={(e) => onChange({ ...source, elementId: e.target.value })}>
              <option value="">（选择元素）</option>
              {elements.map((el) => (
                <option key={el.id} value={el.id}>{el.name || el.type}（{el.id.slice(0, 6)}）</option>
              ))}
            </Select>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>事件</label>
            <Select value={source.event} onChange={(e) => onChange({ ...source, event: e.target.value as 'click' | 'dblclick' | 'hover' })}>
              <option value="click">单击 click</option>
              <option value="dblclick">双击 dblclick</option>
              <option value="hover">悬停 hover</option>
            </Select>
          </div>
        </>
      )}

      {source.kind === 'timer' && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>初始延迟 (ms)</label>
            <Input type="number" value={source.delay} onChange={(e) => onChange({ ...source, delay: Number(e.target.value) })} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>循环间隔 (ms，留空=只执行一次)</label>
            <Input type="number" value={source.interval ?? ''} onChange={(e) => onChange({ ...source, interval: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>重复次数 (留空=无限)</label>
            <Input type="number" value={source.repeat ?? ''} onChange={(e) => onChange({ ...source, repeat: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
        </>
      )}

      {source.kind === 'custom_event' && (
        <div style={rowStyle}>
          <label style={labelStyle}>事件名</label>
          <Input value={source.eventName} onChange={(e) => onChange({ ...source, eventName: e.target.value })} placeholder="alarm-raised" />
        </div>
      )}

      {source.kind === 'context_change' && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>作用域</label>
            <Select value={source.scope} onChange={(e) => onChange({ ...source, scope: e.target.value as 'global' | 'workflow' })}>
              <option value="global">global（跨画布）</option>
              <option value="workflow">workflow（单次执行）</option>
            </Select>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>变量 key</label>
            <Input value={source.key} onChange={(e) => onChange({ ...source, key: e.target.value })} placeholder="alarmCount" />
          </div>
        </>
      )}

      {(source.kind === 'canvas_enter' || source.kind === 'canvas_exit') && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>画布{source.kind === 'canvas_enter' ? '进入' : '退出'}时触发，无需额外配置。</div>
      )}

      {source.kind === 'agent_scan' && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>设备（留空=监听所有设备）</label>
            <Select value={source.deviceId ?? ''} onChange={(e) => onChange({ ...source, deviceId: e.target.value === '' ? undefined : Number(e.target.value) })}>
              <option value="">（所有设备）</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name || d.serial}（{d.id}）</option>
              ))}
            </Select>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>扫码类型</label>
            <Select value={source.scanType ?? 'any'} onChange={(e) => onChange({ ...source, scanType: e.target.value as 'qrcode' | 'barcode' | 'nfc' | 'any' })}>
              <option value="any">任意类型</option>
              <option value="qrcode">二维码 QR Code</option>
              <option value="barcode">条码 Barcode</option>
              <option value="nfc">NFC</option>
            </Select>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -6 }}>
            扫码值通过 $event.value 访问，设备 ID 通过 $event.device_id 访问
          </div>
        </>
      )}
    </div>
  )
}