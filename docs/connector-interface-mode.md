# 连接器接口模式与条件分支

## 概述

连接器现在支持**接口模式**，可以作为可调用的接口使用，并支持：
- 定义输入参数和输出结构
- 在其他连接器中调用
- 在 form-app 扫码模块中调用
- 条件判断和分支跳转
- 连接器间相互调用

## 一、接口模式

### 1.1 启用接口模式

在连接器配置中，设置以下字段：

```json
{
  "interface_mode": true,
  "interface_code": "check_employee_status",
  "input_params_json": "{\"type\":\"object\",\"properties\":{\"employee_id\":{\"type\":\"string\"}}}",
  "output_schema_json": "{\"type\":\"object\",\"properties\":{\"status\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"}}}"
}
```

**字段说明**：
- `interface_mode`：是否启用接口模式（布尔值）
- `interface_code`：接口编码，全局唯一（必填）
- `input_params_json`：输入参数 JSON Schema
- `output_schema_json`：输出结构 JSON Schema

### 1.2 调用连接器接口

#### API 调用

```http
POST /api/outbound/connector-interfaces/call
Authorization: Bearer <token>
Content-Type: application/json

{
  "connector_code": "check_employee_status",
  "params": {
    "employee_id": "E001234"
  },
  "device_id": 1  // 可选
}
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "status": "active",
    "name": "张三",
    "employee_id": "E001234"
  },
  "duration_ms": 125,
  "step_count": 3
}
```

#### 在 form-app 中使用

1. 进入页面编辑器
2. 启用扫码模块
3. 接口类型选择"连接器接口"
4. 选择已配置的连接器接口
5. 配置参数映射和结果回填

## 二、条件分支

### 2.1 条件步骤

在阶段中添加类型为 `condition` 的步骤：

```json
{
  "step_type": "condition",
  "condition_expr": "status === 'active'",
  "true_branch_phase_id": 2,
  "false_branch_phase_id": 3
}
```

**字段说明**：
- `condition_expr`：JavaScript 表达式，返回布尔值
- `true_branch_phase_id`：条件为真时跳转的阶段 ID（0 表示继续）
- `false_branch_phase_id`：条件为假时跳转的阶段 ID（0 表示继续）

### 2.2 条件表达式

条件表达式可以访问运行时变量（`vars`），例如：

```javascript
// 简单比较
status === 'active'

// 逻辑运算
status === 'active' && age >= 18

// 存在检查
typeof employee_name !== 'undefined'

// 复杂条件
(status === 'active' || status === 'pending') && score > 60
```

### 2.3 执行流程

```
阶段 1: 数据查询
  ├─ 步骤 1.1: HTTP 调用查询员工
  └─ 步骤 1.2: 条件判断 (status === 'active')
      ├─ True  → 跳转到阶段 2（正常流程）
      └─ False → 跳转到阶段 3（异常处理）

阶段 2: 正常流程
  └─ 步骤 2.1: 发送通知

阶段 3: 异常处理
  └─ 步骤 3.1: 记录日志
```

## 三、连接器调用步骤

### 3.1 调用其他连接器

在阶段中添加类型为 `call_connector` 的步骤：

```json
{
  "step_type": "call_connector",
  "call_connector_code": "get_department_info",
  "call_params_json": "{\"dept_id\": \"{{department_id}}\", \"include_members\": true}"
}
```

**字段说明**：
- `call_connector_code`：目标连接器的接口编码
- `call_params_json`：参数映射（JSON 对象），支持占位符

### 3.2 参数传递

参数支持以下来源：
- **变量引用**：直接使用变量名（如 `department_id`）
- **占位符**：`{{variable_name}}` 格式（TODO: 完整实现）
- **字面量**：固定值

### 3.3 结果合并

被调用连接器返回的所有变量会自动合并到当前连接器的运行时变量中。

## 四、完整示例

### 4.1 场景：员工入职审批流程

**连接器 1：`check_employee_eligibility`（检查资格）**

```json
{
  "name": "员工入职资格检查",
  "interface_mode": true,
  "interface_code": "check_employee_eligibility",
  "input_params_json": "{\"type\":\"object\",\"properties\":{\"id_number\":{\"type\":\"string\"}}}",
  "output_schema_json": "{\"type\":\"object\",\"properties\":{\"eligible\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}}}"
}
```

**阶段配置**：

1. **阶段 1：身份验证**
   - 步骤 1.1 (http): 调用身份验证接口
   - 步骤 1.2 (condition): 判断 `id_verified === true`
     - True → 继续阶段 2
     - False → 跳转阶段 4（拒绝）

2. **阶段 2：背景调查**
   - 步骤 2.1 (call_connector): 调用 `background_check` 连接器
   - 步骤 2.2 (condition): 判断 `background_clean === true`
     - True → 继续阶段 3
     - False → 跳转阶段 4（拒绝）

3. **阶段 3：批准**
   - 步骤 3.1 (http): 发送批准通知
   - 步骤 3.2 (app_script): 更新系统状态

4. **阶段 4：拒绝**
   - 步骤 4.1 (http): 发送拒绝通知
   - 步骤 4.2 (app_script): 记录拒绝原因

### 4.2 在 form-app 中集成

**表单配置**：

1. 创建入职申请表单
2. 启用扫码模块
3. 配置接口调用：
   - 接口类型：连接器接口
   - 连接器接口：`check_employee_eligibility`
   - 扫码值参数名：`id_number`
   - 结果映射：
     - `eligible` → `approval_status`（表单字段）
     - `reason` → `approval_reason`（表单字段）

**使用流程**：

1. 员工扫描身份证二维码
2. 系统自动调用 `check_employee_eligibility` 连接器
3. 连接器执行完整的审批流程
4. 结果自动回填到表单
5. 用户查看审批状态和原因

## 五、数据库结构变更

### 5.1 `outbound_connectors` 表

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| interface_mode | boolean | 是否启用接口模式 |
| interface_code | string(80) | 接口编码（唯一） |
| input_params_json | text | 输入参数 schema |
| output_schema_json | text | 输出结构 schema |

### 5.2 `outbound_connector_steps` 表

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| condition_expr | text | 条件表达式 |
| true_branch_phase_id | uint | 条件为真时跳转阶段 |
| false_branch_phase_id | uint | 条件为假时跳转阶段 |
| call_connector_code | string(80) | 调用的连接器编码 |
| call_params_json | text | 调用参数映射 |

新增步骤类型：
- `condition`：条件判断
- `call_connector`：调用连接器

## 六、API 接口

### 6.1 列出连接器接口

```
GET /api/outbound/connector-interfaces?code=<code>
Authorization: Bearer <token>
```

### 6.2 获取连接器接口详情

```
GET /api/outbound/connector-interfaces/:code
Authorization: Bearer <token>
```

### 6.3 调用连接器接口

```
POST /api/outbound/connector-interfaces/call
Authorization: Bearer <token>
Content-Type: application/json

{
  "connector_code": "check_employee_status",
  "params": {
    "employee_id": "E001234"
  },
  "device_id": 1
}
```

## 七、执行上下文

### 7.1 运行时变量

连接器执行过程中维护一个变量字典 `vars`：

- **输入参数**：调用时传入的参数自动加入 `vars`
- **阶段参数**：阶段的 `params_json` 会合并到 `vars`
- **步骤结果**：HTTP 调用、连接器调用的结果会合并到 `vars`
- **最终输出**：执行结束后，`vars` 的内容作为接口返回值

### 7.2 执行日志

每次调用连接器接口都会记录：
- 执行的步骤数量
- 执行耗时
- 各阶段的日志
- 跳转记录

## 八、最佳实践

### 8.1 接口设计

1. **单一职责**：每个连接器接口只负责一个业务逻辑
2. **明确输入输出**：定义清晰的 JSON Schema
3. **错误处理**：使用条件分支处理异常情况
4. **幂等性**：确保重复调用不会产生副作用

### 8.2 条件分支

1. **简单条件**：优先使用简单的比较表达式
2. **避免嵌套**：使用多个条件步骤代替复杂的嵌套逻辑
3. **默认路径**：为 false 分支提供合理的默认处理

### 8.3 连接器调用

1. **避免循环**：不要形成 A → B → A 的调用环
2. **控制深度**：调用深度不要超过 3 层
3. **超时设置**：合理设置每个步骤的超时时间

## 九、故障排查

### 9.1 接口调用失败

**问题**：`connector interface not found`

**排查**：
- 检查 `interface_code` 是否正确
- 确认连接器已启用接口模式（`interface_mode = true`）
- 确认连接器已启用（`enabled = true`）

### 9.2 条件跳转不生效

**问题**：条件判断后没有跳转

**排查**：
- 检查条件表达式语法
- 确认变量名是否正确
- 查看执行日志中的条件求值结果

### 9.3 连接器调用超时

**问题**：调用其他连接器时超时

**排查**：
- 检查目标连接器是否正常
- 检查是否存在调用环
- 增加步骤的超时设置

## 十、未来扩展

### 10.1 JavaScript 引擎集成

当前条件表达式使用简化的求值逻辑，未来将集成完整的 JavaScript 引擎（如 goja）支持：
- 复杂表达式
- 函数调用
- 内置函数（字符串处理、数学运算等）

### 10.2 步骤类型扩展

计划添加：
- `loop`：循环步骤
- `parallel`：并行执行多个连接器
- `aggregate`：聚合多个结果

### 10.3 可视化编辑器

提供图形化的流程编辑器，支持：
- 拖拽式步骤编排
- 可视化条件分支
- 实时预览执行流程

## 十一、与其他功能的集成

### 11.1 与第三方接口的区别

| 特性 | 连接器接口 | 第三方接口 |
|------|-----------|----------|
| 执行逻辑 | 多阶段、多步骤 | 单次 HTTP 调用 |
| 条件分支 | 支持 | 不支持 |
| 嵌套调用 | 支持 | 不支持 |
| OAuth 管理 | 不涉及 | 自动管理 |
| 适用场景 | 复杂业务流程 | 简单外部 API 调用 |

### 11.2 选择建议

- **简单查询**：使用内部数据接口
- **外部 API**：使用第三方接口
- **复杂流程**：使用连接器接口
- **混合场景**：连接器中调用第三方接口
