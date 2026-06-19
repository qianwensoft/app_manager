import { test, expect } from '@playwright/test'
import { createApp, deleteApp, gotoForms, uniqueCode, FORMS_URL } from './helpers'

/**
 * 用例组 A：表单应用列表页（/form-app/forms）
 * 覆盖：加载、搜索、创建向导入口、行内操作（运行/编辑/删除）、删除二次确认。
 */
test.describe('A. 表单列表页', () => {
  let appId = 0

  test.afterEach(async ({ request }) => {
    await deleteApp(request, appId)
    appId = 0
  })

  test('A1 列表页加载且展示标题与创建入口', async ({ page }) => {
    await gotoForms(page)
    await expect(page).toHaveURL(/\/form-app\/forms/)
    await expect(page.getByText('创建向导')).toBeVisible()
    await expect(page.getByPlaceholder(/搜索应用/)).toBeVisible()
  })

  test('A2 新建应用后出现在列表', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id
    await gotoForms(page)
    await expect(page.getByText(app.name)).toBeVisible()
    await expect(page.getByText(app.code)).toBeVisible()
  })

  test('A3 搜索按名称过滤', async ({ page, request }) => {
    const app = await createApp(request, { name: `搜索目标_${uniqueCode()}` })
    appId = app.id
    await gotoForms(page)
    await page.getByPlaceholder(/搜索应用/).fill(app.name)
    await expect(page.getByText(app.name)).toBeVisible()
    // 不匹配的关键词应过滤掉
    await page.getByPlaceholder(/搜索应用/).fill('不存在的关键词zzz999')
    await expect(page.getByText(app.name)).toHaveCount(0)
  })

  test('A4 删除走二次确认弹窗', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id
    await gotoForms(page)
    const row = page.locator('*', { hasText: app.code }).filter({ has: page.getByText('删除') }).last()
    await page.getByText('删除', { exact: false }).first().click()
    // 确认弹窗出现
    await expect(page.getByText('确认删除')).toBeVisible()
    await expect(page.getByText(/此操作无法撤销/)).toBeVisible()
    await page.getByRole('button', { name: '确认删除' }).click()
    await expect(page.getByText('应用已删除')).toBeVisible()
    appId = 0 // 已删除，afterEach 不必再删
  })

  test('A5 创建向导入口可达', async ({ page }) => {
    await gotoForms(page)
    await page.getByText('创建向导').click()
    await expect(page).toHaveURL(/\/create-wizard/)
    await expect(page.getByText('基本信息')).toBeVisible()
  })
})
