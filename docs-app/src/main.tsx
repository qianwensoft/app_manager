import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/docs-app">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
