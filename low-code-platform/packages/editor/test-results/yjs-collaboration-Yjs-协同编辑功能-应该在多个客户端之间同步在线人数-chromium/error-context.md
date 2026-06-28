# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: yjs-collaboration.spec.ts >> Yjs 协同编辑功能 >> 应该在多个客户端之间同步在线人数
- Location: tests/yjs-collaboration.spec.ts:61:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('div.rounded-lg').filter({ hasText: /人在线|已连接/ }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('div.rounded-lg').filter({ hasText: /人在线|已连接/ }).first()

```

```yaml
- heading "Low-Code Platform" [level=1]
- text: Username
- textbox: admin
- text: Password
- textbox
- button "Login"
- strong: "Default credentials:"
- text: "Username: admin Password: (check your backend config)"
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * Yjs 协同编辑自动化测试
  5   |  *
  6   |  * 测试场景：
  7   |  * 1. 在线人数实时更新
  8   |  * 2. 内容实时同步
  9   |  * 3. 连接状态指示器
  10  |  * 4. 断线重连
  11  |  */
  12  | 
  13  | const TEST_CREDENTIALS = {
  14  |   username: 'admin',
  15  |   password: 'admin123'
  16  | };
  17  | 
  18  | // 登录辅助函数
  19  | async function login(page: Page) {
  20  |   await page.goto('/login');
  21  | 
  22  |   // 填写登录表单
  23  |   await page.fill('input[name="username"], input[type="text"]', TEST_CREDENTIALS.username);
  24  |   await page.fill('input[name="password"], input[type="password"]', TEST_CREDENTIALS.password);
  25  | 
  26  |   // 点击登录按钮
  27  |   await page.click('button[type="submit"], button:has-text("登录")');
  28  | 
  29  |   // 等待跳转
  30  |   await page.waitForURL('**/', { timeout: 10000 });
  31  | }
  32  | 
  33  | // 测试前的准备工作
  34  | test.beforeAll(async () => {
  35  |   console.log('🧪 开始 Yjs 协同编辑测试...');
  36  | });
  37  | 
  38  | test.describe('Yjs 协同编辑功能', () => {
  39  | 
  40  |   test('应该显示连接状态指示器', async ({ page }) => {
  41  |     // 先登录
  42  |     await login(page);
  43  | 
  44  |     await page.goto('/editor?id=1');
  45  | 
  46  |     // 等待页面加载
  47  |     await page.waitForLoadState('networkidle');
  48  | 
  49  |     // 等待连接建立
  50  |     await page.waitForTimeout(3000);
  51  | 
  52  |     // 查找连接状态指示器（检查是否有绿色/黄色/红色的状态指示）
  53  |     const statusIndicator = page.locator('div.rounded-lg').filter({ hasText: /在线|连接中|连接断开|已连接/ }).first();
  54  | 
  55  |     // 验证状态指示器存在
  56  |     await expect(statusIndicator).toBeVisible({ timeout: 10000 });
  57  | 
  58  |     console.log('✅ 连接状态指示器显示正常');
  59  |   });
  60  | 
  61  |   test('应该在多个客户端之间同步在线人数', async ({ browser }) => {
  62  |     // 创建第一个上下文（用户 A）
  63  |     const contextA = await browser.newContext();
  64  |     const pageA = await contextA.newPage();
  65  | 
  66  |     // 用户 A 登录
  67  |     await login(pageA);
  68  | 
  69  |     // 访问编辑器页面（需要根据实际路由调整）
  70  |     await pageA.goto('/editor?id=1');
  71  |     await pageA.waitForLoadState('networkidle');
  72  | 
  73  |     // 等待连接建立
  74  |     await pageA.waitForTimeout(3000);
  75  | 
  76  |     // 查找在线人数显示 - 使用更灵活的选择器
  77  |     const onlineCountA = pageA.locator('div.rounded-lg').filter({ hasText: /人在线|已连接/ }).first();
> 78  |     await expect(onlineCountA).toBeVisible({ timeout: 10000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  79  | 
  80  |     // 获取当前在线人数文本
  81  |     const textA1 = await onlineCountA.textContent();
  82  |     console.log('👤 用户 A 看到的在线状态:', textA1);
  83  |     expect(textA1).toMatch(/1 人在线|已连接/);
  84  | 
  85  |     // 创建第二个上下文（用户 B）
  86  |     const contextB = await browser.newContext();
  87  |     const pageB = await contextB.newPage();
  88  | 
  89  |     // 用户 B 登录
  90  |     await login(pageB);
  91  | 
  92  |     await pageB.goto('/editor?id=1');
  93  |     await pageB.waitForLoadState('networkidle');
  94  | 
  95  |     // 等待 awareness 同步
  96  |     await pageB.waitForTimeout(3000);
  97  | 
  98  |     // 用户 A 应该看到 2 人在线
  99  |     const textA2 = await onlineCountA.textContent();
  100 |     console.log('👥 用户 A 看到的在线人数（用户 B 加入后）:', textA2);
  101 |     expect(textA2).toContain('2 人在线');
  102 | 
  103 |     // 用户 B 也应该看到 2 人在线
  104 |     const onlineCountB = pageB.locator('div.rounded-lg').filter({ hasText: /人在线/ }).first();
  105 |     await expect(onlineCountB).toBeVisible();
  106 |     const textB = await onlineCountB.textContent();
  107 |     console.log('👥 用户 B 看到的在线人数:', textB);
  108 |     expect(textB).toContain('2 人在线');
  109 | 
  110 |     // 关闭用户 B 的连接
  111 |     await contextB.close();
  112 | 
  113 |     // 等待 awareness 更新
  114 |     await pageA.waitForTimeout(3000);
  115 | 
  116 |     // 用户 A 应该看到在线人数回到 1
  117 |     const textA3 = await onlineCountA.textContent();
  118 |     console.log('👤 用户 A 看到的在线人数（用户 B 离开后）:', textA3);
  119 |     expect(textA3).toContain('1 人在线');
  120 | 
  121 |     await contextA.close();
  122 | 
  123 |     console.log('✅ 在线人数同步测试通过');
  124 |   });
  125 | 
  126 |   test('应该在多个客户端之间同步内容变更', async ({ browser }) => {
  127 |     // 创建两个独立的浏览器上下文
  128 |     const contextA = await browser.newContext();
  129 |     const contextB = await browser.newContext();
  130 | 
  131 |     const pageA = await contextA.newPage();
  132 |     const pageB = await contextB.newPage();
  133 | 
  134 |     // 两个用户登录
  135 |     await login(pageA);
  136 |     await login(pageB);
  137 | 
  138 |     // 两个用户访问同一个页面
  139 |     await pageA.goto('/editor?id=1');
  140 |     await pageB.goto('/editor?id=1');
  141 | 
  142 |     await pageA.waitForLoadState('networkidle');
  143 |     await pageB.waitForLoadState('networkidle');
  144 | 
  145 |     // 等待连接建立
  146 |     await pageA.waitForTimeout(2000);
  147 |     await pageB.waitForTimeout(2000);
  148 | 
  149 |     // 用户 A 进行编辑操作（具体操作取决于编辑器 UI）
  150 |     // 这里是示例，需要根据实际编辑器调整
  151 |     console.log('📝 用户 A 正在编辑...');
  152 | 
  153 |     // 模拟添加一个组件或修改内容
  154 |     // 例如：点击添加按钮，拖拽组件等
  155 |     // const addButton = pageA.locator('button:has-text("添加")');
  156 |     // if (await addButton.isVisible()) {
  157 |     //   await addButton.click();
  158 |     // }
  159 | 
  160 |     // 等待同步
  161 |     await pageA.waitForTimeout(1000);
  162 | 
  163 |     // 验证用户 B 收到了变更
  164 |     // 这里需要根据实际的编辑器 UI 来验证
  165 |     // 例如：检查某个组件是否出现
  166 |     console.log('👀 验证用户 B 是否看到了变更...');
  167 | 
  168 |     // 清理
  169 |     await contextA.close();
  170 |     await contextB.close();
  171 | 
  172 |     console.log('✅ 内容同步测试通过');
  173 |   });
  174 | 
  175 |   test('应该显示正确的连接状态', async ({ page }) => {
  176 |     // 先登录
  177 |     await login(page);
  178 | 
```