# 连接器接口模式完整实现总结 - 2026-06-09

## 需求回顾

**核心需求：**
> 连接器编辑 接口模式下相应的Context 需要按照接口入参开始 可以有必要的相关其他设计比如URL参数 接口要支持GET POST 等

## 实现概览

本次实现完整地完善了连接器接口模式的 Context 配置，包括后端逻辑、前端界面、文档和测试，使其能够：

1. ✅ 接口入参自动作为 Context 初始值
2. ✅ 支持 URL 参数（query string）
3. ✅ 支持 GET、POST、PUT、DELETE、PATCH 等多种 HTTP 方法
4. ✅ 智能合并 URL 参数和 Body 参数
5. ✅ 提供 HTTP 元信息变量
6. ✅ 前端清晰展示可用占位符
7. ✅ 提供测试功能验证 Context 映射

---

## 一、后端实现

### 1.1 核心逻辑改进

**文件：** `server/api/connector_interface.go`

#### Context 初始化
```go
// 将输入参数放入 context（以 context.* 形式供占位符使用）
for k, v := range params {
    ctx.context[k] = v
    ctx.vars["context."+k] = v
    // 同时支持 {{param_name}} 和 {{context.param_name}}
    ctx.vars[k] = v
}

// 添加 HTTP 相关变量
if method, ok := params["_http_method"].(string); ok {
    ctx.vars["http.method"] = method
}
if path, ok := params["_http_path"].(string); ok {
    ctx.vars["http.path"] = path
}
if query, ok := params["_http_query"].(string); ok {
    ctx.vars["http.query"] = query
}

// 添加时间戳
ctx.vars["timestamp"] = time.Now().Unix()
ctx.vars["timestamp_ms"] = time.Now().UnixMilli()
```

#### 数据结构优化
```go
type connectorExecutionContext struct {
    connector  *models.OutboundConnector
    params     map[string]interface{}
    deviceID   uint
    userID     uint
    vars       map[string]interface{} // 扁平化的占位符键值对
    context    map[string]interface{} // context 命名空间（业务数据）
    stepCount  int
    logs       []string
    phaseIndex map[uint]int
}
```

### 1.2 新增 API 端点

**通用调用入口：** `CallConnectorInterfaceByCode()`

支持的 HTTP 方法：
- `GET /api/outbound/connector-interfaces/:code/invoke`
- `POST /api/outbound/connector-interfaces/:code/invoke`
- `PUT /api/outbound/connector-interfaces/:code/invoke`
- `DELETE /api/outbound/connector-interfaces/:code/invoke`
- `PATCH /api/outbound/connector-interfaces/:code/invoke`

**参数处理逻辑：**
```go
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
```

### 1.3 路由配置

**文件：** `server/api/router.go`

```go
// 通用调用入口（支持多种 HTTP 方法）
obBase.GET("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.POST("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.PUT("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.DELETE("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
obBase.PATCH("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
```

### 1.4 测试覆盖

**文件：** `server/api/connector_interface_test.go`

测试用例：
1. `TestConnectorInterfaceContextMapping` - 参数到 context 映射
2. `TestHTTPParamsExtraction` - HTTP 参数提取和合并
3. `TestContextPlaceholderUsage` - 占位符使用场景

---

## 二、前端实现

### 2.1 接口占位符说明

**位置：** `web/src/views/OutboundConnectorEdit.vue:70-127`

添加了详细的占位符说明表格，包含：
- 接口入参占位符（两种引用方式）
- HTTP 信息变量
- 系统变量

**展示效果：**
```
┌─────────────┬──────────────────────────┬────────────────────┐
│   类别      │        占位符             │       说明         │
├─────────────┼──────────────────────────┼────────────────────┤
│ 接口入参    │ {{param_name}}           │ 直接引用参数名     │
│             │ {{context.param_name}}   │ 通过 context 引用  │
├─────────────┼──────────────────────────┼────────────────────┤
│ HTTP 信息   │ {{http.method}}          │ HTTP 方法          │
│             │ {{http.path}}            │ 请求路径           │
│             │ {{http.query}}           │ Query string       │
├─────────────┼──────────────────────────┼────────────────────┤
│ 系统变量    │ {{timestamp}}            │ Unix 时间戳（秒）  │
│             │ {{timestamp_ms}}         │ Unix 时间戳（毫秒）│
└─────────────┴──────────────────────────┴────────────────────┘
```

### 2.2 接口测试功能

**位置：** `web/src/views/OutboundConnectorEdit.vue:1104-1161`

**功能组成：**
1. **参数配置**
   - HTTP 方法选择
   - JSON 参数编辑器
   - 自动填充示例参数

2. **结果展示（三个标签页）**
   - Context 映射表
   - 执行结果
   - 完整响应

**JavaScript 实现：**
```javascript
// 状态定义
const interfaceTestDlg = reactive({
  visible: false,
  loading: false,
  method: 'POST',
  paramsJson: '',
  innerTab: 'context',
  result: null,
  contextRows: []
})

// 核心函数
function openInterfaceTest() { ... }
function fillInterfaceTestParams() { ... }
async function runInterfaceTest() { ... }
```

### 2.3 步骤配置优化

**位置：** `web/src/views/OutboundConnectorEdit.vue:505-534`

**改进：**
- 根据接口模式/触发模式动态显示不同说明
- 接口模式下隐藏 event_data 合并选项
- 提供清晰的占位符使用示例

### 2.4 API 集成

**文件：** `web/src/api/outbound.js`

```javascript
export const listConnectorInterfaces = (params) => 
  http.get('/outbound/connector-interfaces', { params })

export const callConnectorInterface = (data) => 
  http.post('/outbound/connector-interfaces/call', data)

export const callConnectorInterfaceByCode = (code, method, params) => {
  // 支持 GET/POST/PUT/DELETE
}
```

---

## 三、文档完善

### 3.1 完整使用指南

**文件：** `docs/connector-interface-usage.md`

**内容：**
- 接口模式配置步骤
- Context 占位符映射规则
- 多种调用方式示例
- 完整场景示例（员工状态查询）
- 常见问题解答

### 3.2 Context 映射说明

**文件：** `docs/connector-interface-context-mapping.md`

**内容：**
- 核心改进说明
- 代码实现细节
- 使用示例
- 注意事项

### 3.3 前端实现总结

**文件：** `docs/connector-interface-frontend-summary.md`

**内容：**
- 前端改进详情
- 用户体验改进
- 技术实现细节
- 测试建议

### 3.4 更新日志

**文件：** `docs/changelog/CHANGELOG-CONNECTOR-INTERFACE-2026-06-09.md`

**内容：**
- 功能概述
- 主要改进（6 项）
- 使用示例
- 验证清单

---

## 四、使用示例

### 4.1 创建接口

1. **编辑连接器**，启用接口模式
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

### 4.2 配置步骤

在 HTTP 步骤的 Body 模板中：
```json
{
  "emp_id": "{{context.employee_id}}",
  "dept": "{{department}}",
  "query_time": "{{timestamp}}",
  "method": "{{http.method}}"
}
```

### 4.3 调用接口

**GET 方式：**
```bash
curl -X GET "http://localhost:8080/api/outbound/connector-interfaces/check_employee_status/invoke?employee_id=E001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**POST 方式：**
```bash
curl -X POST "http://localhost:8080/api/outbound/connector-interfaces/check_employee_status/invoke" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "E001", "department": "IT"}'
```

### 4.4 返回结果

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

---

## 五、占位符映射规则

### 5.1 接口入参

| 入参 | 占位符方式1 | 占位符方式2 | 说明 |
|-----|-----------|-----------|------|
| employee_id | `{{employee_id}}` | `{{context.employee_id}}` | 支持两种引用 |
| department | `{{department}}` | `{{context.department}}` | 推荐使用 context.* |

### 5.2 HTTP 变量

| 变量 | 说明 | 示例值 |
|-----|------|--------|
| `{{http.method}}` | HTTP 方法 | GET, POST, PUT |
| `{{http.path}}` | 请求路径 | /api/outbound/connector-interfaces/xxx/invoke |
| `{{http.query}}` | Query string | employee_id=E001&dept=IT |

### 5.3 系统变量

| 变量 | 说明 |
|-----|------|
| `{{timestamp}}` | Unix 时间戳（秒） |
| `{{timestamp_ms}}` | Unix 时间戳（毫秒） |
| `{{userid}}` | 调用用户 ID（可选） |
| `{{deviceid}}` | 设备 ID（可选） |

---

## 六、核心改进对比

| 方面 | 改进前 | 改进后 |
|-----|-------|-------|
| 入参处理 | 手动配置，不完整 | 自动映射到 context |
| HTTP 方法 | 仅 POST | GET、POST、PUT、DELETE、PATCH |
| 参数来源 | 仅 Body | URL query + Body 智能合并 |
| Context 结构 | device 为中心 | 接口入参为中心 |
| 系统变量 | 基础变量 | 增加 HTTP 元信息、时间戳 |
| 占位符引用 | 单一方式 | 支持 {{xxx}} 和 {{context.xxx}} |
| 前端说明 | 简单文案 | 详细表格 + 示例 |
| 测试功能 | 无 | 完整测试对话框 |

---

## 七、文件清单

### 后端文件
- ✅ `server/api/connector_interface.go` - 核心实现（新增/修改）
- ✅ `server/api/connector_interface_test.go` - 测试用例（新增）
- ✅ `server/api/router.go` - 路由配置（修改）
- ✅ `server/models/outbound.go` - 数据模型（已有）

### 前端文件
- ✅ `web/src/views/OutboundConnectorEdit.vue` - 主界面（修改）
- ✅ `web/src/api/outbound.js` - API 方法（新增）

### 文档文件
- ✅ `docs/connector-interface-usage.md` - 完整使用指南（新增）
- ✅ `docs/connector-interface-context-mapping.md` - Context 映射说明（新增）
- ✅ `docs/connector-interface-frontend-summary.md` - 前端实现总结（新增）
- ✅ `docs/changelog/CHANGELOG-CONNECTOR-INTERFACE-2026-06-09.md` - 更新日志（新增）

---

## 八、验证清单

- [x] 接口入参自动映射到 context
- [x] 支持 GET、POST、PUT、DELETE、PATCH 方法
- [x] URL 参数和 Body 参数正确合并
- [x] HTTP 元信息变量可用
- [x] 系统变量正常工作
- [x] Context 数据结构合理
- [x] 前端占位符说明完整
- [x] 前端测试功能可用
- [x] 步骤配置区域优化
- [x] API 方法完整
- [x] 测试用例覆盖核心逻辑
- [x] 文档完整准确
- [x] 向后兼容性保证

---

## 九、兼容性说明

✅ **向后兼容**
- 原有的 POST 调用方式 `/call` 仍然可用
- 触发模式下 device_event 相关字段不受影响
- 已配置的连接器无需修改继续工作

---

## 十、后续优化方向

### 10.1 条件步骤增强
- 完善 JavaScript 表达式引擎
- 支持复杂条件判断

### 10.2 连接器链式调用
- 实现 `call_connector` 步骤类型
- 支持连接器间相互调用

### 10.3 参数验证
- 根据 `input_params_json` 自动验证入参
- 提供友好的错误提示

### 10.4 返回值映射
- 根据 `output_schema_json` 格式化返回数据
- 支持字段过滤和重命名

### 10.5 前端增强
- 实时占位符提示（输入 `{{` 时显示列表）
- 占位符自动完成
- 历史测试记录
- 占位符验证和高亮

---

## 总结

本次实现完整地满足了需求，实现了：

1. ✅ **Context 按接口入参开始** - 所有入参自动成为 context 初始值
2. ✅ **支持 URL 参数** - GET 请求通过 query string 传参
3. ✅ **支持多种 HTTP 方法** - GET、POST、PUT、DELETE、PATCH
4. ✅ **参数智能合并** - URL + Body 参数自动合并
5. ✅ **完善的前端界面** - 占位符说明 + 测试功能
6. ✅ **完整的文档** - 使用指南、实现说明、测试建议

**用户价值：**
- 快速了解接口模式下的 context 结构
- 通过测试功能验证占位符配置
- 实时查看参数映射关系
- 降低学习成本，提高开发效率

**技术价值：**
- 清晰的代码结构
- 完整的测试覆盖
- 详细的文档说明
- 良好的扩展性

---

**提交者：** Claude (Kiro)  
**日期：** 2026-06-09  
**版本：** v1.0  
**状态：** ✅ 已完成
