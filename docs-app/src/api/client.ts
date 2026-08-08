import axios from 'axios'

// axios 实例：注入 JWT（localStorage.token），401 时回主应用登录。
export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err?.response?.status === 401) {
      // 回主应用登录页（docs-app 无独立登录）
      window.location.href = '/'
    }
    return Promise.reject(err)
  },
)

export function getToken(): string {
  return localStorage.getItem('token') || ''
}
