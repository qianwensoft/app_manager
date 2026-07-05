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
import { useMemo, useState, useEffect } from 'react'
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
  /** 页面入参 schema（用于生成参数输入框） */
  paramSchema?: string
  /** 页面配置的接口编码（用于刷新时加载数据） */
  interfaceCode?: string
  /** 表单应用代码（用于接口调用） */
  formCode?: string
  /** 页面 key（用于接口调用） */
  pageKey?: string
  /** 页面类型（form | list | detail | custom） */
  pageType?: string
}

export default function PreviewPane({ end, getSchema, events, scannerConfig, onScanInterface, paramSchema, interfaceCode, formCode, pageKey, pageType }: PreviewPaneProps) {
  const [open, setOpen] = useState(false)
  const [schema, setSchema] = useState<any>(null)
  const [scanValue, setScanValue] = useState('')
  const [scanType, setScanType] = useState<ScanType>('barcode')
  const [urlParams, setUrlParams] = useState<Record<string, any>>({})
  const [initialValues, setInitialValues] = useState<Record<string, any>>({})
  const [loadingData, setLoadingData] = useState(false)
  // 拖拽状态 - 使用 left/top 定位，初始位置在右下角
  const [position, setPosition] = useState<{ left?: number; top?: number; right?: number; bottom?: number }>({
    right: 16,
    bottom: 16
  })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, startLeft: 0, startTop: 0 })
  // 统一使用 shadcn（响应式）
  const libraryKey: LibraryKey = 'shadcn'

  // 解析页面参数配置
  const pageParams = useMemo(() => {
    if (!paramSchema) return []
    try {
      const parsed = JSON.parse(paramSchema)
      return Object.entries(parsed).map(([name, def]: [string, any]) => ({
        name,
        type: def?.type || 'string',
        description: def?.description || '',
        required: !!def?.required,
      }))
    } catch {
      return []
    }
  }, [paramSchema])

  // 是否存在可模拟的扫码事件源
  const hasScanEvent = useMemo(
    () => (events?.some(e => e.source?.kind === 'scan') ?? false) || !!scannerConfig?.enabled,
    [events, scannerConfig],
  )

  // 自动刷新：预览打开时，每隔一段时间自动获取最新 schema
  useEffect(() => {
    if (!open) return

    // 初始加载
    refresh()

    // 定时刷新（每 500ms 检查一次 schema 变化）
    const timer = setInterval(() => {
      const currentSchema = getSchema()
      // 简单对比：将 schema 序列化后比较
      const currentStr = JSON.stringify(currentSchema)
      const prevStr = JSON.stringify(schema)
      if (currentStr !== prevStr) {
        setSchema(currentSchema)
      }
    }, 500)

    return () => clearInterval(timer)
  }, [open]) // 只依赖 open，避免频繁重建定时器

  const refresh = async () => {
    const currentSchema = getSchema()
    setSchema(currentSchema)
    // form/custom 类型页面用于输入，预览时不加载数据
    if (pageType === 'form' || pageType === 'custom') {
      setInitialValues({})
      return
    }
    // list/detail 类型需要加载数据进行预览
    if (interfaceCode && onScanInterface) {
      setLoadingData(true)
      try {
        // list 类型需要添加分页参数
        const params = pageType === 'list'
          ? { ...urlParams, page: 1, page_size: 10 }
          : urlParams
        const result = await onScanInterface(interfaceCode, params)
        if (result && typeof result === 'object') {
          // list 类型返回的可能是 {rows: [...], total: 100} 或直接 [...]
          const data = Array.isArray(result) ? result : (result.rows || result.data || [])
          // ArrayCards/ArrayTable 需要将数据放在对应字段下（动态检测字段名）
          if (pageType === 'list') {
            // 查找 ArrayCards/ArrayTable 的字段名
            let arrayFieldName = 'table' // 默认 table
            if (currentSchema?.schema?.properties) {
              for (const [fieldName, fieldSchema] of Object.entries(currentSchema.schema.properties)) {
                const comp = (fieldSchema as any)?.['x-component']
                if (comp === 'ArrayCards' || comp === 'ArrayTable') {
                  arrayFieldName = fieldName
                  break
                }
              }
            }
            setInitialValues({ [arrayFieldName]: data })
            console.log('[PreviewPane] list 数据已加载:', { arrayFieldName, count: data.length, initialValues: { [arrayFieldName]: data } })
          } else {
            setInitialValues(result)
          }
          message.success('数据已加载')
        }
      } catch (e: any) {
        console.error('[PreviewPane] 加载失败:', e)
        message.error(`加载数据失败：${e?.message || '未知错误'}`)
      } finally {
        setLoadingData(false)
      }
    } else {
      setInitialValues({})
    }
  }

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

  // 拖拽处理
  const handleMouseDown = (e: React.MouseEvent) => {
    // 只在标题栏区域触发拖拽，排除按钮点击
    const target = e.target as HTMLElement
    if (target.closest('button')) return

    e.preventDefault()
    setDragging(true)

    // 获取当前面板的实际位置
    const panel = (e.currentTarget as HTMLElement).parentElement
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    })

    // 切换到 left/top 定位
    setPosition({
      left: rect.left,
      top: rect.top,
    })
  }

  // 使用 useEffect 管理全局事件监听
  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y

      const newLeft = dragStart.startLeft + deltaX
      const newTop = dragStart.startTop + deltaY

      // 限制在视口内
      const maxLeft = window.innerWidth - 100
      const maxTop = window.innerHeight - 50

      setPosition({
        left: Math.max(0, Math.min(newLeft, maxLeft)),
        top: Math.max(0, Math.min(newTop, maxTop)),
      })
    }

    const handleMouseUp = () => {
      setDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, dragStart])

  if (!open) {
    return (
      <Button
        type="primary"
        size="small"
        onClick={toggle}
        style={{
          position: 'fixed',
          ...(position.left !== undefined ? { left: `${position.left}px` } : { right: `${position.right}px` }),
          ...(position.top !== undefined ? { top: `${position.top}px` } : { bottom: `${position.bottom}px` }),
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
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
        position: 'fixed',
        ...(position.left !== undefined ? { left: `${position.left}px` } : { right: `${position.right}px` }),
        ...(position.top !== undefined ? { top: `${position.top}px` } : { bottom: `${position.bottom}px` }),
        zIndex: 1000,
        width: panelWidth, maxWidth: '92vw',
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
        maxHeight: '80vh',
      }}
    >
      <div
        className="preview-drag-handle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #f0f0f0',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
      >
        <span style={{ fontSize: 13, fontWeight: 600, pointerEvents: 'none' }}>
          预览 · {isMobile ? '移动 / H5' : '桌面'}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={refresh} loading={loadingData}>刷新</Button>
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
      {pageParams.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#f8f9fa' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600 }}>页面参数（预览用）</div>
          {pageParams.map(param => (
            <div key={param.name} style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#666', marginBottom: 2 }}>
                {param.name}{param.required && <span style={{ color: '#ff4d4f' }}>*</span>}
                {param.description && <span style={{ marginLeft: 4, color: '#999' }}>({param.description})</span>}
              </label>
              <Input
                size="small"
                value={urlParams[param.name] || ''}
                onChange={e => setUrlParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                placeholder={`输入 ${param.name}`}
              />
            </div>
          ))}
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
              key={`${libraryKey}-${JSON.stringify(initialValues)}`}
              designSchema={schema}
              libraryKey={libraryKey}
              initialValues={initialValues}
              urlParams={urlParams}
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
