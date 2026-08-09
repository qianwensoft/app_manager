/**
 * 串口扫码枪浮动面板
 *
 * 桌面浏览器（Chrome/Edge 89+）通过 Web Serial API 连接 USB/RS232 串口扫码枪。
 * 自包含悬浮组件：右下角浮标，点击展开配置（波特率）+ 连接/断开操作。
 * 不支持 Web Serial API 的浏览器（Firefox/Safari）自动隐藏。
 *
 * 事件流：串口扫码枪 → Web Serial → serialScanner → window.scadaEventBus
 *   → useWorkflowRuntime → 触发 agent_scan 工作流（device_id = 'web-serial'）
 *
 * 使用位置：PreviewPage / SharePage（预览与免登分享页）。
 */

import { useState, useEffect, useCallback } from 'react'
import {
  initGlobalScanner,
  disconnectGlobalScanner,
  isSerialSupported,
  isSerialConnected,
  getAuthorizedPorts,
  connectWithAuthorizedPort,
} from '@/runtime/serialScanner'

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const

export default function SerialScannerPanel() {
  const [supported] = useState(() => isSerialSupported())
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [baudRate, setBaudRate] = useState<number>(9600)
  const [lastScan, setLastScan] = useState<string>('')
  const [authorizedPorts, setAuthorizedPorts] = useState<SerialPort[]>([])
  const [selectedPortIndex, setSelectedPortIndex] = useState<number>(-1)

  // 轮询连接状态（可能被外部代码断开）
  useEffect(() => {
    if (!supported) return
    const timer = setInterval(() => setConnected(isSerialConnected()), 1000)
    return () => clearInterval(timer)
  }, [supported])

  // 加载已授权的串口列表
  useEffect(() => {
    if (!supported || !open) return
    
    const loadPorts = async () => {
      try {
        const ports = await getAuthorizedPorts()
        setAuthorizedPorts(ports)
        if (ports.length > 0 && selectedPortIndex === -1) {
          setSelectedPortIndex(0)
        }
      } catch (e) {
        console.error('Failed to load authorized ports:', e)
      }
    }
    
    loadPorts()
  }, [supported, open, selectedPortIndex])

  const handleConnect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (selectedPortIndex >= 0 && authorizedPorts[selectedPortIndex]) {
        // 使用已选择的授权串口
        await connectWithAuthorizedPort(
          authorizedPorts[selectedPortIndex],
          { baudRate },
          (data) => setLastScan(data)
        )
      } else {
        // 请求新串口
        await initGlobalScanner({ baudRate }, (data) => setLastScan(data))
        // 重新加载串口列表
        const ports = await getAuthorizedPorts()
        setAuthorizedPorts(ports)
      }
      setConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败')
    } finally {
      setLoading(false)
    }
  }, [baudRate, selectedPortIndex, authorizedPorts])

  const handleDisconnect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await disconnectGlobalScanner()
      setConnected(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '断开失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 断开时的资源清理（组件卸载）
  useEffect(() => {
    return () => {
      if (isSerialConnected()) void disconnectGlobalScanner()
    }
  }, [])

  if (!supported) return null

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, fontFamily: 'var(--font-sans, sans-serif)' }}>
      {open && (
        <div
          style={{
            marginBottom: 8,
            width: 280,
            background: 'var(--bg-panel, #1e1e2e)',
            border: '1px solid var(--border, #3a3a4a)',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            color: 'var(--text-primary, #e0e0e0)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>串口扫码枪</div>

          {/* 已授权串口选择 */}
          {authorizedPorts.length > 0 && (
            <>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #999)', marginBottom: 4 }}>
                已授权串口
              </label>
              <select
                value={selectedPortIndex}
                onChange={(e) => setSelectedPortIndex(Number(e.target.value))}
                disabled={connected || loading}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 11,
                  marginBottom: 8,
                  background: 'var(--bg-surface, #2a2a3a)',
                  color: 'var(--text-primary, #e0e0e0)',
                  border: '1px solid var(--border, #3a3a4a)',
                  borderRadius: 4,
                }}
              >
                <option value={-1}>+ 添加新串口</option>
                {authorizedPorts.map((port, idx) => {
                  const info = port.getInfo()
                  const label = info.usbVendorId 
                    ? `USB (${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)})`
                    : `串口 ${idx + 1}`
                  return (
                    <option key={idx} value={idx}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </>
          )}

          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #999)', marginBottom: 4 }}>
            波特率
          </label>
          <select
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={connected || loading}
            style={{
              width: '100%',
              padding: '4px 6px',
              fontSize: 12,
              marginBottom: 10,
              background: 'var(--bg-surface, #2a2a3a)',
              color: 'var(--text-primary, #e0e0e0)',
              border: '1px solid var(--border, #3a3a4a)',
              borderRadius: 4,
            }}
          >
            {BAUD_RATES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <button
            onClick={connected ? handleDisconnect : handleConnect}
            disabled={loading}
            style={{
              width: '100%',
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              background: connected ? 'rgba(34,197,94,0.15)' : 'var(--accent, #4a9eff)',
              color: connected ? '#4ade80' : '#fff',
            }}
          >
            {loading ? '处理中…' : connected ? '断开连接' : (selectedPortIndex === -1 ? '添加串口' : '连接扫码枪')}
          </button>

          {error && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#f87171' }}>{error}</div>
          )}
          {lastScan && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted, #999)', wordBreak: 'break-all' }}>
              最近扫码：{lastScan}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title="串口扫码枪"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid var(--border, #3a3a4a)',
          background: connected ? 'rgba(34,197,94,0.2)' : 'var(--bg-panel, #1e1e2e)',
          color: connected ? '#4ade80' : 'var(--text-muted, #999)',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  )
}
