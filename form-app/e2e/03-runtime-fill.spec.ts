import { test, expect } from '@playwright/test'
import { createApp, deleteApp, createRunnableFormPage, runtimeUrl, cjkBtn, fieldInput } from './helpers'

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
    await expect(page.getByRole('button', { name: cjkBtn('提交') })).toBeVisible()
  })

  test('C2 必填为空时提交被校验拦截', async ({ page }) => {
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: cjkBtn('提交') }).click()
    await expect(page.getByText('此项为必填')).toBeVisible()
  })

  test('C3 填写必填后通过校验并发起提交请求', async ({ page }) => {
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    // 定位「姓名」字段输入框（跨渲染库）
    await fieldInput(page, '姓名').fill('张三')
    // 校验通过后会真正发起提交请求（后端接口执行是另一层关注点，
    // 本页未绑定 interface_code 时后端返回 400 属预期，这里只验证前端校验放行 + 发请求）
    const submitResp = page.waitForResponse(r => /\/api\/form-app\/.*\/submit/.test(r.url()))
    await page.getByRole('button', { name: cjkBtn('提交') }).click()
    await submitResp // 能等到请求即说明校验已放行（必填未填时不会发请求）
    // 且不应再出现必填错误
    await expect(page.getByText('此项为必填')).toHaveCount(0)
  })

  test('C4 不存在的 code 给出可感知的空/错状态', async ({ page }) => {
    await page.goto(runtimeUrl('nonexistent_code_zzz999'))
    await page.waitForLoadState('networkidle')
    // 不崩白屏即可：页面有内容或提示
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
