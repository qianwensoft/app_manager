# Refresh Token 自动刷新与审计日志实现

## 概述

本次改动实现了以下功能：
1. 登录时返回 `refresh_token`，有效期 30 天
2. 前端在 token 快到期前（5 分钟内）自动调用 refresh token 接口
3. 后端为登录、token 刷新等操作增加审计日志，记录设备信息（IP、User-Agent）

## 后端改动

### 1. 模型增强 (`server/models/models.go`)

为 `AuditLog` 模型添加 `UserAgent` 字段：

```go
type AuditLog struct {
    ID        uint      `gorm:"primaryKey" json:"id"`
    UserID    uint      `json:"user_id"`
    DeviceID  *uint     `json:"device_id"`
    Action    string    `gorm:"size:100" json:"action"`
    Command   string    `gorm:"type:text" json:"command"`
    IPAddress string    `gorm:"size:50" json:"ip_address"`
    UserAgent string    `gorm:"size:500" json:"user_agent"`  // 新增
    Result    string    `gorm:"type:text" json:"result"`
    CreatedAt time.Time `json:"created_at"`
}
```

### 2. 审计日志记录 (`server/api/auth.go`)

为以下操作添加审计日志：

#### 登录成功
- Action: `login`
- Command: 用户名
- Result: `success`
- 记录: IP、User-Agent

#### 登录失败（用户不存在）
- Action: `login_failed`
- Command: 用户名
- Result: `user not found`
- 记录: IP、User-Agent
- UserID: 0

#### 登录失败（密码错误）
- Action: `login_failed`
- Command: 用户名
- Result: `invalid password`
- 记录: IP、User-Agent、UserID

#### Token 刷新成功
- Action: `refresh_token`
- Command: 用户名
- Result: `success`
- 记录: IP、User-Agent、UserID

#### Token 刷新失败（token 无效/过期）
- Action: `refresh_token_failed`
- Command: `invalid or expired token`
- Result: `unauthorized`
- 记录: IP、User-Agent
- UserID: 0

#### Token 刷新失败（用户不存在）
- Action: `refresh_token_failed`
- Command: `user not found`
- Result: `user not found`
- 记录: IP、User-Agent、UserID

### 3. 数据库迁移 (`server/database/migrate_audit_log_user_agent.go`)

添加迁移函数 `MigrateAuditLogUserAgent`，为已有的 `audit_logs` 表添加 `user_agent` 字段。

该迁移已添加到 `server/database/db.go` 的 `postMigrate` 列表中。

## 前端改动

### 1. Auth Store 增强 (`web/src/stores/auth.js`)

添加以下状态和方法：

```javascript
const refreshToken = ref(localStorage.getItem('refresh_token') || '')
const expiresAt = ref(parseInt(localStorage.getItem('expires_at') || '0'))

const refreshAccessToken = async () => {
  // 调用后端 /api/auth/refresh 接口
  // 更新 token、refreshToken、expiresAt
}
```

登录时保存 `refresh_token` 和 `expires_at` 到 localStorage。

### 2. HTTP 拦截器增强 (`web/src/api/http.js`)

#### 请求拦截器（自动刷新）

在每次请求前检查：
- 如果 token 将在 5 分钟内过期
- 且存在有效的 refresh_token
- 自动调用 `/api/auth/refresh` 刷新 token
- 使用新 token 继续原请求

#### 响应拦截器（401 重试）

遇到 401 错误时：
- 尝试使用 refresh_token 刷新
- 刷新成功后自动重试原请求
- 刷新失败则跳转登录页

#### 并发请求处理

使用队列机制处理并发请求中的 token 刷新：
- `isRefreshing` 标志防止重复刷新
- `refreshSubscribers` 队列保存等待中的请求
- 刷新完成后统一更新所有等待请求的 token

## API 接口

### 登录接口

**请求**: `POST /api/auth/login`
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应**:
```json
{
  "token": "eyJhbGc...",
  "expires_at": 1724234567,
  "refresh_token": "a1b2c3d4e5f6...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### Refresh Token 接口

**请求**: `POST /api/auth/refresh`
```json
{
  "refresh_token": "a1b2c3d4e5f6..."
}
```

**响应**:
```json
{
  "token": "eyJhbGc...",
  "expires_at": 1724234567,
  "refresh_token": "g7h8i9j0k1l2...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

## 安全特性

### Refresh Token 滚动更新

每次刷新 access token 时：
1. 旧的 refresh_token 被标记为 `revoked`
2. 生成新的 refresh_token（30 天有效期）
3. 返回新的 refresh_token 给客户端

这样可以：
- 防止 refresh_token 被窃取后长期使用
- 检测到异常刷新行为（旧 token 被多次使用）

### Token 过期时间

- Access Token: 默认 24 小时（可通过 `config.JWT.ExpireHour` 配置）
- Refresh Token: 固定 30 天
- 自动刷新触发时机: token 过期前 5 分钟

### 审计日志

所有认证相关操作都记录审计日志，包括：
- 用户 ID
- 操作类型（login, refresh_token, login_failed 等）
- IP 地址
- User-Agent（浏览器信息）
- 操作结果

便于安全审计和异常登录检测。

## 测试建议

### 手动测试

1. **登录测试**
   - 登录成功，检查返回的 refresh_token
   - 登录失败（错误密码），检查审计日志

2. **自动刷新测试**
   - 修改配置将 token 过期时间改为 6 分钟
   - 登录后等待 1-2 分钟
   - 发起任意 API 请求，观察网络请求
   - 应该看到自动调用 `/api/auth/refresh`

3. **401 重试测试**
   - 登录后手动清除 localStorage 中的 token
   - 保留 refresh_token
   - 发起 API 请求，应自动刷新并重试

4. **审计日志查询**
   ```sql
   SELECT * FROM audit_logs 
   WHERE action IN ('login', 'login_failed', 'refresh_token', 'refresh_token_failed')
   ORDER BY created_at DESC
   LIMIT 50;
   ```

### 前端测试要点

1. 在浏览器开发者工具 Application > Local Storage 中查看：
   - `token`
   - `refresh_token`
   - `expires_at`
   - `user`

2. 在 Network 标签中观察：
   - 登录请求返回 refresh_token
   - Token 快过期时自动调用 /auth/refresh
   - 401 错误时的重试逻辑

## 兼容性

- 后端向后兼容：旧客户端不使用 refresh_token 仍可正常工作
- 数据库迁移自动执行，无需手动干预
- 已有审计日志的 `user_agent` 字段为空，新日志会记录

## 部署注意事项

1. 数据库迁移会在服务启动时自动执行
2. 建议在低峰期部署，避免迁移期间的性能影响
3. SQLite 数据库迁移是串行的，MySQL 是并行的
4. 前端需要重新构建和部署（`make release`）

## 文件清单

### 后端
- `server/models/models.go` - 添加 UserAgent 字段
- `server/api/auth.go` - 添加审计日志记录
- `server/database/migrate_audit_log_user_agent.go` - 数据库迁移
- `server/database/db.go` - 注册迁移函数

### 前端
- `web/src/stores/auth.js` - 添加 refresh token 状态和方法
- `web/src/api/http.js` - 添加自动刷新和重试逻辑
