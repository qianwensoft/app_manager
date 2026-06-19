import { defineConfig, devices } from '@playwright/test'

/**
 * form-app 全功能 E2E 配置。
 *
 * 目标环境通过环境变量注入（默认指向测试机 192.168.1.136:3000）：
 *   E2E_BASE_URL   被测站点根，默认 http://192.168.1.136:3000
 *   E2E_USERNAME   登录用户名，默认 admin
 *   E2E_PASSWORD   登录密码，默认 admin123
 *
 * 跑法：
 *   cd form-app && npm i -D @playwright/test && npx playwright install chromium
 *   E2E_BASE_URL=http://192.168.1.136:3000 npx playwright test
 *
 * 说明：本套用例以仓库代码为事实依据编写（路由 /form-app/*、登录
 * POST /api/auth/login→{token}→localStorage.token、运行时 /form-app/runtime/:code）。
 * 由于本机无法访问该内网环境，需在能连通的机器上运行。
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://192.168.1.136:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/state.json',
      },
    },
  ],
})
