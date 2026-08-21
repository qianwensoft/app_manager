import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '@/api/http'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const refreshToken = ref(localStorage.getItem('refresh_token') || '')
  const expiresAt = ref(parseInt(localStorage.getItem('expires_at') || '0'))
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAdmin = computed(() => user.value?.role === 'admin')
  const isOperator = computed(() => user.value?.role === 'admin' || user.value?.role === 'operator')
  const isViewer = computed(() => user.value?.role === 'viewer')

  const login = async (username, password) => {
    const res = await http.post('/auth/login', { username, password })
    token.value = res.token
    refreshToken.value = res.refresh_token
    expiresAt.value = res.expires_at
    user.value = res.user
    localStorage.setItem('token', token.value)
    localStorage.setItem('refresh_token', refreshToken.value)
    localStorage.setItem('expires_at', expiresAt.value.toString())
    localStorage.setItem('user', JSON.stringify(res.user))
  }

  const logout = () => {
    token.value = ''
    refreshToken.value = ''
    expiresAt.value = 0
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('expires_at')
    localStorage.removeItem('user')
  }

  const fetchMe = async () => {
    const res = await http.get('/auth/me')
    user.value = res.data
    localStorage.setItem('user', JSON.stringify(res.data))
  }

  const refreshAccessToken = async () => {
    if (!refreshToken.value) {
      throw new Error('No refresh token available')
    }
    const res = await http.post('/auth/refresh', { refresh_token: refreshToken.value })
    token.value = res.token
    refreshToken.value = res.refresh_token
    expiresAt.value = res.expires_at
    user.value = res.user
    localStorage.setItem('token', token.value)
    localStorage.setItem('refresh_token', refreshToken.value)
    localStorage.setItem('expires_at', expiresAt.value.toString())
    localStorage.setItem('user', JSON.stringify(res.user))
  }

  return { token, refreshToken, expiresAt, user, isAdmin, isOperator, isViewer, login, logout, fetchMe, refreshAccessToken }
})
