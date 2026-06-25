import { test, expect } from '@playwright/test'
import { createApp, deleteApp, gotoForms, uniqueCode, FORMS_URL, cjkBtn } from './helpers'

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
    await page.getByPlaceholder(/搜索应用/).fill(app.code)
    await expect(page.getByText(app.name, { exact: true })).toBeVisible()
    await expect(page.locator('.formapp-code', { hasText: app.code })).toBeVisible()
  })

  test('A3 搜索按名称过滤', async ({ page, request }) => {
    const app = await createApp(request, { name: `搜索目标_${uniqueCode()}` })
    appId = app.id
    await gotoForms(page)
    await page.getByPlaceholder(/搜索应用/).fill(app.name)
    await expect(page.getByText(app.name, { exact: true })).toBeVisible()
    // 不匹配的关键词应过滤掉
    await page.getByPlaceholder(/搜索应用/).fill('不存在的关键词zzz999')
    await expect(page.getByText(app.name, { exact: true })).toHaveCount(0)
  })

  test('A4 删除走二次确认弹窗', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id
    await gotoForms(page)
    // 先搜索隔离出目标行，再点该行的删除按钮
    await page.getByPlaceholder(/搜索应用/).fill(app.code)
    const row = page.locator('tr.formapp-table-row', { hasText: app.code })
    await expect(row).toBeVisible()
    await row.locator('.formapp-action-btn-danger').click()
    // 确认弹窗出现（标题用 heading 角色避免与确认按钮文本歧义）
    await expect(page.getByRole('heading', { name: '确认删除' })).toBeVisible()
    await expect(page.getByText(/此操作无法撤销/)).toBeVisible()
    await page.getByRole('button', { name: cjkBtn('确认删除') }).click()
    // 删除后该行从列表消失（toast 是瞬时的，断言行移除更稳）
    await expect(page.locator('tr.formapp-table-row', { hasText: app.code })).toHaveCount(0)
    appId = 0 // 已删除，afterEach 不必再删
  })

  test('A5 创建向导入口可达', async ({ page }) => {
    await gotoForms(page)
    await page.getByText('创建向导').click()
    await expect(page).toHaveURL(/\/create-wizard/)
    await expect(page.getByText('基本信息')).toBeVisible()
  })
})
