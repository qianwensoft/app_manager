import { test as setup, expect, request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 全局登录态准备：直接打 POST /api/auth/login 拿 token，
 * 写入 storageState 的 localStorage.token（form-app 各页从此读取，见 runtimeAuth.ts / console/api.ts）。
 * 避免每条用例都走登录 UI（form-app 自身无登录页，登录态由外壳注入）。
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://192.168.1.136:3000'
const USERNAME = process.env.E2E_USERNAME || 'admin'
const PASSWORD = process.env.E2E_PASSWORD || 'admin123'

const AUTH_DIR = path.join('e2e', '.auth')
const STATE_PATH = path.join(AUTH_DIR, 'state.json')

setup('登录并写入 storageState', async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL })
  const resp = await ctx.post('/api/auth/login', {
    data: { username: USERNAME, password: PASSWORD },
  })
  expect(resp.ok(), `登录失败：HTTP ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  expect(body.token, '登录响应缺少 token').toBeTruthy()
  const token: string = body.token

  fs.mkdirSync(AUTH_DIR, { recursive: true })

  // 持久化裸 token，供 API 测试夹具（request）附带 Authorization 头使用
  fs.writeFileSync(path.join(AUTH_DIR, 'token.txt'), token)

  // 构造 storageState：把 token 注入 form-app 源（origin）的 localStorage
  const origin = new URL(BASE_URL).origin
  const state = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: 'token', value: token }],
      },
    ],
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  await ctx.dispose()
})
