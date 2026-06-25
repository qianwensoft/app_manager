# form-app E2E 测试套件

针对 form-app 全功能的 Playwright 端到端用例。**以仓库代码为事实依据编写**
（路由、API 契约、DOM 结构均来自源码核实），需在能连通目标环境的机器上运行。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `E2E_BASE_URL` | `http://192.168.1.136:3000` | 被测站点根（Go 服务，服务 form-app 构建产物 + /api） |
| `E2E_USERNAME` | `admin` | 登录用户名 |
| `E2E_PASSWORD` | `admin123` | 登录密码 |

## 跑法

```bash
cd form-app
npm i -D @playwright/test
./node_modules/.bin/playwright install chromium
# 指向测试环境（单 worker 更稳，事件用例对时序敏感）
E2E_BASE_URL=http://192.168.1.136:3000 ./node_modules/.bin/playwright test --workers=1
# 看报告
./node_modules/.bin/playwright show-report
# 只跑某组
./node_modules/.bin/playwright test e2e/04-events.spec.ts
# 带界面调试
./node_modules/.bin/playwright test --headed --debug
```

> ⚠️ **必须用项目本地 `./node_modules/.bin/playwright`，不要用 `npx playwright`。**
> `npx` 可能解析到全局缓存里的不同 Playwright 版本，触发
> 「Playwright Test did not expect test.describe() to be called here / two different
> versions of @playwright/test」假错（与代码无关）。也可在 package.json 走
> `npm run test:e2e`（已指向本地 binary）。
>
> ✅ 最近一次在 `http://192.168.1.136:3000` 实跑：**19/19 全过**。

## 登录态

form-app 自身无登录页（登录态由外壳注入）。`auth.setup.ts` 直接打
`POST /api/auth/login` 拿 `token`，写入 storageState 的 `localStorage.token`
（form-app 各页从此读取，见 `runtimeAuth.ts` / `console/api.ts`）。所有用例复用此态。

## 用例索引

| 组 | 文件 | 覆盖 | 关联代码 |
|---|---|---|---|
| A 列表页 | `01-list.spec.ts` | 加载/搜索/新建可见/删除二次确认/向导入口 | `FormAppListPage.tsx` |
| B 创建向导 | `02-create-wizard.spec.ts` | 三步流程/必填校验/成功创建/回退 | `FormAppCreateWizard.tsx` |
| C 运行时填报 | `03-runtime-fill.spec.ts` | 字段渲染/必填拦截/提交成功/非法 code | `MultiPageRuntime` + `SchemaFormRenderer` |
| D 事件系统 | `04-events.spec.ts` | field_change 联动/scan 填值/when 条件/自定义事件 | `eventEngine.ts`（本轮重点） |
| E 应用级事件 | `05-appstate.spec.ts` | $app 状态 + state_change 常驻事件端到端/持久化入口 | 第 2 步 AppState |

## 数据隔离

用例经 API 建/删 form-app（`helpers.ts` 的 `createApp`/`deleteApp`），`afterEach`
清理，互不污染。运行时页用 `createRunnableFormPage` 经 API 注入 field_definitions +
events，避免依赖 UI 设计器的脆弱性。

## 覆盖边界

- 已在 `http://192.168.1.136:3000` 实跑通过（19/19）。选择器以语义文本 + 跨渲染库
  容器（`fieldInput()`）+ CJK 空白容忍（`cjkBtn()`）定位，降低对 antd 版本/包裹层的脆弱性。
- 扫码用 `window.eventManager.emit` 模拟（与真机同路径），未覆盖键盘楔/真实扫码硬件。
- 提交（C3）只验证「前端校验放行 + 发出 submit 请求」；后端接口执行需页面绑定
  `interface_code`，属另一层关注点，不在本套范围。
- 打印（AndroidBridge）、agent WebView 端到端不在浏览器 E2E 范围。
- 数据隔离：用例经 API 建/删 app（`afterEach` 清理）；注意 `CreateFormApp` 会自动建
  默认 `form` 页，故 `createRunnableFormPage` 更新该默认页而非新建。

