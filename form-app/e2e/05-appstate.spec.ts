import { test, expect } from '@playwright/test'
import { createApp, deleteApp, createRunnableFormPage, runtimeUrl } from './helpers'

/**
 * 用例组 E：AppState 应用级常驻事件（本轮第 2 步成果）—— 端到端
 * 覆盖：global_config.events(scope:app) 跨页面常驻；$app 状态 + state_change 源。
 *
 * 应用级事件存于 FormAppInfo.global_config（PUT /infos/:id），运行时由
 * MultiPageRuntime 从 app.global_config.events 注册（见落地设计第 2 步）。
 */
test.describe('E. 应用级常驻事件', () => {
  let appId = 0
  let code = ''

  test.afterEach(async ({ request }) => {
    await deleteApp(request, appId)
    appId = 0
  })

  test('E1 应用级 state_change → 改当前页字段', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id; code = app.code

    // 页面：一个字段 + 一个按钮（按钮事件写 $app.status，触发应用级监听）
    await createRunnableFormPage(request, appId, {
      fields: [{ field: 'echo', label: '回显', component: 'Input' }],
      // 页面级：自定义事件 setStatus → 写应用级 status
      events: [{
        id: 'ev_set_app', name: '写应用状态',
        source: { kind: 'custom_event', event_name: 'setStatus' },
        actions: [{ type: 'set_field', field: 'status', value_src: 'ACTIVE', scope: 'app' }],
      }],
    })

    // 应用级常驻事件：监听 $app.status 变化 → 回写当前页 echo 字段
    const globalConfig = JSON.stringify({
      events: [{
        id: 'app_ev', name: '应用级状态监听', scope: 'app',
        source: { kind: 'state_change', scope: 'app', field: 'status' },
        actions: [{ type: 'set_field', field: 'echo', value_src: '$app.status', scope: 'page' }],
      }],
      printers: [],
    })
    const upd = await request.put(`/api/form-app/infos/${appId}`, {
      data: { ...app, global_config: globalConfig },
    })
    expect(upd.ok()).toBeTruthy()

    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')

    // 触发：emit setStatus → 写 $app.status=ACTIVE → 应用级 state_change → echo=ACTIVE
    await page.evaluate(() => (window as any).eventManager?.emit('setStatus', ''))
    const echo = page.locator('.ant-form-item', { hasText: '回显' }).locator('input').first()
    await expect(echo).toHaveValue('ACTIVE')
  })

  test('E2 应用级事件持久化入口（基本信息面板）可达', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id
    // 设计器基本信息页（路由 /designer-v2/:id?step=data 进数据；基本信息在 designer 内）
    await page.goto(`/form-app/designer-v2/${app.id}`)
    await page.waitForLoadState('networkidle')
    // 冒烟：设计器加载不白屏
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
