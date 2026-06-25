import { test, expect } from '@playwright/test'
import { createApp, deleteApp, createRunnableFormPage, runtimeUrl, fieldInput } from './helpers'

/**
 * 用例组 D：事件系统（本轮改造重点）—— 运行时行为
 * 覆盖：field_change 源 → set_field 动作；scan 源 → 填字段；自定义事件总线 emit。
 *
 * 触发手段：window.eventManager.emit(type, data)（EventHandler.ts:38 已挂 window），
 * 与真机扫码同路径，确定性强、无需真实扫码硬件。
 */
test.describe('D. 事件系统运行时', () => {
  let appId = 0
  let code = ''

  test.afterEach(async ({ request }) => {
    await deleteApp(request, appId)
    appId = 0
  })

  test('D1 field_change 源驱动 set_field（页面内联动）', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id; code = app.code
    await createRunnableFormPage(request, appId, {
      fields: [
        { field: 'src', label: '来源', component: 'Input' },
        { field: 'mirror', label: '镜像', component: 'Input' },
      ],
      events: [{
        id: 'ev_fc', name: 'mirror',
        source: { kind: 'field_change', field: 'src' },
        actions: [{ type: 'set_field', field: 'mirror', value_src: '$form.src' }],
      }],
      showDefaultSubmit: true,
    })
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')

    const srcInput = fieldInput(page, '来源')
    await srcInput.fill('HELLO')
    await srcInput.blur()
    const mirrorInput = fieldInput(page, '镜像')
    await expect(mirrorInput).toHaveValue('HELLO')
  })

  test('D2 scan 源 → set_field 填入扫码值', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id; code = app.code
    await createRunnableFormPage(request, appId, {
      fields: [{ field: 'barcode', label: '条码', component: 'Input' }],
      events: [{
        id: 'ev_scan', name: '扫码填入',
        source: { kind: 'scan', scan_type: 'any' },
        actions: [{ type: 'set_field', field: 'barcode', value_src: '$scan' }],
      }],
    })
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    const input = fieldInput(page, '条码')
    await expect(input).toBeVisible() // 确保字段已渲染、事件监听已注册再触发
    // 经事件总线模拟一次条码扫描
    await page.evaluate(() => (window as any).eventManager?.emit('barcode', 'CODE-9527'))
    await expect(input).toHaveValue('CODE-9527')
  })

  test('D3 scan + 条件 when：不满足则不触发', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id; code = app.code
    await createRunnableFormPage(request, appId, {
      fields: [{ field: 'barcode', label: '条码', component: 'Input' }],
      events: [{
        id: 'ev_cond', name: '仅 ABC 前缀',
        source: { kind: 'scan', scan_type: 'any' },
        when: { left_src: '$scan', operator: 'eq', value: 'YES' },
        actions: [{ type: 'set_field', field: 'barcode', value_src: '$scan' }],
      }],
    })
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    const input = fieldInput(page, '条码')
    await expect(input).toBeVisible()
    // 条件不满足 → 不应填入
    await page.evaluate(() => (window as any).eventManager?.emit('barcode', 'NO'))
    await expect(input).toHaveValue('')
    // 条件满足 → 填入
    await page.evaluate(() => (window as any).eventManager?.emit('barcode', 'YES'))
    await expect(input).toHaveValue('YES')
  })

  test('D4 自定义事件链：emit A → A 改字段', async ({ page, request }) => {
    const app = await createApp(request)
    appId = app.id; code = app.code
    await createRunnableFormPage(request, appId, {
      fields: [{ field: 'flag', label: '标记', component: 'Input' }],
      events: [{
        id: 'ev_custom', name: '自定义事件 ping',
        source: { kind: 'custom_event', event_name: 'ping' },
        actions: [{ type: 'set_field', field: 'flag', value_src: 'PONG' }],
      }],
    })
    await page.goto(runtimeUrl(code))
    await page.waitForLoadState('networkidle')
    const input = fieldInput(page, '标记')
    await expect(input).toBeVisible()
    await page.evaluate(() => (window as any).eventManager?.emit('ping', ''))
    await expect(input).toHaveValue('PONG')
  })
})
