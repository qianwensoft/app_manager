/**
 * 串口扫码枪连接按钮
 * 
 * 用于桌面浏览器（Chrome/Edge），通过 Web Serial API 连接 USB 串口扫码枪。
 * 显示连接状态，支持连接/断开操作。
 * 
 * 使用位置：
 * - SCADA 编辑器顶部工具栏（EditorHeader）
 * - SCADA 预览页面（PreviewPage / SharePage）
 */

import { useState, useEffect } from 'react'
import {
  connectSerialScanner,
  disconnectGlobalScanner,
  isSerialSupported,
  isSerialConnected,
  getAuthorizedPorts,
  connectWithAuthorizedPort,
} from '@/runtime/serialScanner'

interface Props {
  /** 按钮样式变体 */
  variant?: 'default' | 'icon-only'
  /** 自定义类名 */
  className?: string
}

export default function SerialScannerButton({ variant = 'default', className = '' }: Props) {
  const [supported, setSupported] = useState(false)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [authorizedPorts, setAuthorizedPorts] = useState<SerialPort[]>([])

  // 检测浏览器支持
  useEffect(() => {
    setSupported(isSerialSupported())
  }, [])

  // 轮询连接状态（因为可能被其他代码断开）
  useEffect(() => {
    if (!supported) return

    const timer = setInterval(() => {
      setConnected(isSerialConnected())
    }, 1000)

    return () => clearInterval(timer)
  }, [supported])

  // 加载已授权的串口列表
  useEffect(() => {
    if (!supported || !showMenu) return
    
    const loadPorts = async () => {
      try {
        const ports = await getAuthorizedPorts()
        setAuthorizedPorts(ports)
      } catch (e) {
        console.error('Failed to load authorized ports:', e)
      }
    }
    
    loadPorts()
  }, [supported, showMenu])

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.serial-scanner-menu-container')) {
        setShowMenu(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showMenu])

  const handleConnectWithPort = async (port: SerialPort) => {
    setLoading(true)
    setError(null)
    setShowMenu(false)

    try {
      await connectWithAuthorizedPort(port)
      setConnected(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : '连接失败'
      setError(message)
      console.error('Serial scanner connect failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleConnectNew = async () => {
    setLoading(true)
    setError(null)
    setShowMenu(false)

    try {
      await connectSerialScanner()
      setConnected(true)
      // 重新加载串口列表
      const ports = await getAuthorizedPorts()
      setAuthorizedPorts(ports)
    } catch (e) {
      const message = e instanceof Error ? e.message : '连接失败'
      setError(message)
      console.error('Serial scanner connect failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    setError(null)

    try {
      await disconnectGlobalScanner()
      setConnected(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : '断开失败'
      setError(message)
      console.error('Serial scanner disconnect failed:', e)
    } finally {
      setLoading(false)
    }
  }

  // 不支持 Web Serial API 时显示禁用按钮
  if (!supported) {
    return (
      <div style={{ position: 'relative' }} className="serial-scanner-menu-container">
        <button
          disabled
          title="当前浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: variant === 'icon-only' ? 28 : 'auto',
            height: 28,
            padding: variant === 'icon-only' ? 0 : '0 12px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--text-disabled)',
            cursor: 'not-allowed',
            opacity: 0.4,
            fontSize: 12,
            gap: 8,
          }}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          {variant === 'default' && <span>串口不可用</span>}
        </button>
      </div>
    )
  }

  if (variant === 'icon-only') {
    return (
      <div style={{ position: 'relative' }} className="serial-scanner-menu-container">
        <button
          onClick={() => {
            if (connected) {
              handleDisconnect()
            } else {
              setShowMenu(!showMenu)
            }
          }}
          disabled={loading}
          title={connected ? '断开串口扫码枪' : '连接串口扫码枪'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: connected ? 'var(--success)' : 'var(--text-muted)',
            cursor: loading ? 'default' : 'pointer',
            transition: 'all var(--duration-fast)',
            opacity: loading ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = 'var(--bg-elevated)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {loading ? (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </svg>
          ) : connected ? (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          ) : (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </button>

        {/* 串口选择菜单 */}
        {showMenu && !connected && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              minWidth: 200,
              maxHeight: 300,
              overflowY: 'auto',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
            }}
          >
            {authorizedPorts.length > 0 && (
              <div style={{ padding: '4px 0' }}>
                <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                  已授权串口
                </div>
                {authorizedPorts.map((port, idx) => {
                  const info = port.getInfo()
                  const label = info.usbVendorId 
                    ? `USB (${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)})`
                    : `串口 ${idx + 1}`
                  return (
                    <button
                      key={idx}
                      onClick={() => handleConnectWithPort(port)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'background var(--duration-fast)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8}>
                        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {label}
                    </button>
                  )
                })}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              </div>
            )}
            <button
              onClick={handleConnectNew}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                fontSize: 12,
                color: 'var(--accent)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background var(--duration-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M12 4v16M4 12h16" />
              </svg>
              添加新串口
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${className} serial-scanner-menu-container`} style={{ position: 'relative' }}>
      <button
        onClick={() => {
          if (connected) {
            handleDisconnect()
          } else {
            setShowMenu(!showMenu)
          }
        }}
        disabled={loading}
        className={`px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2 ${
          connected
            ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{connected ? '断开中...' : '连接中...'}</span>
          </>
        ) : connected ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>串口已连接</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>连接扫码枪</span>
          </>
        )}
      </button>

      {/* 串口选择菜单 */}
      {showMenu && !connected && (
        <div
          className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]"
          style={{ maxHeight: '300px', overflowY: 'auto' }}
        >
          {authorizedPorts.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-xs text-gray-500 font-medium">已授权串口</div>
              {authorizedPorts.map((port, idx) => {
                const info = port.getInfo()
                const label = info.usbVendorId 
                  ? `USB (${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)})`
                  : `串口 ${idx + 1}`
                return (
                  <button
                    key={idx}
                    onClick={() => handleConnectWithPort(port)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {label}
                  </button>
                )
              })}
              <div className="border-t border-gray-100"></div>
            </div>
          )}
          <button
            onClick={handleConnectNew}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加新串口
          </button>
        </div>
      )}

      {error && <span className="text-xs text-red-600 px-1">{error}</span>}
    </div>
  )
}
