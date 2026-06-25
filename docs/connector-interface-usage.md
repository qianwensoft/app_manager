# 连接器接口模式使用指南

## 概述

连接器接口模式允许将连接器作为可调用的 API 接口使用，支持：
- 接口入参定义（输入参数 schema）
- URL 参数和请求体参数
- GET、POST、PUT、DELETE 等多种 HTTP 方法
- 参数自动映射到 context 占位符
- 输出结构定义（返回值 schema）

## 配置接口模式

### 1. 启用接口模式

在连接器编辑页面：

1. 选择**运行模式** → **接口模式（主动调用）**
2. 设置**接口编码**（全局唯一，如 `check_employee_status`）
3. 定义**输入参数**（JSON Schema 格式）
4. 定义**输出结构 Schema**（可选，JSON Schema 格式）

### 2. 输入参数定义示例

```json
{
  "type": "object",
  "properties": {
    "employee_id": {
      "type": "string",
      "description": "员工ID"
    },
    "department": {
      "type": "string",
      "description": "部门代码"
    },
    "check_type": {
      "type": "string",
      "enum": ["status", "attendance", "permission"],
      "description": "查询类型"
    }
  },
  "required": ["employee_id"]
}
```

### 3. 输出结构定义示例

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "员工状态"
    },
    "name": {
      "type": "string",
      "description": "员工姓名"
    },
    "department_name": {
      "type": "string",
      "description": "部门名称"
    },
    "last_check_time": {
      "type": "string",
      "description": "最后检查时间"
    }
  }
}
```

## Context 占位符映射

### 自动映射规则

接口入参会自动映射到 context 命名空间，可通过以下方式引用：

| 入参名称 | 占位符方式1 | 占位符方式2 |
|---------|-----------|-----------|
| employee_id | `{{employee_id}}` | `{{context.employee_id}}` |
| department | `{{department}}` | `{{context.department}}` |
| check_type | `{{check_type}}` | `{{context.check_type}}` |

### HTTP 相关变量

系统自动添加以下变量：

| 变量 | 说明 | 示例 |
|-----|------|------|
| `{{http.method}}` | HTTP 方法 | GET, POST, PUT, DELETE |
| `{{http.path}}` | 请求路径 | /api/outbound/connector-interfaces/check_employee/invoke |
| `{{http.query}}` | Query string | employee_id=E001&department=IT |

### 系统变量

| 变量 | 说明 |
|-----|------|
| `{{timestamp}}` | Unix 时间戳（秒） |
| `{{timestamp_ms}}` | Unix 时间戳（毫秒） |
| `{{userid}}` / `{{user.id}}` | 调用用户 ID（如果有） |
| `{{deviceid}}` / `{{device.id}}` | 设备 ID（如果通过 X-Device-ID header 提供） |

## 调用方式

### 方式一：通用调用（推荐）

支持 GET、POST、PUT、DELETE、PATCH 等方法。

#### GET 请求（URL 参数）

```bash
curl -X GET "http://localhost:8080/api/outbound/connector-interfaces/check_employee/invoke?employee_id=E001&department=IT" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### POST 请求（JSON Body）

```bash
curl -X POST "http://localhost:8080/api/outbound/connector-interfaces/check_employee/invoke" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": "E001",
    "department": "IT",
    "check_type": "status"
  }'
```

#### 混合参数（Query + Body）

Body 参数会覆盖同名的 Query 参数：

```bash
curl -X POST "http://localhost:8080/api/outbound/connector-interfaces/check_employee/invoke?employee_id=E001" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "check_type": "status",
    "employee_id": "E002"
  }'
# 最终 employee_id 为 E002（Body 覆盖 Query）
```

#### PUT/DELETE 请求

```bash
curl -X PUT "http://localhost:8080/api/outbound/connector-interfaces/update_employee/invoke" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "E001", "status": "active"}'

curl -X DELETE "http://localhost:8080/api/outbound/connector-interfaces/delete_employee/invoke?employee_id=E001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 方式二：POST 统一调用

```bash
curl -X POST "http://localhost:8080/api/outbound/connector-interfaces/call" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connector_code": "check_employee",
    "params": {
      "employee_id": "E001",
      "department": "IT"
    },
    "device_id": 123
  }'
```

### 返回格式

```json
{
  "success": true,
  "data": {
    "status": "active",
    "name": "张三",
    "department_name": "信息技术部",
    "last_check_time": "2026-06-09 15:30:00"
  },
  "duration_ms": 156,
  "step_count": 3
}
```

失败时：

```json
{
  "success": false,
  "error": "employee not found",
  "duration_ms": 45,
  "step_count": 1
}
```

## 步骤配置示例

### 1. HTTP 步骤使用入参

在 HTTP 步骤的接口 Body 模板中：

```json
{
  "employee_id": "{{context.employee_id}}",
  "department": "{{department}}",
  "query_type": "{{check_type}}",
  "request_time": "{{timestamp}}"
}
```

### 2. 消息提醒步骤

```
员工查询完成：
员工ID：{{context.employee_id}}
部门：{{context.department}}
查询类型：{{context.check_type}}
```

### 3. 数据接口步骤参数映射

| 参数名 | Source | Value |
|--------|--------|-------|
| employee_id | context | employee_id |
| dept_code | context | department |
| query_type | var | {{check_type}} |
| timestamp | fixed | 固定值或留空 |

### 4. 条件步骤

使用条件步骤实现分支逻辑（TODO：完善 JavaScript 表达式引擎）：

```javascript
context.check_type === 'status'
```

## 完整示例：员工状态查询接口

### 场景

创建一个接口，根据员工 ID 查询其在第三方系统中的状态。

### 配置步骤

1. **接口编码**：`check_employee_status`
2. **输入参数**：
   ```json
   {
     "type": "object",
     "properties": {
       "employee_id": {"type": "string", "description": "员工ID"},
       "include_detail": {"type": "boolean", "description": "是否包含详情"}
     },
     "required": ["employee_id"]
   }
   ```

3. **阶段 1**：查询员工基本信息
   - 步骤类型：HTTP
   - 接口：外部系统 - 查询员工
   - Body 模板：
     ```json
     {
       "emp_id": "{{context.employee_id}}",
       "detail": "{{context.include_detail}}"
     }
     ```
   - 执行后：将 HTTP 响应写入 context ✓

4. **阶段 2**（可选）：根据状态查询详情
   - 步骤类型：条件判断
   - 条件：`context.status === 'active' && context.include_detail`
   - 真分支：跳转到阶段 3
   - 假分支：继续

5. **返回结果**：
   - 最终 context 中包含所有步骤累积的数据
   - 返回给调用方的 `data` 字段即为最终 context

### 调用示例

```bash
curl -X GET "http://localhost:8080/api/outbound/connector-interfaces/check_employee_status/invoke?employee_id=E001&include_detail=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 注意事项

1. **接口编码全局唯一**：同一系统中不能有重复的接口编码
2. **参数命名规范**：建议使用 snake_case，避免使用特殊字符
3. **占位符引用**：推荐使用 `{{context.xxx}}` 形式，语义更清晰
4. **HTTP 方法选择**：
   - GET：查询操作，参数通过 URL
   - POST：创建操作，参数通过 Body
   - PUT：更新操作
   - DELETE：删除操作
5. **认证要求**：接口调用需要有效的 JWT Token
6. **超时设置**：在连接器中配置合理的超时时间
7. **错误处理**：HTTP 步骤失败会中断执行，建议配置重试

## 与触发模式的区别

| 特性 | 触发模式 | 接口模式 |
|-----|---------|---------|
| 触发方式 | 被动（事件、Webhook、定时等） | 主动（HTTP 调用） |
| 入参来源 | 事件数据（event_data） | 接口参数（params） |
| Context | device, device_event, definition | 接口入参 + HTTP 变量 |
| 设备关联 | 必须关联设备 | 可选（通过 X-Device-ID header） |
| 返回值 | 无（异步执行） | 有（同步返回 data） |
| 使用场景 | 实时响应设备事件、定时任务 | API 集成、外部系统查询 |

## 高级用法

### 1. 链式调用其他连接器（TODO）

在步骤中调用其他接口模式的连接器：

```json
{
  "step_type": "call_connector",
  "call_connector_code": "another_interface",
  "call_params": {
    "param1": "{{context.value1}}",
    "param2": "fixed_value"
  }
}
```

### 2. 条件分支（TODO）

根据 context 值动态跳转到不同阶段：

```json
{
  "step_type": "condition",
  "condition_expr": "context.status === 'active'",
  "true_branch_phase_id": 3,
  "false_branch_phase_id": 4
}
```

### 3. 应用脚本扩展

在步骤前后执行 JavaScript 脚本，动态处理数据：

```javascript
function main(ctx) {
  // 执行前：处理参数
  var empId = ctx.getVar('employee_id');
  ctx.setParam('formatted_id', 'EMP-' + empId);
  
  // 执行后：处理返回值
  var status = ctx.getVar('context.status');
  if (status === '1') {
    ctx.setVar('context.status_text', '在职');
  }
}
```

## 常见问题

### Q1: 如何传递数组参数？

在 POST 请求的 Body 中可以直接传递数组：

```json
{
  "employee_ids": ["E001", "E002", "E003"],
  "departments": ["IT", "HR"]
}
```

在步骤中引用：`{{context.employee_ids}}`

### Q2: GET 请求如何传递复杂参数？

GET 请求建议传递简单的字符串参数。如需传递复杂结构，使用 POST 方法。

### Q3: 如何获取当前调用的 HTTP 方法？

使用 `{{http.method}}` 占位符，可在步骤中根据方法实现不同逻辑。

### Q4: 接口模式支持分页吗？

通过入参定义 `page` 和 `page_size` 参数，在步骤中传递给后端接口：

```json
{
  "page": "{{context.page}}",
  "page_size": "{{context.page_size}}"
}
```

### Q5: 如何返回特定格式的数据？

最终返回的 `data` 字段来自执行后的 context。通过以下方式控制返回内容：
- HTTP 步骤「执行后」选择将响应写入 context
- 数据接口步骤选择「结果→context」
- 应用脚本在 after_response 阶段设置变量

## 更新日志

- 2026-06-09: 初始版本，支持基本的接口模式和 context 映射
- 支持 GET、POST、PUT、DELETE、PATCH 多种 HTTP 方法
- 自动合并 URL 参数和 Body 参数
