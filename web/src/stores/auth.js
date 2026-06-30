import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '@/api/http'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAdmin = computed(() => user.value?.role === 'admin')
  const isOperator = computed(() => user.value?.role === 'admin' || user.value?.role === 'operator')
  const isViewer = computed(() => user.value?.role === 'viewer')

  const login = async (username, password) => {
    const res = await http.post('/auth/login', { username, password })
    token.value = res.token
    user.value = res.user
    localStorage.setItem('token', token.value)
    localStorage.setItem('user', JSON.stringify(res.user))
  }

  const logout = () => {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const fetchMe = async () => {
    const res = await http.get('/auth/me')
    user.value = res.data
    localStorage.setItem('user', JSON.stringify(res.data))
  }

  return { token, user, isAdmin, isOperator, isViewer, login, logout, fetchMe }
})
