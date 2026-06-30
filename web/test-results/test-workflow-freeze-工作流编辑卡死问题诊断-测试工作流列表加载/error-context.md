# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-workflow-freeze.spec.js >> 工作流编辑卡死问题诊断 >> 测试工作流列表加载
- Location: test-workflow-freeze.spec.js:25:3

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('button:has-text("登录")')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - img "磐石" [ref=e6]
        - generic [ref=e7]:
          - generic [ref=e8]: 磐石
          - generic [ref=e9]: BEDROCK
      - menubar [ref=e10]:
        - menuitem "总览" [ref=e11] [cursor=pointer]:
          - img [ref=e13]
          - generic [ref=e15]: 总览
        - menuitem "设备管理" [ref=e16] [cursor=pointer]:
          - img [ref=e18]
          - generic [ref=e20]: 设备管理
        - menuitem "扫码接入" [ref=e21] [cursor=pointer]:
          - img [ref=e23]
          - generic [ref=e26]: 扫码接入
        - menuitem "屏幕查看" [ref=e27] [cursor=pointer]:
          - img [ref=e29]
          - generic [ref=e31]: 屏幕查看
        - menuitem "Shell 终端" [ref=e32] [cursor=pointer]:
          - img [ref=e34]
          - generic [ref=e37]: Shell 终端
        - menuitem "Logcat" [ref=e38] [cursor=pointer]:
          - img [ref=e40]
          - generic [ref=e42]: Logcat
        - menuitem "自定义事件" [ref=e43] [cursor=pointer]:
          - img [ref=e45]
          - generic [ref=e49]: 自定义事件
        - menuitem "事件定义" [ref=e50] [cursor=pointer]:
          - img [ref=e52]
          - generic [ref=e54]: 事件定义
        - menuitem "外部应用" [ref=e55] [cursor=pointer]:
          - img [ref=e57]
          - generic [ref=e59]: 外部应用
        - menuitem "数据源与接口" [ref=e60] [cursor=pointer]:
          - img [ref=e62]
          - generic [ref=e64]: 数据源与接口
        - menuitem "连接器" [ref=e65] [cursor=pointer]:
          - img [ref=e67]
          - generic [ref=e69]: 连接器
        - generic [ref=e70] [cursor=pointer]:
          - img [ref=e72]
          - generic [ref=e74]: 组态编辑器 ↗
        - generic [ref=e75] [cursor=pointer]:
          - img [ref=e77]
          - generic [ref=e79]: 表单设计器 ↗
        - menuitem "Agent 菜单" [ref=e80] [cursor=pointer]:
          - img [ref=e82]
          - generic [ref=e84]: Agent 菜单
        - menuitem "APK 管理" [ref=e85] [cursor=pointer]:
          - img [ref=e87]
          - generic [ref=e91]: APK 管理
        - menuitem "任务队列" [ref=e92] [cursor=pointer]:
          - img [ref=e94]
          - generic [ref=e96]: 任务队列
        - menuitem "工单管理" [ref=e97] [cursor=pointer]:
          - img [ref=e99]
          - generic [ref=e101]: 工单管理
        - menuitem "授权管理" [ref=e102] [cursor=pointer]:
          - img [ref=e104]
          - generic [ref=e106]: 授权管理
        - menuitem "第三方平台" [ref=e107] [cursor=pointer]:
          - img [ref=e109]
          - generic [ref=e112]: 第三方平台
        - menuitem "用户管理" [ref=e113] [cursor=pointer]:
          - img [ref=e115]
          - generic [ref=e117]: 用户管理
        - menuitem "审计日志" [ref=e118] [cursor=pointer]:
          - img [ref=e120]
          - generic [ref=e123]: 审计日志
        - menuitem "系统管理" [ref=e124] [cursor=pointer]:
          - img [ref=e126]
          - generic [ref=e128]: 系统管理
    - generic [ref=e129]:
      - generic [ref=e130]:
        - generic [ref=e131]: 工单工作流
        - generic [ref=e132]:
          - generic [ref=e134] [cursor=pointer]:
            - img [ref=e135]
            - generic [ref=e138]: 搜索
            - generic [ref=e139]: ⌘K
          - generic [ref=e140]:
            - img [ref=e142]
            - text: admin
            - generic [ref=e145]: 管理员
          - button "退出" [ref=e146] [cursor=pointer]:
            - generic [ref=e147]: 退出
      - main [ref=e148]:
        - generic [ref=e149]:
          - generic [ref=e152]:
            - button "Back Back" [ref=e153] [cursor=pointer]:
              - generic "Back" [ref=e154]:
                - img [ref=e156]
              - generic [ref=e159]: Back
            - separator [ref=e160]
            - generic [ref=e161]: 工单工作流
          - generic [ref=e163]:
            - generic [ref=e164]:
              - button "新建工作流" [ref=e165] [cursor=pointer]:
                - generic [ref=e166]: 新建工作流
              - button "查看执行日志" [ref=e167] [cursor=pointer]:
                - generic [ref=e168]: 查看执行日志
            - generic [ref=e170]:
              - table [ref=e172]:
                - rowgroup [ref=e182]:
                  - row "ID 名称 工单类型 监听事件 动作数 启用 排序 操作" [ref=e183]:
                    - columnheader "ID" [ref=e184]:
                      - generic [ref=e185]: ID
                    - columnheader "名称" [ref=e186]:
                      - generic [ref=e187]: 名称
                    - columnheader "工单类型" [ref=e188]:
                      - generic [ref=e189]: 工单类型
                    - columnheader "监听事件" [ref=e190]:
                      - generic [ref=e191]: 监听事件
                    - columnheader "动作数" [ref=e192]:
                      - generic [ref=e193]: 动作数
                    - columnheader "启用" [ref=e194]:
                      - generic [ref=e195]: 启用
                    - columnheader "排序" [ref=e196]:
                      - generic [ref=e197]: 排序
                    - columnheader "操作" [ref=e198]:
                      - generic [ref=e199]: 操作
              - table [ref=e204]:
                - rowgroup [ref=e214]:
                  - row "1 检查 yan 创建 1 0 编辑 复制 测试 删除" [ref=e215]:
                    - cell "1" [ref=e216]:
                      - generic [ref=e217]: "1"
                    - cell "检查" [ref=e218]:
                      - generic [ref=e219]: 检查
                    - cell "yan" [ref=e220]:
                      - generic [ref=e221]: yan
                    - cell "创建" [ref=e222]:
                      - generic [ref=e225]: 创建
                    - cell "1" [ref=e226]:
                      - generic [ref=e227]: "1"
                    - cell [ref=e228]:
                      - generic [ref=e230]:
                        - switch [checked]
                    - cell "0" [ref=e233]:
                      - generic [ref=e234]: "0"
                    - cell "编辑 复制 测试 删除" [ref=e235]:
                      - generic [ref=e236]:
                        - button "编辑" [ref=e237] [cursor=pointer]:
                          - generic [ref=e238]: 编辑
                        - button "复制" [ref=e239] [cursor=pointer]:
                          - generic [ref=e240]: 复制
                        - button "测试" [ref=e241] [cursor=pointer]:
                          - generic [ref=e242]: 测试
                        - button "删除" [ref=e243] [cursor=pointer]:
                          - generic [ref=e244]: 删除
          - dialog "编辑工作流" [ref=e246]:
            - generic [ref=e247]:
              - generic [ref=e248]:
                - heading "编辑工作流" [level=2] [ref=e249]
                - button "Close this dialog" [ref=e250] [cursor=pointer]:
                  - img [ref=e252]
              - generic [ref=e255]:
                - generic [ref=e256]:
                  - generic [ref=e257]: 名称
                  - textbox "名称" [ref=e261]:
                    - /placeholder: 工作流名称
                    - text: 检查
                - generic [ref=e262]:
                  - generic [ref=e263]: 工单类型
                  - generic [ref=e266] [cursor=pointer]:
                    - generic:
                      - combobox "工单类型" [ref=e268]
                      - generic [ref=e269]: yan
                    - img [ref=e272]
                - generic [ref=e274]:
                  - generic [ref=e275]: 监听事件
                  - generic [ref=e278] [cursor=pointer]:
                    - generic [ref=e279]:
                      - generic [ref=e281]:
                        - generic [ref=e283]: 创建
                        - button "Close this tag" [ref=e284]:
                          - img [ref=e286]
                      - combobox "监听事件" [ref=e289]
                    - img [ref=e292]
                - generic [ref=e294]:
                  - generic [ref=e295]: 描述
                  - textbox "描述" [ref=e298]
                - generic [ref=e299]:
                  - generic [ref=e300]: 排序
                  - generic [ref=e302]:
                    - button "decrease number" [ref=e303]:
                      - img [ref=e305]
                    - button "increase number" [ref=e307] [cursor=pointer]:
                      - img [ref=e309]
                    - spinbutton "排序" [ref=e313]: "0"
                - generic [ref=e314]:
                  - generic [ref=e315]: 启用
                  - generic [ref=e317]:
                    - switch "启用" [checked]
                - separator [ref=e320]
                - generic [ref=e321]:
                  - text: 上下文变量（Context）
                  - img [ref=e323]
                - generic [ref=e325]:
                  - generic [ref=e326]: 暂无上下文变量，可在动作配置中定义
                  - button "添加变量" [ref=e327] [cursor=pointer]:
                    - generic [ref=e328]:
                      - img [ref=e330]
                      - text: 添加变量
                - separator [ref=e332]
                - generic [ref=e333]:
                  - text: 动作配置
                  - button "添加动作" [ref=e334] [cursor=pointer]:
                    - generic [ref=e335]: 添加动作
                - generic [ref=e336]:
                  - generic [ref=e337] [cursor=pointer]:
                    - generic [ref=e338]:
                      - img [ref=e340]
                      - generic [ref=e342]: 动作 1
                      - generic [ref=e344]: 执行 JavaScript
                    - generic [ref=e345]:
                      - button "向前添加" [ref=e346]:
                        - generic [ref=e347]:
                          - img [ref=e349]
                          - text: 向前添加
                      - button "向后添加" [ref=e351]:
                        - generic [ref=e352]:
                          - img [ref=e354]
                          - text: 向后添加
                      - button [disabled] [ref=e356]:
                        - img [ref=e359]
                      - button [disabled] [ref=e361]:
                        - img [ref=e364]
                      - button "删除" [ref=e366]:
                        - generic [ref=e367]: 删除
                  - generic [ref=e368]:
                    - generic [ref=e369]:
                      - generic [ref=e370]: 动作类型
                      - generic [ref=e373] [cursor=pointer]:
                        - generic:
                          - combobox "动作类型" [ref=e375]
                          - generic [ref=e376]: 执行 JavaScript
                        - img [ref=e379]
                    - generic [ref=e381]:
                      - generic [ref=e382]: 执行条件
                      - generic [ref=e383]:
                        - generic [ref=e384]:
                          - img [ref=e387]
                          - textbox "执行条件" [ref=e390]:
                            - /placeholder: "可选，如：{{ctx.count}} > 0 或 {{workOrder.status}} == 'pending'"
                          - button [ref=e393] [cursor=pointer]:
                            - img [ref=e396]
                        - generic [ref=e398]:
                          - text: 示例：
                          - code [ref=e399]: "{{ctx.count}} > 0"
                          - text: 、
                          - code [ref=e400]: "{{workOrder.status}} == \"pending\""
                          - text: 、
                          - code [ref=e401]: "{{ctx.enabled}} == true && {{workOrder.priority}} == \"high\""
                    - group "JavaScript 代码" [ref=e402]:
                      - generic [ref=e403]: JavaScript 代码
                      - generic [ref=e404]:
                        - code [ref=e407]:
                          - generic [ref=e408]:
                            - textbox "Editor content" [active] [ref=e409]
                            - textbox [ref=e410]
                            - generic [ref=e412]:
                              - generic [ref=e414]: "1"
                              - generic [ref=e416]: "2"
                              - generic [ref=e419]: "3"
                            - generic [ref=e428]:
                              - generic [ref=e430]: console.log(JSON.stringify(workOrder))
                              - generic [ref=e433]: console.log(workOrder.)
                          - generic:
                            - listbox "Suggest" [ref=e441]:
                              - generic [ref=e442]:
                                - option "assigned_to, Field" [ref=e443] [cursor=pointer]:
                                  - generic [ref=e445]:
                                    - generic [ref=e446]: 
                                    - generic [ref=e451]: assigned_to
                                    - generic [ref=e453]: "(property) assigned_to?: number"
                                - option "assignee_id, Field" [ref=e454] [cursor=pointer]:
                                  - generic [ref=e456]:
                                    - generic [ref=e457]: 
                                    - generic [ref=e462]: assignee_id
                                - option "business_no, Field" [ref=e463] [cursor=pointer]:
                                  - generic [ref=e465]:
                                    - generic [ref=e466]: 
                                    - generic [ref=e471]: business_no
                                - option "code, Field" [ref=e472] [cursor=pointer]:
                                  - generic [ref=e474]:
                                    - generic [ref=e475]: 
                                    - generic [ref=e480]: code
                                - option "created_at, Field" [ref=e481] [cursor=pointer]:
                                  - generic [ref=e483]:
                                    - generic [ref=e484]: 
                                    - generic [ref=e489]: created_at
                                - option "data_json, Field" [ref=e490] [cursor=pointer]:
                                  - generic [ref=e492]:
                                    - generic [ref=e493]: 
                                    - generic [ref=e498]: data_json
                                - option "description, Field" [ref=e499] [cursor=pointer]:
                                  - generic [ref=e501]:
                                    - generic [ref=e502]: 
                                    - generic [ref=e507]: description
                                - option "device_alias_agent, Field" [ref=e508] [cursor=pointer]:
                                  - generic [ref=e510]:
                                    - generic [ref=e511]: 
                                    - generic [ref=e516]: device_alias_agent
                                - option "device_alias_server, Field" [ref=e517] [cursor=pointer]:
                                  - generic [ref=e519]:
                                    - generic [ref=e520]: 
                                    - generic [ref=e525]: device_alias_server
                                - option "device_group, Field" [ref=e526] [cursor=pointer]:
                                  - generic [ref=e528]:
                                    - generic [ref=e529]: 
                                    - generic [ref=e534]: device_group
                                - option "device_id, Field" [ref=e535] [cursor=pointer]:
                                  - generic [ref=e537]:
                                    - generic [ref=e538]: 
                                    - generic [ref=e543]: device_id
                                - option "device_name_snap, Field" [ref=e544] [cursor=pointer]:
                                  - generic [ref=e546]:
                                    - generic [ref=e547]: 
                                    - generic [ref=e552]: device_name_snap
                            - generic [ref=e554]:
                              - text:  
                              - generic [ref=e555]:
                                - generic [ref=e557]: "log(...data: any[]): void"
                                - generic [ref=e558]:
                                  - paragraph
                                  - generic [ref=e559]:
                                    - paragraph [ref=e560]:
                                      - text: The
                                      - strong [ref=e561]:
                                        - code [ref=e562]: console.log()
                                      - text: static method outputs a message to the console.
                                    - paragraph [ref=e563]:
                                      - link "MDN Reference" [ref=e564] [cursor=pointer]:
                                        - /url: ""
                        - generic [ref=e565]: 可用变量：workOrder（工单对象）、ctx（上下文）、actions（前序动作结果数组）
                    - group "可用字段参考" [ref=e566]:
                      - generic [ref=e567]: 可用字段参考
                      - button "工单字段 (workOrder)" [ref=e571] [cursor=pointer]:
                        - generic [ref=e572]: 工单字段 (workOrder)
                        - img [ref=e574]
                    - generic [ref=e576]:
                      - generic [ref=e577]: 生成的配置
                      - textbox "生成的配置" [ref=e580]: "{ \"code\": \"console.log(JSON.stringify(workOrder))\\n\\nconsole.log(workOrder.)\" }"
                    - button "切换到手动 JSON 模式" [ref=e583] [cursor=pointer]:
                      - generic [ref=e584]: 切换到手动 JSON 模式
                    - generic [ref=e585]:
                      - generic [ref=e586]: 配置（JSON）
                      - generic [ref=e587]:
                        - textbox "配置（JSON）" [ref=e589]:
                          - /placeholder: 动作配置（JSON 对象）
                          - text: "{ \"code\": \"console.log(JSON.stringify(workOrder))\\n\\nconsole.log(workOrder.)\" }"
                        - generic [ref=e591]:
                          - text: "格式：{\"code\": \"log('工单: ' + workOrder.code);\"}"
                          - button "切换到可视化配置" [ref=e592] [cursor=pointer]:
                            - generic [ref=e593]: 切换到可视化配置
              - generic [ref=e594]:
                - button "取消" [ref=e595] [cursor=pointer]:
                  - generic [ref=e596]: 取消
                - button "保存" [ref=e597] [cursor=pointer]:
                  - generic [ref=e598]: 保存
  - generic [ref=e599]:
    - alert [ref=e600]: "...data: any[], , The **`console.log()`** static method outputs a message to the console. [MDN Reference](https://developer.mozilla.org/docs/Web/API/console/log_static), hint"
    - alert
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
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
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