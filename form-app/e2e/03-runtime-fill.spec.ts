import { test, expect } from '@playwright/test'
import { createApp, deleteApp, createRunnableFormPage, runtimeUrl } from './helpers'

/**
 * 用例组 C：运行时填报（/form-app/runtime/:code）—— 终端用户主链路
 * 覆盖：表单渲染、必填校验拦截、填写、提交成功。
 * 字段由 field_definitions 即时生成（label→title，required→x-validator）。
 */
test.describe('C. 运行时填报', () => {
  let appId = 0
  let code = ''

  test.beforeEach(async ({ request }) => {
    const app = await createApp(request)
    appId = app.id
    code = app.code
    await createRunnableFormPage(request, appId, {
      fields: [
        { field: 'name', label: '姓名', component: 'Input', required: true },
        { field: 'qty', label: '数量', component: 'Input' },
      ],
      showDefaultSubmit: true,
    })
  })

  test.afterEach(async ({ request }) => {
    await deleteApp(request, appId)
    appId = 0
  })

  test('C1 运行时渲染出字段与提交按钮', async ({ page }) => {
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('姓名')).toBeVisible()
    await expect(page.getByText('数量')).toBeVisible()
    await expect(page.getByRole('button', { name: '提交' })).toBeVisible()
  })

  test('C2 必填为空时提交被校验拦截', async ({ page }) => {
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '提交' }).click()
    await expect(page.getByText('此项为必填')).toBeVisible()
  })

  test('C3 填写必填后提交成功', async ({ page }) => {
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    // Formily antd Input：定位到「姓名」FormItem 下的输入框
    const nameItem = page.locator('.ant-form-item', { hasText: '姓名' })
    await nameItem.locator('input').first().fill('张三')
    const submitResp = page.waitForResponse(r => /\/api\/form-app\/.*\/submit/.test(r.url()))
    await page.getByRole('button', { name: '提交' }).click()
    const resp = await submitResp
    expect(resp.status(), `提交接口返回 ${resp.status()}`).toBeLessThan(400)
  })

  test('C4 不存在的 code 给出可感知的空/错状态', async ({ page }) => {
    await page.goto(runtimeUrl('nonexistent_code_zzz999'))
    await page.waitForLoadState('networkidle')
    // 不崩白屏即可：页面有内容或提示
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
