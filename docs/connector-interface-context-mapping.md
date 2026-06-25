# 连接器接口模式 Context 映射说明

## 核心改进

### 1. 接口入参自动映射到 Context

接口模式下，所有入参会自动作为 context 占位符的初始值：

```go
// 输入参数
params := map[string]interface{}{
    "employee_id": "E001",
    "department": "IT",
    "status": "active",
}

// 自动映射到 context
ctx.context["employee_id"] = "E001"
ctx.vars["employee_id"] = "E001"          // 支持 {{employee_id}}
ctx.vars["context.employee_id"] = "E001"  // 支持 {{context.employee_id}}
```

### 2. 支持多种 HTTP 方法

新增通用调用端点，支持 GET、POST、PUT、DELETE、PATCH：

```
GET    /api/outbound/connector-interfaces/:code/invoke
POST   /api/outbound/connector-interfaces/:code/invoke
PUT    /api/outbound/connector-interfaces/:code/invoke
DELETE /api/outbound/connector-interfaces/:code/invoke
PATCH  /api/outbound/connector-interfaces/:code/invoke
```

### 3. URL 参数与 Body 参数合并

- GET 请求：从 URL query string 提取参数
- POST/PUT/PATCH：合并 query + body 参数（body 优先）
- 参数自动注入到 context

**示例：**

```bash
# GET 请求 - URL 参数
GET /api/outbound/connector-interfaces/check_employee/invoke?employee_id=E001

# POST 请求 - Body 参数
POST /api/outbound/connector-interfaces/check_employee/invoke
{"employee_id": "E001", "department": "IT"}

# 混合 - Body 覆盖同名 Query
POST /api/outbound/connector-interfaces/check_employee/invoke?employee_id=E001
{"employee_id": "E002"}  # 最终 employee_id = E002
```

### 4. HTTP 元信息变量

系统自动添加 HTTP 相关变量：

```go
ctx.vars["http.method"] = "GET"
ctx.vars["http.path"] = "/api/outbound/connector-interfaces/check_employee/invoke"
ctx.vars["http.query"] = "employee_id=E001"
```

在步骤中可使用：
- `{{http.method}}`
- `{{http.path}}`
- `{{http.query}}`

### 5. 系统变量增强

```go
ctx.vars["timestamp"] = time.Now().Unix()
ctx.vars["timestamp_ms"] = time.Now().UnixMilli()

// 可选（仅当提供时）
ctx.vars["deviceid"] = deviceID
ctx.vars["device.id"] = deviceID
ctx.vars["userid"] = userID
ctx.vars["user.id"] = userID
```

## Context 占位符使用

### 在 HTTP 步骤的 Body 模板

```json
{
  "emp_id": "{{context.employee_id}}",
  "dept": "{{department}}",
  "method": "{{http.method}}",
  "ts": "{{timestamp}}"
}
```

### 在数据接口步骤的参数映射

| 参数名 | Source | Value |
|--------|--------|-------|
| employee_id | context | employee_id |
| department | var | {{context.department}} |
| timestamp | fixed | 固定值 |

### 在消息提醒步骤

```
员工查询：
ID: {{context.employee_id}}
部门: {{department}}
方法: {{http.method}}
```

## 代码实现

### 后端核心逻辑

**文件：** `server/api/connector_interface.go`

```go
// CallConnectorInterfaceByCode - 通用调用入口
func CallConnectorInterfaceByCode(c *gin.Context) {
    code := c.Param("code")
    params := make(map[string]interface{})
    
    // 1. 提取 URL 参数
    for k, v := range c.Request.URL.Query() {
        if len(v) == 1 {
            params[k] = v[0]
        } else {
            params[k] = v
        }
    }
    
    // 2. 提取 Body 参数（覆盖同名 query）
    if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "PATCH" {
        var bodyParams map[string]interface{}
        if err := c.ShouldBindJSON(&bodyParams); err == nil {
            for k, v := range bodyParams {
                params[k] = v
            }
        }
    }
    
    // 3. 添加 HTTP 元信息
    params["_http_method"] = c.Request.Method
    params["_http_path"] = c.Request.URL.Path
    params["_http_query"] = c.Request.URL.RawQuery
    
    // 4. 执行连接器
    result, err := executeConnectorInterface(&connector, params, deviceID, userID)
    // ...
}

// executeConnectorInterface - 初始化 context
func executeConnectorInterface(...) {
    ctx := &connectorExecutionContext{
        vars:    make(map[string]interface{}),
        context: make(map[string]interface{}),
    }
    
    // 参数映射到 context
    for k, v := range params {
        ctx.context[k] = v
        ctx.vars["context."+k] = v
        ctx.vars[k] = v
    }
    
    // HTTP 变量
    if method, ok := params["_http_method"].(string); ok {
        ctx.vars["http.method"] = method
    }
    // ...
}
```

### 路由配置

**文件：** `server/api/router.go`

```go
// 通用调用入口（支持多种 HTTP 方法）
obBase.GET("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.POST("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.PUT("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.DELETE("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.PATCH("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
```

### 前端界面更新

**文件：** `web/src/views/OutboundConnectorEdit.vue`

更新了接口调用说明，展示：
- 通用调用方式（支持 GET/POST/PUT/DELETE）
- URL 参数和 Body 参数用法
- Context 占位符引用提示

## 测试用例

**文件：** `server/api/connector_interface_test.go`

包含以下测试：
1. `TestConnectorInterfaceContextMapping` - context 映射验证
2. `TestHTTPParamsExtraction` - HTTP 参数提取和合并
3. `TestContextPlaceholderUsage` - 占位符使用场景

## 使用示例

### 创建员工状态查询接口

1. **配置接口**：
   - 接口编码：`check_employee_status`
   - 输入参数：`employee_id` (必填), `department` (可选)

2. **配置步骤**：
   - HTTP 步骤调用第三方 API
   - Body 模板：`{"emp_id": "{{context.employee_id}}"}`
   - 执行后：将响应写入 context ✓

3. **调用接口**：
   ```bash
   # GET 方式
   curl "http://localhost:8080/api/outbound/connector-interfaces/check_employee_status/invoke?employee_id=E001"
   
   # POST 方式
   curl -X POST ".../invoke" -d '{"employee_id":"E001","department":"IT"}'
   ```

4. **返回结果**：
   ```json
   {
     "success": true,
     "data": {
       "employee_id": "E001",
       "status": "active",
       "name": "张三"
     },
     "duration_ms": 120,
     "step_count": 2
   }
   ```

## 注意事项

1. **接口模式下无 device_event 相关字段**：
   - 不包含 `device_event.event_data`
   - 不包含 `definition` 相关字段
   - Context 完全基于接口入参

2. **占位符命名冲突**：
   - 入参名称应避免使用保留字（如 `http`, `timestamp`）
   - 建议使用业务相关的明确命名

3. **参数类型**：
   - URL 参数默认为字符串
   - Body 参数保持原始类型（字符串、数字、布尔、对象、数组）

4. **设备关联**（可选）：
   - 通过 `X-Device-ID` header 传递设备 ID
   - 仅当需要设备上下文时使用

## 相关文档

- 完整使用指南：`docs/connector-interface-usage.md`
- 连接器编辑界面：Web 管理后台 → 出站 → 连接器 → 编辑
- API 参考：`server/api/connector_interface.go`
