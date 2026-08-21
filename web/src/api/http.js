import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000
})

let isRefreshing = false
let refreshSubscribers = []

function onRefreshed(newToken) {
  refreshSubscribers.forEach(callback => callback(newToken))
  refreshSubscribers = []
}

function addRefreshSubscriber(callback) {
  refreshSubscribers.push(callback)
}

http.interceptors.request.use(async config => {
  const token = localStorage.getItem('token')
  const expiresAt = parseInt(localStorage.getItem('expires_at') || '0')
  const refreshToken = localStorage.getItem('refresh_token')
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    
    // 如果 token 将在 5 分钟内过期且有 refresh_token，自动刷新
    const now = Math.floor(Date.now() / 1000)
    if (refreshToken && expiresAt > 0 && expiresAt - now < 300 && !isRefreshing) {
      isRefreshing = true
      try {
        const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        const newToken = res.data.token
        const newRefreshToken = res.data.refresh_token
        const newExpiresAt = res.data.expires_at
        localStorage.setItem('token', newToken)
        localStorage.setItem('refresh_token', newRefreshToken)
        localStorage.setItem('expires_at', newExpiresAt.toString())
        localStorage.setItem('user', JSON.stringify(res.data.user))
        config.headers.Authorization = `Bearer ${newToken}`
        onRefreshed(newToken)
      } catch (error) {
        console.error('Token refresh failed:', error)
        // 刷新失败时清理并跳转登录
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('expires_at')
        localStorage.removeItem('user')
        if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/share/')) {
          window.location.href = '/login'
        }
      } finally {
        isRefreshing = false
      }
    }
  }
  return config
})

http.interceptors.response.use(
  res => res.data,
  async err => {
    const originalRequest = err.config
    
    // 处理 401 错误：尝试刷新 token
    if (err.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refresh_token')
      
      if (refreshToken && !isRefreshing) {
        originalRequest._retry = true
        
        if (!isRefreshing) {
          isRefreshing = true
          try {
            const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
            const newToken = res.data.token
            const newRefreshToken = res.data.refresh_token
            const newExpiresAt = res.data.expires_at
            localStorage.setItem('token', newToken)
            localStorage.setItem('refresh_token', newRefreshToken)
            localStorage.setItem('expires_at', newExpiresAt.toString())
            localStorage.setItem('user', JSON.stringify(res.data.user))
            
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            onRefreshed(newToken)
            return http(originalRequest)
          } catch (refreshError) {
            // 刷新失败，清理并跳转登录
            localStorage.removeItem('token')
            localStorage.removeItem('refresh_token')
            localStorage.removeItem('expires_at')
            localStorage.removeItem('user')
            if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/share/')) {
              window.location.href = '/login'
            }
            return Promise.reject(refreshError)
          } finally {
            isRefreshing = false
          }
        } else {
          // 正在刷新中，等待刷新完成后重试
          return new Promise(resolve => {
            addRefreshSubscriber(newToken => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              resolve(http(originalRequest))
            })
          })
        }
      } else if (
        window.location.pathname !== '/login' &&
        !window.location.pathname.startsWith('/share/')
      ) {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('expires_at')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    } else if (err.response?.status !== 401) {
      ElMessage.error(err.response?.data?.error || '请求失败')
    }
    return Promise.reject(err)
  }
)

export default http
