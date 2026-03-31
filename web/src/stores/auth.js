import { defineStore } from 'pinia'
import { ref } from 'vue'
import http from '@/api/http'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(null)

  const login = async (username, password) => {
    const res = await http.post('/auth/login', { username, password })
    token.value = res.token
    user.value = res.user
    localStorage.setItem('token', token.value)
  }

  const logout = () => {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
  }

  const fetchMe = async () => {
    const res = await http.get('/auth/me')
    user.value = res.data
  }

  return { token, user, login, logout, fetchMe }
})
