import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000
})

http.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  res => res.data,
  err => {
    if (
      err.response?.status === 401 &&
      window.location.pathname !== '/login' &&
      !window.location.pathname.startsWith('/share/')
    ) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    } else if (err.response?.status !== 401) {
      ElMessage.error(err.response?.data?.error || '请求失败')
    }
    return Promise.reject(err)
  }
)

export default http
