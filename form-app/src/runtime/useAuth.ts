import { useCallback, useEffect, useState } from 'react'

export type AuthUser = {
  id: number
  username: string
  role: string
}

const TOKEN_KEY = 'token'
const USER_KEY = 'auth_user'

function readToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

function readUser(): AuthUser | null {
  try {
    const s = localStorage.getItem(USER_KEY)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

type AuthState = {
  token: string
  user: AuthUser | null
  loading: boolean
  error: string
}

// 模块级单例，避免多个 hook 实例状态不同步
let _listeners: Array<(s: AuthState) => void> = []
let _state: AuthState = {
  token: readToken(),
  user: readUser(),
  loading: false,
  error: '',
}

function setState(next: Partial<AuthState>) {
  _state = { ..._state, ...next }
  _listeners.forEach(fn => fn(_state))
}

export async function authLogin(
  serverBase: string,
  username: string,
  password: string,
): Promise<void> {
  setState({ loading: true, error: '' })
  try {
    const resp = await fetch(`${serverBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
    const token: string = data.token || ''
    const user: AuthUser = {
      id: data.user?.id,
      username: data.user?.username,
      role: data.user?.role,
    }
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    setState({ token, user, loading: false, error: '' })
  } catch (e: any) {
    setState({ loading: false, error: e.message || '登录失败' })
    throw e
  }
}

export function authLogout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  setState({ token: '', user: null, error: '' })
}

export function useAuth() {
  const [state, setLocalState] = useState<AuthState>(_state)

  useEffect(() => {
    const fn = (s: AuthState) => setLocalState({ ...s })
    _listeners.push(fn)
    return () => {
      _listeners = _listeners.filter(l => l !== fn)
    }
  }, [])

  const login = useCallback(
    (serverBase: string, username: string, password: string) =>
      authLogin(serverBase, username, password),
    [],
  )

  const logout = useCallback(() => authLogout(), [])

  return {
    token: state.token,
    user: state.user,
    isLoggedIn: !!state.token,
    loading: state.loading,
    error: state.error,
    login,
    logout,
  }
}
