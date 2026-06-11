# Form 编辑器扫码模块 - 第三方应用接口集成

## 概述

Form 编辑器的扫码模块现在支持调用第三方应用的 API 接口，除了原有的内部数据接口外，还可以选择已配置的第三方平台接口端点。

## 功能特性

- **接口类型选择**：可在"内部数据接口"和"第三方应用接口"之间切换
- **统一配置**：复用现有的第三方平台配置（OAuth token 自动管理）
- **灵活的参数映射**：支持将扫码值、表单字段值传递给第三方接口
- **结果回填**：将第三方接口返回的数据自动填充到表单字段

## 使用步骤

### 1. 配置第三方平台提供者

首先在"第三方平台管理"中配置第三方平台（如 FreePass、微信开放平台）：

**API 路径**：`POST /api/thirdparty`

```json
{
  "name": "企业内部系统",
  "type": "freepass",
  "open_api_origin": "https://api.company.com",
  "corp_id": "your_corp_id",
  "app_key": "your_app_key",
  "app_secret": "your_app_secret",
  "enabled": true
}
```

### 2. 配置 API 端点

为第三方平台添加具体的 API 端点配置：

**API 路径**：`POST /api/thirdparty/endpoints`

```json
{
  "provider_id": 1,
  "code": "employee_query",
  "name": "员工信息查询",
  "description": "根据员工工号查询员工详细信息",
  "method": "POST",
  "path": "/api/v1/employee/query",
  "headers_json": "{\"Content-Type\": \"application/json\"}",
  "param_schema_json": "{\"type\":\"object\",\"properties\":{\"code\":{\"type\":\"string\"}}}",
  "response_path_json": "{\"data\": \"data.employee\"}",
  "enabled": true
}
```

**配置说明**：

- `code`：接口编码，在 form 编辑器中选择使用
- `method`：HTTP 方法（GET/POST/PUT/DELETE）
- `path`：API 路径（会拼接到 provider 的 `open_api_origin` 后）
- `headers_json`：额外的 HTTP 头（JSON 格式）
- `response_path_json`：响应数据提取路径，如 `{"data": "data.employee"}` 表示从响应的 `data.employee` 路径提取数据

### 3. 在 Form 编辑器中配置扫码模块

进入页面编辑器，在"扫码模块"配置中：

1. **启用扫码**：勾选"启用扫码（PDA 头扫 / 键盘楔扫码枪）"
2. **接口类型**：选择"第三方应用接口"
3. **第三方接口端点**：选择已配置的端点（如 `employee_query`）
4. **扫码值参数名**：指定扫码值传递的参数名（默认 `code`）
5. **额外参数**：可配置额外参数，支持：
   - `$scan`：扫码值
   - `$form.字段名`：表单字段值
   - 固定值：直接填写字面量
6. **接口结果回填表单**：配置响应字段到表单字段的映射

### 4. 运行时调用流程

当用户在表单页面扫码时：

1. 扫码值通过过滤器验证（可选）
2. 扫码值填入指定字段（可选）
3. 调用第三方接口：
   - 自动获取有效的 access token（从 `ThirdPartyToken` 表）
   - 使用 Bearer Token 认证
   - 传递配置的参数
4. 解析响应并回填表单字段

## API 接口

### 列出第三方 API 端点

```
GET /api/thirdparty/endpoints?provider_id=1
Authorization: Bearer <token>
```

### 创建 API 端点

```
POST /api/thirdparty/endpoints
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider_id": 1,
  "code": "employee_query",
  "name": "员工信息查询",
  "method": "POST",
  "path": "/api/v1/employee/query",
  ...
}
```

### 调用第三方 API（运行时）

```
POST /api/thirdparty/call
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint_code": "employee_query",
  "params": {
    "code": "E001234",
    "dept_id": "D001"
  }
}
```

**响应示例**：

```json
{
  "employee_name": "张三",
  "employee_id": "E001234",
  "department": "研发部",
  "position": "工程师"
}
```

## 配置示例

### 场景：扫工号查询员工信息并自动填充表单

1. **扫码配置**：
   - 接口类型：第三方应用接口
   - 第三方接口端点：`employee_query`
   - 扫码值参数名：`code`
   - 额外参数：
     - `dept_id` ← `$form.department_id`（从表单字段获取）
   - 结果映射：
     - `employee_name` → `employee_name`（表单字段）
     - `position` → `position`（表单字段）

2. **工作流程**：
   - 用户在"部门"下拉框选择部门
   - 扫描员工工牌上的二维码（工号）
   - 系统调用第三方接口，传入 `{code: "E001234", dept_id: "D001"}`
   - 自动填充员工姓名、职位等字段

## Token 管理

系统会自动管理第三方平台的 access token：

- 调用接口前检查 token 是否过期
- 过期时自动使用 refresh token 刷新（FreePass 场景）
- Token 存储在 `third_party_tokens` 表中
- 支持多个授权账号（微信开放平台场景）

## 安全性

- 所有第三方接口调用需要用户认证（Bearer Token）
- 仅管理员可以配置第三方平台和 API 端点
- 操作员及以上角色可以调用已配置的第三方接口
- App Secret 等敏感信息在 API 响应中不返回

## 数据库结构

### `third_party_api_endpoints` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint | 主键 |
| provider_id | uint | 第三方平台 ID（外键） |
| code | string(80) | 业务编码（唯一） |
| name | string(200) | 端点名称 |
| method | string(10) | HTTP 方法 |
| path | string(500) | API 路径 |
| headers_json | text | 额外 HTTP 头 |
| param_schema_json | text | 参数 schema |
| response_path_json | text | 响应提取路径 |
| enabled | bool | 是否启用 |

## 故障排查

### 接口调用返回 "token expired"

- 检查第三方平台的 token 是否已刷新
- 手动调用刷新接口：`POST /api/thirdparty/:id/freepass/refresh`

### 接口返回 "endpoint not found"

- 确认端点 `code` 正确
- 确认端点已启用（`enabled = true`）

### 参数未正确传递

- 检查 `extra_params` 配置中的来源语法（`$scan`, `$form.字段名`）
- 查看浏览器开发者工具的网络请求，确认实际发送的参数

## 后续扩展

未来可以添加：

- 响应数据转换（JavaScript 表达式）
- 批量接口调用（多条扫码结果合并请求）
- 接口调用日志记录
- 接口测试工具（在管理界面直接测试）
