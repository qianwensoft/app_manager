# 工单分享链接认证模式功能

## 概述

工单分享链接新增了两种认证模式：
- **免登录模式（public）**：任何人通过链接都可以查看工单信息，无需登录
- **需登录模式（login）**：需要用户登录后才能访问工单详情，并支持细粒度权限控制

## 数据模型变更

### WorkOrderReportShare 表新增字段

- `auth_mode` (varchar(16)): 认证模式，默认 "public"
  - `public`: 免登录模式
  - `login`: 需登录模式
  
- `permissions` (text): 需登录模式的权限配置（JSON 对象）
  ```json
  {
    "can_view": true,           // 可查看工单详情
    "can_comment": true,         // 可添加评论
    "can_update_status": true,   // 可更新工单状态
    "can_update_fields": false   // 可更新工单字段（标题、描述、优先级）
  }
  ```

## API 端点

### 创建分享链接

**POST** `/api/work-order-reports/shares`

需要认证（JWT）

请求体：
```json
{
  "title": "工单报告分享",
  "filters": {
    "status": "open",
    "type_code": "bug"
  },
  "expires_in": 168,  // 小时
  "auth_mode": "login",  // "public" | "login"
  "permissions": {
    "can_view": true,
    "can_comment": true,
    "can_update_status": true,
    "can_update_fields": false
  }
}
```

### 获取分享信息

**GET** `/api/share/work-order-reports/:token`

可选认证（支持 JWT）

- 免登录模式：无需认证即可访问
- 需登录模式：返回基本信息，前端可判断 `is_authenticated` 决定是否显示登录提示

### 获取工单列表

**GET** `/api/share/work-order-reports/:token/work-orders`

可选认证（支持 JWT）

- 免登录模式：无需认证即可访问
- 需登录模式：必须提供有效 JWT，否则返回 401

### 需登录模式特有的 API

以下 API 仅在需登录模式下可用，需要提供有效 JWT：

#### 获取工单详情

**GET** `/api/share/work-order-reports/:token/work-orders/:id/detail`

权限要求：`can_view: true`

#### 添加评论

**POST** `/api/share/work-order-reports/:token/work-orders/:id/comment`

权限要求：`can_comment: true`

请求体：
```json
{
  "comment": "评论内容"
}
```

#### 更新工单状态

**POST** `/api/share/work-order-reports/:token/work-orders/:id/status`

权限要求：`can_update_status: true`

请求体：
```json
{
  "status": "in_progress",
  "comment": "开始处理"
}
```

#### 更新工单字段

**PUT** `/api/share/work-order-reports/:token/work-orders/:id/fields`

权限要求：`can_update_fields: true`

请求体：
```json
{
  "title": "新标题",
  "description": "新描述",
  "priority": "high"
}
```

## 使用场景

### 免登录模式（public）

适用于：
- 公开报告展示
- 临时分享给外部人员查看
- 不涉及敏感信息的工单统计

特点：
- 任何人通过链接都可以查看
- 只读访问，不能进行任何操作
- 适合快速分享

### 需登录模式（login）

适用于：
- 需要身份验证的协作场景
- 允许外部人员参与工单处理
- 支持第三方系统集成（通过 JWT）

特点：
- 必须登录才能访问
- 支持细粒度权限控制
- 所有操作记录操作人信息
- 支持第三方平台 SSO 登录

## 前端集成

### 判断认证状态

```javascript
// 获取分享信息
const response = await fetch(`/api/share/work-order-reports/${token}`, {
  headers: {
    'Authorization': `Bearer ${jwtToken}` // 可选
  }
});
const data = await response.json();

if (data.data.auth_mode === 'login' && !data.data.is_authenticated) {
  // 显示登录提示
  showLoginPrompt();
}
```

### 第三方登录流程

1. 用户访问分享链接，检测到需要登录
2. 前端重定向到第三方登录页面（如企业微信、钉钉等）
3. 第三方登录成功后回调，获取 JWT token
4. 使用 JWT token 访问分享链接的工单数据和操作 API

### 操作示例

```javascript
// 添加评论
await fetch(`/api/share/work-order-reports/${token}/work-orders/${woId}/comment`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    comment: '已处理完成'
  })
});

// 更新状态
await fetch(`/api/share/work-order-reports/${token}/work-orders/${woId}/status`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'resolved',
    comment: '问题已解决'
  })
});
```

## 安全考虑

1. **JWT 认证**：需登录模式使用标准 JWT token 进行身份验证
2. **权限控制**：通过 `permissions` 配置细粒度的操作权限
3. **范围限制**：所有操作仅限分享链接中 `filters` 定义的工单范围
4. **过期时间**：分享链接支持设置过期时间
5. **审计日志**：所有操作都会记录在工单活动时间线中

## 数据库迁移

执行迁移脚本：
- MySQL: `server/migrations/mysql/007_add_work_order_share_auth_mode.sql`
- SQLite: `server/migrations/sqlite/007_add_work_order_share_auth_mode.sql`

## 测试

运行测试脚本：
```bash
cd server
chmod +x test_work_order_share_auth.sh
./test_work_order_share_auth.sh
```
