/**
 * 设计器「预览」浮层：用所见即所得方式展示当前画布 schema 在指定终端（桌面 antd /
 * 移动 antd-mobile）下的渲染效果，复用运行时 SchemaFormRenderer + 组件库适配层。
 *
 * 折叠态为右下角小按钮；展开后用对应 libraryKey 渲染。移动端用窄容器模拟手机视口。
 *
 * 扫码模拟：当页面配置了 scan 事件源时，顶部出现一行「扫码模拟」工具条（输入框 +
 * 类型选择 + 触发按钮），点触发即向 eventManager 发对应类型事件，与真机扫码同路径，
 * 完整跑通页面事件动作链（填字段 / 提示 / 语音 / 设属性 / 跳页 / 打印 / 调用接口）。
 */
import { useMemo, useState } from 'react'
import { Button, Input, Select, message } from 'antd'
import SchemaFormRenderer from '../runtime/SchemaFormRenderer'
import type { LibraryKey } from '../runtime/componentLibraries'
import type { PageEvent } from '../runtime/eventTypes'
import type { ScannerConfig } from './PageEditorPage'
import { eventManager } from '../runtime/EventHandler'

type ScanType = 'barcode' | 'qrcode' | 'nfc'

interface PreviewPaneProps {
  end: 'desktop' | 'mobile'
  /** 取当前画布 schema（{ form, schema }）；返回 null 表示解析失败 */
  getSchema: () => any
  /** 页面级事件配置（含 scan 事件源时启用扫码模拟） */
  events?: PageEvent[]
  /** 兼容旧扫码配置 */
  scannerConfig?: ScannerConfig
  /** 真实接口调用（call_interface 动作用）；失败由父组件降级处理 */
  onScanInterface?: (
    interfaceCode: string,
    paramValues: Record<string, any>,
    type?: 'internal' | 'third_party' | 'connector',
    endpointId?: number,
  ) => Promise<any>
}

export default function PreviewPane({ end, getSchema, events, scannerConfig, onScanInterface }: PreviewPaneProps) {
  const [open, setOpen] = useState(false)
  const [schema, setSchema] = useState<any>(null)
  const [scanValue, setScanValue] = useState('')
  const [scanType, setScanType] = useState<ScanType>('barcode')
  const libraryKey: LibraryKey = end === 'mobile' ? 'antd-mobile' : 'antd'

  // 是否存在可模拟的扫码事件源
  const hasScanEvent = useMemo(
    () => (events?.some(e => e.source?.kind === 'scan') ?? false) || !!scannerConfig?.enabled,
    [events, scannerConfig],
  )

  const refresh = () => setSchema(getSchema())
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) refresh()
  }

  const triggerScan = () => {
    const v = scanValue.trim()
    if (!v) { message.warning('请输入扫码值'); return }
    eventManager.emit(scanType, v)
    message.success(`已触发扫码（${scanType}）：${v}`)
  }

  if (!open) {
    return (
      <Button
        type="primary"
        size="small"
        onClick={toggle}
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
      >
        预览（{end === 'mobile' ? '移动' : '桌面'}）
      </Button>
    )
  }

  const isMobile = end === 'mobile'
  const panelWidth = isMobile ? 380 : 520

  return (
    <div
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 1000,
        width: panelWidth, maxWidth: '92vw',
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
        maxHeight: '80vh',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>预览 · {isMobile ? '移动 / H5' : '桌面'}</span>
        <span>
          <Button size="small" onClick={refresh} style={{ marginRight: 8 }}>刷新</Button>
          <Button size="small" onClick={toggle}>收起</Button>
        </span>
      </div>
      {hasScanEvent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
          <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>扫码模拟</span>
          <Select<ScanType> size="small" value={scanType} onChange={setScanType} style={{ width: 92 }}>
            <Select.Option value="barcode">条码</Select.Option>
            <Select.Option value="qrcode">二维码</Select.Option>
            <Select.Option value="nfc">NFC</Select.Option>
          </Select>
          <Input
            size="small"
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
            onPressEnter={triggerScan}
            placeholder="输入扫码值，回车或点触发"
            style={{ flex: 1 }}
          />
          <Button size="small" type="primary" onClick={triggerScan}>触发</Button>
        </div>
      )}
      <div style={{ overflow: 'auto', padding: isMobile ? 12 : 0, background: isMobile ? '#f5f6fa' : '#fff' }}>
        <div
          style={isMobile
            ? { width: 340, margin: '0 auto', background: '#fff', borderRadius: 8, minHeight: 480, overflow: 'hidden' }
            : { width: '100%' }}
        >
          {schema ? (
            <SchemaFormRenderer
              key={libraryKey}
              designSchema={schema}
              libraryKey={libraryKey}
              initialValues={{}}
              events={events}
              scannerConfig={scannerConfig}
              onScanInterface={onScanInterface}
              onNavigate={(pageKey) => message.info(`预览：跳转到页面「${pageKey}」（预览中不实际跳页）`)}
              onSubmit={async () => { /* 预览不提交 */ }}
            />
          ) : (
            <div style={{ padding: 24, color: '#999', fontSize: 13 }}>暂无可预览的布局，请先在画布添加组件。</div>
          )}
        </div>
      </div>
    </div>
  )
}
