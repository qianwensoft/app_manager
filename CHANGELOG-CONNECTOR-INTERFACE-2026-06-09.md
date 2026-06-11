# 连接器接口模式 Context 改进 - 2026-06-09

## 功能概述

完善了连接器接口模式的 Context 配置，使其能够正确处理接口入参、URL 参数，并支持多种 HTTP 方法。

## 主要改进

### 1. ✅ 接口入参自动映射到 Context

**改进前：** 接口模式下 context 主要包含 device 相关字段，入参处理不完善

**改进后：** 所有接口入参自动作为 context 的初始值

```javascript
// 输入参数
{
  "employee_id": "E001",
  "department": "IT"
}

// 自动映射为可用占位符
{{employee_id}}          // 直接引用
{{context.employee_id}}  // context 命名空间
```

**实现位置：** `server/api/connector_interface.go:203-209`

### 2. ✅ 支持多种 HTTP 方法（GET、POST、PUT、DELETE、PATCH）

**新增 API 端点：**
```
GET    /api/outbound/connector-interfaces/:code/invoke
POST   /api/outbound/connector-interfaces/:code/invoke
PUT    /api/outbound/connector-interfaces/:code/invoke
DELETE /api/outbound/connector-interfaces/:code/invoke
PATCH  /api/outbound/connector-interfaces/:code/invoke
```

**实现位置：**
- Handler: `server/api/connector_interface.go:95-163`
- Routes: `server/api/router.go:304-308`

### 3. ✅ URL 参数与 Body 参数智能合并

**合并规则：**
1. 提取 URL query string 参数
2. 提取 Body JSON 参数（POST/PUT/PATCH）
3. Body 参数覆盖同名 query 参数

**示例：**
```bash
# URL 参数
GET /invoke?employee_id=E001&status=active

# Body 参数
POST /invoke
{"employee_id": "E002", "department": "IT"}

# 混合（Body 优先）
POST /invoke?employee_id=E001
{"employee_id": "E002"}  # 最终值为 E002
```

**实现位置：** `server/api/connector_interface.go:118-131`

### 4. ✅ HTTP 元信息变量

自动添加 HTTP 相关变量到 context：

| 变量 | 说明 | 示例值 |
|-----|------|--------|
| `{{http.method}}` | HTTP 方法 | GET, POST, PUT |
| `{{http.path}}` | 请求路径 | /api/outbound/connector-interfaces/xxx/invoke |
| `{{http.query}}` | Query string | employee_id=E001&dept=IT |

**实现位置：** `server/api/connector_interface.go:211-220`

### 5. ✅ 系统变量增强

新增时间戳变量：
- `{{timestamp}}` - Unix 时间戳（秒）
- `{{timestamp_ms}}` - Unix 时间戳（毫秒）

保留可选变量（仅当提供时）：
- `{{deviceid}}` / `{{device.id}}`
- `{{userid}}` / `{{user.id}}`

**实现位置：** `server/api/connector_interface.go:222-236`

### 6. ✅ Context 数据结构优化

**改进前：**
```go
type connectorExecutionContext struct {
    vars map[string]interface{} // 混合所有变量
}
```

**改进后：**
```go
type connectorExecutionContext struct {
    vars    map[string]interface{} // 扁平化的占位符键值对
    context map[string]interface{} // context 命名空间（业务数据）
}
```

**实现位置：** `server/api/connector_interface.go:243-252`

## 前端改进

### 界面说明更新

**文件：** `web/src/views/OutboundConnectorEdit.vue:71-85`

更新了接口调用方式说明，包含：
- 通用调用方式（支持 GET/POST/PUT/DELETE）
- URL 参数和 Body 参数用法示例
- Context 占位符使用提示

## 测试覆盖

**文件：** `server/api/connector_interface_test.go`

新增测试用例：
1. `TestConnectorInterfaceContextMapping` - 验证参数到 context 的映射
2. `TestHTTPParamsExtraction` - 验证 HTTP 参数提取和合并逻辑
3. `TestContextPlaceholderUsage` - 验证占位符在步骤中的使用场景

## 文档更新

1. **完整使用指南：** `docs/connector-interface-usage.md`
   - 接口模式配置步骤
   - Context 占位符映射规则
   - 多种调用方式示例
   - 完整场景示例（员工状态查询）
   - 常见问题解答

2. **Context 映射说明：** `docs/connector-interface-context-mapping.md`
   - 核心改进说明
   - 代码实现细节
   - 使用示例

## 使用示例

### 创建接口

1. 编辑连接器，启用**接口模式**
2. 设置接口编码：`check_employee_status`
3. 定义输入参数：
   ```json
   {
     "type": "object",
     "properties": {
       "employee_id": {"type": "string"},
       "department": {"type": "string"}
     },
     "required": ["employee_id"]
   }
   ```

### 配置步骤

在 HTTP 步骤的 Body 模板中使用入参：
```json
{
  "emp_id": "{{context.employee_id}}",
  "dept": "{{department}}",
  "query_time": "{{timestamp}}"
}
```

### 调用接口

```bash
# GET 方式
curl -X GET "http://localhost:8080/api/outbound/connector-interfaces/check_employee_status/invoke?employee_id=E001" \
  -H "Authorization: Bearer YOUR_TOKEN"

# POST 方式
curl -X POST "http://localhost:8080/api/outbound/connector-interfaces/check_employee_status/invoke" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "E001", "department": "IT"}'
```

### 返回结果

```json
{
  "success": true,
  "data": {
    "employee_id": "E001",
    "status": "active",
    "name": "张三",
    "department_name": "信息技术部"
  },
  "duration_ms": 156,
  "step_count": 3
}
```

## 核心变化总结

| 方面 | 改进前 | 改进后 |
|-----|-------|-------|
| 入参处理 | 手动配置，不完整 | 自动映射到 context |
| HTTP 方法 | 仅 POST | GET、POST、PUT、DELETE、PATCH |
| 参数来源 | 仅 Body | URL query + Body 智能合并 |
| Context 结构 | device 为中心 | 接口入参为中心 |
| 系统变量 | 基础变量 | 增加 HTTP 元信息、时间戳 |
| 占位符引用 | 单一方式 | 支持 `{{xxx}}` 和 `{{context.xxx}}` |

## 兼容性说明

- ✅ 向后兼容：原有的 POST 调用方式 `/call` 仍然可用
- ✅ 触发模式不受影响：device_event 相关字段在触发模式下仍然可用
- ✅ 现有连接器无需修改：已配置的连接器继续正常工作

## 后续优化方向

1. **条件步骤增强**：完善 JavaScript 表达式引擎，支持复杂条件判断
2. **连接器链式调用**：实现 `call_connector` 步骤类型
3. **参数验证**：根据 `input_params_json` 自动验证入参
4. **返回值映射**：根据 `output_schema_json` 格式化返回数据
5. **Mock 模式**：在编辑页面提供接口调试功能

## 相关文件

### 后端
- `server/api/connector_interface.go` - 核心实现
- `server/api/connector_interface_test.go` - 测试用例
- `server/api/router.go` - 路由配置
- `server/models/outbound.go` - 数据模型

### 前端
- `web/src/views/OutboundConnectorEdit.vue` - 编辑界面

### 文档
- `docs/connector-interface-usage.md` - 完整使用指南
- `docs/connector-interface-context-mapping.md` - Context 映射说明

## 验证清单

- [x] 接口入参自动映射到 context
- [x] 支持 GET、POST、PUT、DELETE、PATCH 方法
- [x] URL 参数和 Body 参数正确合并
- [x] HTTP 元信息变量可用
- [x] 系统变量正常工作
- [x] Context 数据结构合理
- [x] 前端界面说明更新
- [x] 测试用例覆盖核心逻辑
- [x] 文档完整准确
- [x] 向后兼容性保证

---

**提交者：** Claude (Kiro)  
**日期：** 2026-06-09  
**版本：** v1.0
