import { test, expect } from '@playwright/test'
import { deleteApp, uniqueCode, authHeaders, cjkBtn } from './helpers'

/**
 * 用例组 B：创建向导（/create-wizard）
 * 覆盖：三步流程、必填校验、成功创建并跳转。
 * 向导 DOM 见 FormAppCreateWizard.tsx：Steps[基本信息/数据源/完成] + code/name 必填。
 */
test.describe('B. 创建向导', () => {
  let createdId = 0

  test.afterEach(async ({ request }) => {
    await deleteApp(request, createdId)
    createdId = 0
  })

  test('B1 基本信息必填校验：空编码无法下一步', async ({ page }) => {
    await page.goto('/form-app/create-wizard')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: cjkBtn('下一步') }).click()
    // 仍停留在第 1 步（antd Form 校验拦截）
    await expect(page.getByPlaceholder('my_app')).toBeVisible()
  })

  test('B2 完整走通三步并创建成功', async ({ page, request }) => {
    const code = uniqueCode('wiz')
    await page.goto('/form-app/create-wizard')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder('my_app').fill(code)
    await page.getByPlaceholder('我的应用').fill(`向导_${code}`)
    await page.getByRole('button', { name: cjkBtn('下一步') }).click()

    // 第 2 步：数据源可选，直接下一步
    await page.getByRole('button', { name: cjkBtn('下一步') }).click()

    // 第 3 步：完成
    await expect(page.getByText('点击完成创建应用')).toBeVisible()
    await page.getByRole('button', { name: cjkBtn('完成') }).click()
    await expect(page.getByText('创建成功')).toBeVisible()

    // 回查 API 拿 id 以便清理
    const list = await request.get('/api/form-app/infos', { headers: authHeaders() })
    const rows = (await list.json()).data || []
    createdId = rows.find((r: any) => r.code === code)?.id || 0
    expect(createdId).toBeGreaterThan(0)
  })

  test('B3 上一步可回退', async ({ page }) => {
    await page.goto('/form-app/create-wizard')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('my_app').fill(uniqueCode('back'))
    await page.getByPlaceholder('我的应用').fill('回退测试')
    await page.getByRole('button', { name: cjkBtn('下一步') }).click()
    await page.getByRole('button', { name: cjkBtn('上一步') }).click()
    await expect(page.getByPlaceholder('my_app')).toBeVisible()
  })
})
