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

  const handleConnect = async () => {
    setLoading(true)
    setError(null)

    try {
      await connectSerialScanner()
      setConnected(true)
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

  // 不支持 Web Serial API，不显示按钮
  if (!supported) {
    return null
  }

  if (variant === 'icon-only') {
    return (
      <button
        onClick={connected ? handleDisconnect : handleConnect}
        disabled={loading}
        className={`p-2 rounded hover:bg-gray-100 transition ${className}`}
        title={connected ? '断开串口扫码枪' : '连接串口扫码枪'}
      >
        {loading ? (
          <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : connected ? (
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        onClick={connected ? handleDisconnect : handleConnect}
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
      {error && <span className="text-xs text-red-600 px-1">{error}</span>}
    </div>
  )
}
