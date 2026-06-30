# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-workflow-freeze.spec.js >> 工作流编辑卡死问题诊断 >> 测试编辑对话框响应性
- Location: test-workflow-freeze.spec.js:64:3

# Error details

```
Error: Channel closed
```

```
Error: page.click: Page crashed
Call log:
  - waiting for locator('button:has-text("登录")')

```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('工作流编辑卡死问题诊断', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     // 监听控制台错误
  6   |     page.on('console', msg => {
  7   |       if (msg.type() === 'error') {
  8   |         console.log('❌ Console Error:', msg.text());
  9   |       }
  10  |     });
  11  |     
  12  |     // 监听页面错误
  13  |     page.on('pageerror', error => {
  14  |       console.log('❌ Page Error:', error.message);
  15  |     });
  16  | 
  17  |     // 登录
  18  |     await page.goto('http://localhost:3001/login');
  19  |     await page.fill('input[type="text"]', 'admin');
  20  |     await page.fill('input[type="password"]', 'admin123');
> 21  |     await page.click('button:has-text("登录")');
      |                ^ Error: page.click: Page crashed
  22  |     await page.waitForURL('**/dashboard');
  23  |   });
  24  | 
  25  |   test('测试工作流列表加载', async ({ page }) => {
  26  |     console.log('📍 导航到工作流列表...');
  27  |     await page.goto('http://localhost:3001/work-orders/workflows');
  28  |     
  29  |     // 等待表格加载
  30  |     await page.waitForSelector('.el-table', { timeout: 10000 });
  31  |     console.log('✅ 工作流列表加载成功');
  32  |   });
  33  | 
  34  |   test('测试打开编辑工作流对话框', async ({ page }) => {
  35  |     console.log('📍 导航到工作流列表...');
  36  |     await page.goto('http://localhost:3001/work-orders/workflows');
  37  |     await page.waitForSelector('.el-table');
  38  |     
  39  |     // 查找第一个编辑按钮
  40  |     const editButton = page.locator('button:has-text("编辑")').first();
  41  |     const exists = await editButton.count() > 0;
  42  |     
  43  |     if (!exists) {
  44  |       console.log('⚠️ 没有找到工作流，创建一个测试工作流');
  45  |       await page.click('button:has-text("新建工作流")');
  46  |       await page.waitForSelector('.el-dialog:visible');
  47  |       console.log('✅ 新建对话框已打开');
  48  |       return;
  49  |     }
  50  |     
  51  |     console.log('📍 点击编辑按钮...');
  52  |     await editButton.click();
  53  |     
  54  |     // 等待对话框出现
  55  |     console.log('📍 等待编辑对话框出现...');
  56  |     await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
  57  |     console.log('✅ 编辑对话框已打开');
  58  |     
  59  |     // 检查是否有 Monaco 编辑器正在初始化
  60  |     const monacoContainers = await page.locator('.monaco-container').count();
  61  |     console.log(`📊 Monaco 容器数量: ${monacoContainers}`);
  62  |   });
  63  | 
  64  |   test('测试编辑对话框响应性', async ({ page }) => {
  65  |     console.log('📍 导航到工作流列表...');
  66  |     await page.goto('http://localhost:3001/work-orders/workflows');
  67  |     await page.waitForSelector('.el-table');
  68  |     
  69  |     const editButton = page.locator('button:has-text("编辑")').first();
  70  |     const exists = await editButton.count() > 0;
  71  |     
  72  |     if (!exists) {
  73  |       console.log('⚠️ 没有工作流可编辑，跳过测试');
  74  |       return;
  75  |     }
  76  |     
  77  |     console.log('📍 打开编辑对话框...');
  78  |     await editButton.click();
  79  |     await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
  80  |     
  81  |     // 测试对话框内的交互
  82  |     console.log('📍 测试工作流名称输入...');
  83  |     const nameInput = page.locator('.el-dialog:visible input').first();
  84  |     await nameInput.click();
  85  |     await nameInput.fill('测试工作流名称');
  86  |     console.log('✅ 名称输入正常');
  87  |     
  88  |     // 检查动作列表
  89  |     console.log('📍 检查动作配置区域...');
  90  |     const actionItems = await page.locator('.el-dialog:visible .action-item').count();
  91  |     console.log(`📊 动作数量: ${actionItems}`);
  92  |     
  93  |     if (actionItems > 0) {
  94  |       console.log('📍 测试展开第一个动作...');
  95  |       const firstActionHead = page.locator('.el-dialog:visible .action-head').first();
  96  |       await firstActionHead.click();
  97  |       await page.waitForTimeout(1000);
  98  |       console.log('✅ 动作展开/收起正常');
  99  |     }
  100 |     
  101 |     // 检查 CPU 占用情况（通过测试响应时间）
  102 |     console.log('📍 测试页面响应性...');
  103 |     const startTime = Date.now();
  104 |     await page.evaluate(() => {
  105 |       let sum = 0;
  106 |       for (let i = 0; i < 1000000; i++) {
  107 |         sum += i;
  108 |       }
  109 |       return sum;
  110 |     });
  111 |     const responseTime = Date.now() - startTime;
  112 |     console.log(`📊 页面响应时间: ${responseTime}ms`);
  113 |     
  114 |     if (responseTime > 1000) {
  115 |       console.log('⚠️ 页面响应缓慢，可能存在性能问题');
  116 |     } else {
  117 |       console.log('✅ 页面响应正常');
  118 |     }
  119 |   });
  120 | 
  121 |   test('测试 Monaco 编辑器初始化', async ({ page }) => {
```