import { defineConfig } from 'vitest/config'

/**
 * 单元测试配置（vitest）。
 * 排除 e2e/（那是 Playwright 端到端用例，由 playwright test 运行，不归 vitest）。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
