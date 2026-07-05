import React from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/antd.css'
import App from './App'
import './styles.css'

// Polyfill for Android 9 - ResizeObserver required by Radix UI
import ResizeObserverPolyfill from 'resize-observer-polyfill'

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  (window as any).ResizeObserver = ResizeObserverPolyfill
}

// 过滤 Ant Design 4.x 的 defaultProps 和 Menu children 警告（React 18 兼容性问题）
// 这些警告不影响功能，Ant Design 5.x 已修复
if (import.meta.env.DEV) {
  const originalError = console.error
  const originalWarn = console.warn

  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Support for defaultProps will be removed')
    ) {
      return
    }
    originalError.call(console, ...args)
  }

  console.warn = (...args: any[]) => {
    const message = typeof args[0] === 'string' ? args[0] : ''
    if (
      message.includes('[antd: Menu] `children` will be removed') ||
      message.includes('[antd: Table] `index` parameter of `rowKey`') ||
      message.includes('Warning: <%s /> is using incorrect casing') ||
      message.includes('React Router Future Flag Warning')
    ) {
      return
    }
    originalWarn.call(console, ...args)
  }
}

const params = new URLSearchParams(window.location.search)
const urlToken = params.get('_token')
if (urlToken) {
  localStorage.setItem('token', urlToken)
  params.delete('_token')
  const newSearch = params.toString()
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
  window.history.replaceState(null, '', newUrl)
}

// React 18: 使用 createRoot 替代 ReactDOM.render
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    // StrictMode 在开发模式会双重挂载组件，与 Designable Shadow DOM 冲突
    // 生产构建时 StrictMode 无影响，仅在开发时禁用
    import.meta.env.DEV ? <App /> : <React.StrictMode><App /></React.StrictMode>
  )
}
