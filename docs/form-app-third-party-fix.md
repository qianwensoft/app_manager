# Form-App 第三方接口修正 - 2026-06-09

## 问题

之前的实现中，"第三方应用接口"指的是新创建的 `ThirdPartyApiEndpoint`，但用户实际需要的是使用已经在"出站连接器"（Outbound）中配置好的**外部应用接口**（`OutboundEndpoint`）。

## 解决方案

### 1. 前端修改

#### 修改接口类型定义
- 将 `third_party_endpoint_code` 改为 `third_party_endpoint_id`（使用 ID 而不是 code）

#### 加载外部应用接口列表
```typescript
// 从 /api/outbound/endpoints 加载
const loadThirdPartyEndpoints = async () => {
  const res = await authed('/api/outbound/endpoints?page_size=500', 'GET')
  const list = Array.isArray(res.data) ? res.data : []
  setThirdPartyEndpointOptions(list.map((it: any) => ({
    value: String(it.id),           // 使用 ID 作为值
    label: `${it.name}${it.app?.name ? ` [${it.app.name}]` : ''}`,  // 显示接口名称和应用名称
  })))
}
```

#### 运行时调用
```typescript
if (type === 'third_party') {
  // 调用外部应用接口
  const res = await authed(`/api/outbound/endpoints/${endpointId}/call`, 'POST', {
    param_values: paramValues,
  })
  return res.data || {}
}
```

### 2. 后端新增 API

#### 创建专用调用接口
**文件**：`server/api/outbound_endpoint_call.go`

**路由**：`POST /api/outbound/endpoints/:id/call`

**功能**：
- 加载 OutboundEndpoint 和关联的 OutboundApp
- 处理应用级认证（static_header、dynamic_bearer）
- 动态 token 管理（使用现有的 `outbound.GetOrRefreshToken`）
- 占位符替换（简化版）
- 执行 HTTP 调用并返回结果

**请求**：
```json
{
  "param_values": {
    "employee_id": "E001234",
    "dept_id": "D001"
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "employee_name": "张三",
    "position": "工程师"
  },
  "status_code": 200,
  "duration_ms": 125
}
```

### 3. 路由注册

在 `server/api/router.go` 中注册：
```go
// 外部应用接口调用（所有认证用户可调用）
obBase.POST("/endpoints/:id/call", CallOutboundEndpoint)
```

## 使用流程

### 1. 配置外部应用和接口

在"出站连接器"模块中：
1. 创建外部应用（OutboundApp）
   - 配置 BaseURL
   - 配置认证方式（static_header、dynamic_bearer 等）
2. 创建接口（OutboundEndpoint）
   - 配置路径、方法、请求头
   - 配置请求体模板（支持 `{{placeholder}}`）

### 2. 在 form-app 中使用

在页面编辑器的扫码模块中：
1. 接口类型选择"第三方应用接口"
2. 从下拉列表选择已配置的接口
   - 显示格式：`接口名称 [应用名称]`
3. 配置扫码值参数名
4. 配置额外参数和结果映射

### 3. 运行时调用

用户扫码时：
1. 系统自动调用选择的 OutboundEndpoint
2. 使用配置的认证方式
3. 传递扫码值和表单字段作为参数
4. 返回结果自动回填到表单

## 优势

1. **复用现有配置**：利用已经配置好的外部应用和接口
2. **统一认证管理**：复用 Outbound 模块的认证机制
3. **Token 自动管理**：支持 dynamic_bearer 的 token 刷新
4. **灵活的模板**：支持 BodyTemplate 中的占位符替换

## 与之前实现的区别

| 特性 | 旧实现（ThirdPartyApiEndpoint） | 新实现（OutboundEndpoint） |
|------|-------------------------------|---------------------------|
| 配置位置 | 新建的第三方接口管理 | 出站连接器模块 |
| 认证方式 | OAuth 自动管理 | 支持多种认证（static_header、dynamic_bearer） |
| 复用性 | 独立配置 | 复用现有配置 |
| 适用场景 | 简单的第三方 API | 复杂的外部应用集成 |

## 文件清单

### 新增
- `server/api/outbound_endpoint_call.go`

### 修改
- `form-app/src/pages/PageEditorPage.tsx`（接口类型定义、加载逻辑）
- `form-app/src/runtime/FormRenderer.tsx`（运行时处理）
- `form-app/src/runtime/MultiPageRuntime.tsx`（调用路由）
- `server/api/router.go`（路由注册）

## 测试

- ✅ 前端编译通过
- ✅ 接口列表正确加载（显示接口名称和应用名称）
- ✅ 运行时调用路由到正确的 API

## 后续优化

1. **占位符替换增强**：使用完整的模板引擎（与 Outbound 模块保持一致）
2. **错误处理**：更详细的错误信息和重试机制
3. **响应转换**：支持 ResponseTransform 脚本
4. **调用日志**：记录每次调用的详细信息

---

**修改日期**：2026-06-09  
**状态**：✅ 完成并验证
