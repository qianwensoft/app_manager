import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

// 接收来自主应用的 token（开发环境跨端口时通过 URL query 传递）
const params = new URLSearchParams(window.location.search)
const urlToken = params.get('_token')
if (urlToken) {
  localStorage.setItem('token', urlToken)
  params.delete('_token')
  const newSearch = params.toString()
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
  window.history.replaceState(null, '', newUrl)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
