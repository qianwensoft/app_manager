# 工作流功能修复和增强总结

## 修复日期
2026-06-22

## 问题列表

### 1. 工作流配置没有起作用 ✅
**问题描述**：工作流配置后，创建或更新工单时工作流不执行。

**根本原因**：`dispatchWorkOrderEvent` 函数只触发了 webhook 和 STOMP 推送，没有调用工作流引擎。

**修复方案**：
- 文件：`server/api/work_order_webhook.go`
- 添加 `workflow` 包的 import
- 在 `dispatchWorkOrderEvent` 函数中添加工作流引擎调用
- 新增 `fireWorkOrderWorkflows` 函数

### 2. 工作流测试按钮没有反应 ✅
**问题描述**：点击测试按钮后没有响应。

**根本原因**：测试接口本身是正确的，但因为主要的事件分发没有触发工作流引擎，导致用户误以为测试功能也有问题。

**修复方案**：修复问题1后，测试功能自动恢复正常。

### 3. 动作类型 call_endpoint/call_connector/call_data_interface 不支持 ✅
**问题描述**：使用这些动作类型时返回"暂不支持"错误。

**修复方案**：
- 文件：`server/workflow/engine.go`
- 添加 `outbound` 包的 import
- 实现 `callEndpoint` 函数（完全可用）
- 实现 `callConnector` 和 `callDataInterface` 函数（返回友好提示）

**支持情况**：
- ✅ `call_endpoint`：完全支持，可调用第三方接口
- ⚠️ `call_connector`：暂不支持（架构限制），建议使用 webhook 配置
- ⚠️ `call_data_interface`：暂不支持（架构限制），建议使用 webhook 配置

### 4. 工作流日志缺少详情查看功能 ✅
**问题描述**：只能看到日志列表，无法查看详细信息。

**修复方案**：
- 文件：`web/src/views/work-orders/WorkOrderWorkflowLogs.vue`
- 添加"详情"按钮
- 新增详情弹窗，显示：
  - 完整的执行信息（ID、状态、耗时、错误等）
  - 关联的工作流配置
  - 动作配置的格式化展示
  - JS 执行日志
- 添加"查看工单"快捷跳转

### 5. JavaScript 执行环境缺少 console 对象 ✅
**问题描述**：在工作流 JS 代码中使用 `console.log()` 报错"console is not defined"。

**修复方案**：
- 文件：`server/workflow/engine.go`
- 在 `WorkflowContext` 中添加 `Logs` 字段
- 在 JS 执行环境中注入 `console` 对象
- 支持 `console.log()`、`console.info()`、`console.warn()`、`console.error()`
- 将日志保存到 `WorkOrderWorkflowLog.execution_logs` 字段
- 前端详情页展示执行日志，带颜色区分

### 6. JavaScript 执行环境缺少 ctx 对象 ✅
**问题描述**：在工作流 JS 代码中使用 `ctx` 变量报错"ctx is not defined"。

**修复方案**：
- 文件：`server/workflow/engine.go`
- 创建 `ctx` 对象并注入到 JavaScript 环境
- 将 `ctx.Variables` 中的所有变量复制到 `ctx` 对象
- 在 `setVariable` 函数中同步更新 `ctx` 对象
- 现在用户可以使用 `ctx.变量名` 访问上下文变量

### 7. Monaco 编辑器不显示 ✅
**问题描述**：JavaScript 可视化编辑器区域为空白。

**修复方案**：
- 文件：`web/src/views/work-orders/WorkOrderWorkflowLogs.vue`
- 将 `monacoRefs.value[idx]` 改为 `document.getElementById()`
- 删除未使用的 `monacoRefs` 和 `setMonacoRef`

## 修改的文件

### 后端
1. `server/api/work_order_webhook.go`
   - 添加工作流引擎调用
   - 新增 `fireWorkOrderWorkflows` 函数

2. `server/workflow/engine.go`
   - 添加 `Logs` 字段到 `WorkflowContext`
   - 实现 `callEndpoint` 函数
   - 实现 `callConnector` 函数（提示性）
   - 实现 `callDataInterface` 函数（提示性）
   - 添加 `console` 对象支持（log/info/warn/error）
   - 保存执行日志到数据库

3. `server/models/work_order.go`
   - 在 `WorkOrderWorkflowLog` 中添加 `ExecutionLogs` 字段

4. `server/migrations/mysql/004_add_workflow_execution_logs.sql`
   - 数据库迁移文件（MySQL）

5. `server/migrations/sqlite/004_add_workflow_execution_logs.sql`
   - 数据库迁移文件（SQLite）

### 前端
1. `web/src/views/work-orders/WorkOrderWorkflowLogs.vue`
   - 添加详情按钮和弹窗
   - 显示完整的执行信息
   - 显示工作流配置
   - 显示格式化的执行日志（带颜色）
   - 添加查看工单快捷跳转

## 数据库迁移

需要运行迁移来添加 `execution_logs` 字段：

```sql
ALTER TABLE work_order_workflow_logs ADD COLUMN execution_logs TEXT;
```

## 测试建议

1. **测试工作流触发**：
   - 创建工单，检查工作流是否自动执行
   - 更新工单状态，验证工作流触发
   - 使用测试按钮手动触发

2. **测试 call_endpoint 动作**：
   - 配置调用第三方接口的工作流
   - 验证接口调用成功
   - 检查结果是否保存到上下文变量

3. **测试 console 日志**：
   - 在 JS 代码中使用 `console.log()`, `console.info()` 等
   - 触发工作流
   - 在详情页查看执行日志
   - 验证日志颜色区分正确

4. **测试详情查看**：
   - 进入工作流执行日志页面
   - 点击详情按钮
   - 验证所有信息正确展示
   - 测试查看工单跳转

## 已知限制

1. `call_connector` 和 `call_data_interface` 暂不支持直接调用（架构限制）
   - 替代方案：使用工单 webhook 配置
   - 替代方案：使用 `execute_js` 编写 JavaScript 代码调用

2. `console` 对象不支持 `console.dir()`, `console.table()` 等高级方法
   - 仅支持：log, info, warn, error

## 后续优化建议

1. 实现 `call_connector` 和 `call_data_interface` 的直接调用
   - 需要重构包依赖关系，避免循环依赖

2. 增强 JavaScript 执行环境
   - 添加更多内置函数（如 HTTP 请求、数据库查询等）
   - 支持异步操作

3. 工作流可视化编辑器
   - 拖拽式配置界面
   - 实时预览和测试
