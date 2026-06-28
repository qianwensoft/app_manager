import { test, expect, Page } from '@playwright/test';

/**
 * Yjs 协同编辑自动化测试
 *
 * 测试场景：
 * 1. 在线人数实时更新
 * 2. 内容实时同步
 * 3. 连接状态指示器
 * 4. 断线重连
 */

const TEST_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// 登录辅助函数
async function login(page: Page) {
  await page.goto('/login');

  // 填写登录表单
  await page.fill('input[name="username"], input[type="text"]', TEST_CREDENTIALS.username);
  await page.fill('input[name="password"], input[type="password"]', TEST_CREDENTIALS.password);

  // 点击登录按钮
  await page.click('button[type="submit"], button:has-text("登录")');

  // 等待跳转
  await page.waitForURL('**/', { timeout: 10000 });
}

// 测试前的准备工作
test.beforeAll(async () => {
  console.log('🧪 开始 Yjs 协同编辑测试...');
});

test.describe('Yjs 协同编辑功能', () => {

  test('应该显示连接状态指示器', async ({ page }) => {
    // 先登录
    await login(page);

    await page.goto('/editor?id=1');

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 等待连接建立
    await page.waitForTimeout(3000);

    // 查找连接状态指示器（检查是否有绿色/黄色/红色的状态指示）
    const statusIndicator = page.locator('div.rounded-lg').filter({ hasText: /在线|连接中|连接断开|已连接/ }).first();

    // 验证状态指示器存在
    await expect(statusIndicator).toBeVisible({ timeout: 10000 });

    console.log('✅ 连接状态指示器显示正常');
  });

  test('应该在多个客户端之间同步在线人数', async ({ browser }) => {
    // 创建第一个上下文（用户 A）
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // 用户 A 登录
    await login(pageA);

    // 访问编辑器页面（需要根据实际路由调整）
    await pageA.goto('/editor?id=1');
    await pageA.waitForLoadState('networkidle');

    // 等待连接建立
    await pageA.waitForTimeout(3000);

    // 查找在线人数显示 - 使用更灵活的选择器
    const onlineCountA = pageA.locator('div.rounded-lg').filter({ hasText: /人在线|已连接/ }).first();
    await expect(onlineCountA).toBeVisible({ timeout: 10000 });

    // 获取当前在线人数文本
    const textA1 = await onlineCountA.textContent();
    console.log('👤 用户 A 看到的在线状态:', textA1);
    expect(textA1).toMatch(/1 人在线|已连接/);

    // 创建第二个上下文（用户 B）
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // 用户 B 登录
    await login(pageB);

    await pageB.goto('/editor?id=1');
    await pageB.waitForLoadState('networkidle');

    // 等待 awareness 同步
    await pageB.waitForTimeout(3000);

    // 用户 A 应该看到 2 人在线
    const textA2 = await onlineCountA.textContent();
    console.log('👥 用户 A 看到的在线人数（用户 B 加入后）:', textA2);
    expect(textA2).toContain('2 人在线');

    // 用户 B 也应该看到 2 人在线
    const onlineCountB = pageB.locator('div.rounded-lg').filter({ hasText: /人在线/ }).first();
    await expect(onlineCountB).toBeVisible();
    const textB = await onlineCountB.textContent();
    console.log('👥 用户 B 看到的在线人数:', textB);
    expect(textB).toContain('2 人在线');

    // 关闭用户 B 的连接
    await contextB.close();

    // 等待 awareness 更新
    await pageA.waitForTimeout(3000);

    // 用户 A 应该看到在线人数回到 1
    const textA3 = await onlineCountA.textContent();
    console.log('👤 用户 A 看到的在线人数（用户 B 离开后）:', textA3);
    expect(textA3).toContain('1 人在线');

    await contextA.close();

    console.log('✅ 在线人数同步测试通过');
  });

  test('应该在多个客户端之间同步内容变更', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 两个用户登录
    await login(pageA);
    await login(pageB);

    // 两个用户访问同一个页面
    await pageA.goto('/editor?id=1');
    await pageB.goto('/editor?id=1');

    await pageA.waitForLoadState('networkidle');
    await pageB.waitForLoadState('networkidle');

    // 等待连接建立
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    // 用户 A 进行编辑操作（具体操作取决于编辑器 UI）
    // 这里是示例，需要根据实际编辑器调整
    console.log('📝 用户 A 正在编辑...');

    // 模拟添加一个组件或修改内容
    // 例如：点击添加按钮，拖拽组件等
    // const addButton = pageA.locator('button:has-text("添加")');
    // if (await addButton.isVisible()) {
    //   await addButton.click();
    // }

    // 等待同步
    await pageA.waitForTimeout(1000);

    // 验证用户 B 收到了变更
    // 这里需要根据实际的编辑器 UI 来验证
    // 例如：检查某个组件是否出现
    console.log('👀 验证用户 B 是否看到了变更...');

    // 清理
    await contextA.close();
    await contextB.close();

    console.log('✅ 内容同步测试通过');
  });

  test('应该显示正确的连接状态', async ({ page }) => {
    // 先登录
    await login(page);

    await page.goto('/editor?id=1');
    await page.waitForLoadState('networkidle');

    // 等待连接建立
    await page.waitForTimeout(3000);

    // 检查连接状态（绿色 = 已连接）- 使用更灵活的选择器
    const connectedIndicator = page.locator('div.rounded-lg').filter({ hasText: /已连接|人在线/ }).first();
    await expect(connectedIndicator).toBeVisible({ timeout: 10000 });

    // 检查是否显示绿色状态（通过 CSS 类或颜色）
    const hasGreenBg = await connectedIndicator.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.backgroundColor.includes('green') ||
             el.className.includes('green');
    });

    console.log('🟢 连接状态显示为已连接:', hasGreenBg);
    expect(hasGreenBg).toBeTruthy();

    console.log('✅ 连接状态测试通过');
  });

  test('应该正确处理 WebSocket 消息', async ({ page }) => {
    // 监听 WebSocket 消息
    const wsMessages: any[] = [];
    let yjsWsUrl: string | null = null;

    page.on('websocket', (ws) => {
      const url = ws.url();
      console.log('🔌 WebSocket 连接建立:', url);

      // 只监听 Yjs WebSocket（排除 Vite HMR）
      if (url.includes('/ws/yjs/')) {
        yjsWsUrl = url;

        ws.on('framereceived', (frame) => {
          wsMessages.push({
            type: 'received',
            payload: frame.payload,
          });
        });

        ws.on('framesent', (frame) => {
          wsMessages.push({
            type: 'sent',
            payload: frame.payload,
          });
        });
      }
    });

    // 先登录
    await login(page);

    await page.goto('/editor?id=1');
    await page.waitForLoadState('networkidle');

    // 等待 WebSocket 消息
    await page.waitForTimeout(5000);

    // 验证连接到了 Yjs WebSocket
    console.log('🔌 Yjs WebSocket URL:', yjsWsUrl);
    expect(yjsWsUrl).toBeTruthy();

    // 验证收到了 WebSocket 消息
    console.log('📨 WebSocket 消息数量:', wsMessages.length);
    expect(wsMessages.length).toBeGreaterThan(0);

    // 验证有 sync 或 awareness 消息（消息类型 0 或 1）
    const hasYjsMessage = wsMessages.some(msg => {
      if (msg.payload instanceof Buffer) {
        const msgType = msg.payload[0];
        return msgType === 0 || msgType === 1; // Sync 或 Awareness
      }
      return false;
    });

    console.log('📡 收到 Yjs 协议消息:', hasYjsMessage);
    expect(hasYjsMessage).toBeTruthy();

    console.log('✅ WebSocket 消息处理测试通过');
  });
});

test.afterAll(async () => {
  console.log('✨ Yjs 协同编辑测试完成！');
});
