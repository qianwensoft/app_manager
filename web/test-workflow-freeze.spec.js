const { test, expect } = require('@playwright/test');

test.describe('工作流编辑卡死问题诊断', () => {
  test.beforeEach(async ({ page }) => {
    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    // 监听页面错误
    page.on('pageerror', error => {
      console.log('❌ Page Error:', error.message);
    });

    // 登录
    await page.goto('http://localhost:3001/login');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForURL('**/dashboard');
  });

  test('测试工作流列表加载', async ({ page }) => {
    console.log('📍 导航到工作流列表...');
    await page.goto('http://localhost:3001/work-orders/workflows');
    
    // 等待表格加载
    await page.waitForSelector('.el-table', { timeout: 10000 });
    console.log('✅ 工作流列表加载成功');
  });

  test('测试打开编辑工作流对话框', async ({ page }) => {
    console.log('📍 导航到工作流列表...');
    await page.goto('http://localhost:3001/work-orders/workflows');
    await page.waitForSelector('.el-table');
    
    // 查找第一个编辑按钮
    const editButton = page.locator('button:has-text("编辑")').first();
    const exists = await editButton.count() > 0;
    
    if (!exists) {
      console.log('⚠️ 没有找到工作流，创建一个测试工作流');
      await page.click('button:has-text("新建工作流")');
      await page.waitForSelector('.el-dialog:visible');
      console.log('✅ 新建对话框已打开');
      return;
    }
    
    console.log('📍 点击编辑按钮...');
    await editButton.click();
    
    // 等待对话框出现
    console.log('📍 等待编辑对话框出现...');
    await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
    console.log('✅ 编辑对话框已打开');
    
    // 检查是否有 Monaco 编辑器正在初始化
    const monacoContainers = await page.locator('.monaco-container').count();
    console.log(`📊 Monaco 容器数量: ${monacoContainers}`);
  });

  test('测试编辑对话框响应性', async ({ page }) => {
    console.log('📍 导航到工作流列表...');
    await page.goto('http://localhost:3001/work-orders/workflows');
    await page.waitForSelector('.el-table');
    
    const editButton = page.locator('button:has-text("编辑")').first();
    const exists = await editButton.count() > 0;
    
    if (!exists) {
      console.log('⚠️ 没有工作流可编辑，跳过测试');
      return;
    }
    
    console.log('📍 打开编辑对话框...');
    await editButton.click();
    await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
    
    // 测试对话框内的交互
    console.log('📍 测试工作流名称输入...');
    const nameInput = page.locator('.el-dialog:visible input').first();
    await nameInput.click();
    await nameInput.fill('测试工作流名称');
    console.log('✅ 名称输入正常');
    
    // 检查动作列表
    console.log('📍 检查动作配置区域...');
    const actionItems = await page.locator('.el-dialog:visible .action-item').count();
    console.log(`📊 动作数量: ${actionItems}`);
    
    if (actionItems > 0) {
      console.log('📍 测试展开第一个动作...');
      const firstActionHead = page.locator('.el-dialog:visible .action-head').first();
      await firstActionHead.click();
      await page.waitForTimeout(1000);
      console.log('✅ 动作展开/收起正常');
    }
    
    // 检查 CPU 占用情况（通过测试响应时间）
    console.log('📍 测试页面响应性...');
    const startTime = Date.now();
    await page.evaluate(() => {
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += i;
      }
      return sum;
    });
    const responseTime = Date.now() - startTime;
    console.log(`📊 页面响应时间: ${responseTime}ms`);
    
    if (responseTime > 1000) {
      console.log('⚠️ 页面响应缓慢，可能存在性能问题');
    } else {
      console.log('✅ 页面响应正常');
    }
  });

  test('测试 Monaco 编辑器初始化', async ({ page }) => {
    console.log('📍 导航到工作流列表...');
    await page.goto('http://localhost:3001/work-orders/workflows');
    await page.waitForSelector('.el-table');
    
    const editButton = page.locator('button:has-text("编辑")').first();
    const exists = await editButton.count() > 0;
    
    if (!exists) {
      console.log('⚠️ 没有工作流可编辑');
      return;
    }
    
    console.log('📍 打开编辑对话框...');
    await editButton.click();
    await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
    
    // 等待一段时间，看是否有 Monaco 编辑器初始化
    await page.waitForTimeout(2000);
    
    // 检查是否有 JavaScript 动作
    const jsActions = await page.locator('.el-dialog:visible .action-item').count();
    console.log(`📊 总动作数: ${jsActions}`);
    
    // 检查是否有 Monaco 编辑器容器
    const monacoContainers = await page.locator('.monaco-container').count();
    console.log(`📊 Monaco 容器数量: ${monacoContainers}`);
    
    if (monacoContainers > 0) {
      console.log('📍 检测到 Monaco 编辑器，等待初始化...');
      await page.waitForTimeout(3000);
      
      // 检查 Monaco 是否成功加载
      const monacoLoaded = await page.evaluate(() => {
        return typeof window.monaco !== 'undefined';
      });
      console.log(`📊 Monaco 全局对象加载: ${monacoLoaded}`);
    }
  });

  test('长时间监控编辑对话框', async ({ page }) => {
    console.log('📍 导航到工作流列表...');
    await page.goto('http://localhost:3001/work-orders/workflows');
    await page.waitForSelector('.el-table');
    
    const editButton = page.locator('button:has-text("编辑")').first();
    const exists = await editButton.count() > 0;
    
    if (!exists) {
      console.log('⚠️ 没有工作流可编辑');
      return;
    }
    
    console.log('📍 打开编辑对话框...');
    const startOpen = Date.now();
    await editButton.click();
    await page.waitForSelector('.el-dialog:visible', { timeout: 10000 });
    const openTime = Date.now() - startOpen;
    console.log(`📊 对话框打开耗时: ${openTime}ms`);
    
    // 监控 10 秒内的响应性
    console.log('📍 开始 10 秒响应性监控...');
    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(1000);
      
      const testStart = Date.now();
      try {
        await page.evaluate(() => document.body.style.cursor);
        const testTime = Date.now() - testStart;
        console.log(`⏱️  ${i}秒 - 响应时间: ${testTime}ms`);
        
        if (testTime > 500) {
          console.log(`⚠️  ${i}秒时检测到响应缓慢`);
        }
      } catch (e) {
        console.log(`❌ ${i}秒时页面无响应: ${e.message}`);
      }
    }
    
    console.log('✅ 监控完成');
  });
});
