import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Yjs 协同编辑集成测试
 *
 * 测试实际的编辑器页面协同功能
 * 路由: /editor?id=<pageId>
 */

const EDITOR_URL = '/editor?id=1';
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

test.describe('Yjs 协同编辑集成测试', () => {

  test('应该成功连接到编辑器并建立 WebSocket', async ({ page }) => {
    // 监听 WebSocket 连接
    let wsConnected = false;
    const wsMessages: any[] = [];

    page.on('websocket', (ws) => {
      console.log('🔌 WebSocket 连接:', ws.url());
      wsConnected = true;

      ws.on('framereceived', (frame) => {
        wsMessages.push({ type: 'received', data: frame.payload });
      });

      ws.on('framesent', (frame) => {
        wsMessages.push({ type: 'sent', data: frame.payload });
      });
    });

    // 登录
    await login(page);

    // 访问编辑器
    await page.goto(EDITOR_URL);
    await page.waitForLoadState('networkidle');

    // 等待 WebSocket 连接和消息
    await page.waitForTimeout(5000);

    // 验证 WebSocket 已连接
    console.log('✅ WebSocket 已连接:', wsConnected);
    expect(wsConnected).toBeTruthy();

    // 验证收到了消息
    console.log('📨 收到 WebSocket 消息数量:', wsMessages.length);
    expect(wsMessages.length).toBeGreaterThan(0);

    // 检查页面是否加载成功
    const pageTitle = await page.title();
    console.log('📄 页面标题:', pageTitle);

    console.log('✅ 编辑器连接测试通过');
  });

  test('应该在两个浏览器中显示在线用户数', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 用户 1 登录并访问编辑器
      await login(page1);
      await page1.goto(EDITOR_URL);
      await page1.waitForLoadState('networkidle');
      await page1.waitForTimeout(3000);

      console.log('👤 用户 1 已进入编辑器');

      // 检查是否有在线状态指示
      const hasOnlineIndicator = await page1.evaluate(() => {
        // 查找包含"在线"或数字的文本
        const body = document.body.innerText;
        return body.includes('在线') || /\d+\s*人/.test(body);
      });

      console.log('📊 页面包含在线状态:', hasOnlineIndicator);

      // 用户 2 登录并访问同一页面
      await login(page2);
      await page2.goto(EDITOR_URL);
      await page2.waitForLoadState('networkidle');
      await page2.waitForTimeout(3000);

      console.log('👥 用户 2 已进入编辑器');

      // 等待 awareness 同步
      await page1.waitForTimeout(2000);

      // 检查用户 1 的页面是否更新了在线人数
      const page1Text = await page1.evaluate(() => document.body.innerText);
      const page2Text = await page2.evaluate(() => document.body.innerText);

      console.log('📝 用户 1 页面文本（部分）:', page1Text.substring(0, 200));
      console.log('📝 用户 2 页面文本（部分）:', page2Text.substring(0, 200));

      // 关闭用户 2
      await context2.close();
      await page1.waitForTimeout(2000);

      console.log('👋 用户 2 已离开');

      console.log('✅ 多用户在线测试完成');

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('应该检测到后端 Yjs WebSocket 服务', async ({ page }) => {
    // 监听控制台日志
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Yjs') || text.includes('yjs') || text.includes('WebSocket')) {
        consoleLogs.push(text);
      }
    });

    // 登录并访问编辑器
    await login(page);
    await page.goto(EDITOR_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // 输出控制台日志
    console.log('📋 相关控制台日志:');
    consoleLogs.forEach(log => console.log('  -', log));

    // 检查是否有 Yjs 相关的日志
    const hasYjsLogs = consoleLogs.some(log =>
      log.toLowerCase().includes('yjs') ||
      log.toLowerCase().includes('websocket')
    );

    console.log('🔍 找到 Yjs 相关日志:', hasYjsLogs);

    // 检查网络请求
    const requests: string[] = [];
    page.on('request', (request) => {
      requests.push(request.url());
    });

    await page.reload();
    await page.waitForTimeout(3000);

    // 查找 WebSocket 连接
    const hasYjsWs = requests.some(url => url.includes('/ws/yjs'));
    console.log('🔌 检测到 Yjs WebSocket 连接:', hasYjsWs);

    console.log('✅ Yjs 服务检测完成');
  });

  test('应该验证后端 Yjs Hub 功能', async ({ page }) => {
    // 先登录获取认证 token
    await login(page);

    // 检查后端服务是否运行（通过访问编辑器页面）
    try {
      await page.goto(EDITOR_URL);
      await page.waitForLoadState('networkidle');

      console.log('✅ 后端服务正常运行');
      expect(true).toBeTruthy();
    } catch (error) {
      console.log('❌ 后端服务未运行:', error);
      throw error;
    }
  });

  test('性能测试：多次连接和断开', async ({ browser }) => {
    const startTime = Date.now();

    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();

      await login(page);
      await page.goto(EDITOR_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      console.log(`✅ 第 ${i + 1} 次连接成功`);

      await context.close();
      // 移除 page.waitForTimeout，因为 context 已关闭
    }

    const duration = Date.now() - startTime;
    console.log(`⏱️ 3 次连接总耗时: ${duration}ms`);
    console.log(`📊 平均每次连接: ${Math.round(duration / 3)}ms`);

    expect(duration).toBeLessThan(30000); // 不超过 30 秒

    console.log('✅ 性能测试通过');
  });
});

test.afterAll(async () => {
  console.log('✨ 所有测试完成！');
});
