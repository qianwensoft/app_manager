# 工单分享链接认证模式功能实现总结

## 实现概述

为工单分享链接添加了**免登录模式（public）**和**需登录模式（login）**两种认证方式，支持细粒度的权限控制。

## 完成的工作

### 1. 数据库模型更新

**文件**: `server/models/work_order.go`

为 `WorkOrderReportShare` 模型添加了两个新字段：
- `AuthMode` (string): 认证模式，默认 "public"（免登录）或 "login"（需登录）
- `Permissions` (string): 需登录模式的权限配置（JSON 对象）

权限配置包括：
```json
{
  "can_view": true,           // 可查看工单详情
  "can_comment": true,         // 可添加评论  
  "can_update_status": true,   // 可更新工单状态
  "can_update_fields": false   // 可更新工单字段（标题、描述、优先级）
}
```

### 2. 数据库迁移脚本

创建了迁移脚本来添加新字段：
- MySQL: `server/migrations/mysql/007_add_work_order_share_auth_mode.sql`
- SQLite: `server/migrations/sqlite/007_add_work_order_share_auth_mode.sql`

### 3. 后端 API 更新

#### 修改的现有 API

**文件**: `server/api/work_order.go`

- `CreateWorkOrderReportShare`: 支持创建时指定认证模式和权限配置
- `GetWorkOrderReportShare`: 返回认证模式和登录状态信息
- `GetSharedWorkOrders`: 需登录模式下检查用户认证状态
- `GetSharedWorkOrderStatistics`: 需登录模式下检查用户认证状态
- `GetSharedWorkOrderProgress`: 需登录模式下检查用户认证状态（已存在）

#### 新增 API

**文件**: `server/api/work_order_share_auth.go`

- `checkSharePermission`: 检查分享链接权限的通用函数
- `GetSharedWorkOrderDetail`: 获取分享工单详情（需登录模式）
- `AddSharedWorkOrderComment`: 分享工单添加评论（需登录模式）
- `UpdateSharedWorkOrderStatus`: 分享工单更新状态（需登录模式）
- `UpdateSharedWorkOrderFields`: 分享工单更新字段（需登录模式）

### 4. 认证中间件

**文件**: `server/auth/middleware.go`

新增 `OptionalAuthMiddleware` 函数：
- 支持可选认证（既可以免登录访问，也可以登录后访问）
- 如果提供 JWT token 则解析用户信息，否则放行但不设置用户信息

### 5. 路由配置

**文件**: `server/api/router.go`

更新路由配置，所有工单分享相关的 API 都使用 `OptionalAuthMiddleware`：
```go
r.GET("/api/share/work-order-reports/:token", auth.OptionalAuthMiddleware(), GetWorkOrderReportShare)
r.GET("/api/share/work-order-reports/:token/work-orders", auth.OptionalAuthMiddleware(), GetSharedWorkOrders)
r.GET("/api/share/work-order-reports/:token/statistics", auth.OptionalAuthMiddleware(), GetSharedWorkOrderStatistics)
// 需登录模式特有的 API
r.GET("/api/share/work-order-reports/:token/work-orders/:id/detail", auth.OptionalAuthMiddleware(), GetSharedWorkOrderDetail)
r.POST("/api/share/work-order-reports/:token/work-orders/:id/comment", auth.OptionalAuthMiddleware(), AddSharedWorkOrderComment)
r.POST("/api/share/work-order-reports/:token/work-orders/:id/status", auth.OptionalAuthMiddleware(), UpdateSharedWorkOrderStatus)
r.PUT("/api/share/work-order-reports/:token/work-orders/:id/fields", auth.OptionalAuthMiddleware(), UpdateSharedWorkOrderFields)
```

### 6. 前端界面更新

#### 分享管理页面

**文件**: `web/src/views/work-orders/WorkOrderReportShareManage.vue`

添加了认证模式和权限配置的显示：
- 显示"免登录"或"需登录"标签
- 需登录模式显示权限配置（查看、评论、改状态、改字段）

#### 统计报告分享对话框

**文件**: `web/src/components/WorkOrderStatsDialog.vue`

添加了创建分享链接时的认证模式选择：
- 单选框选择"免登录"或"需登录"模式
- 需登录模式下显示权限配置复选框
- 生成链接时将认证模式和权限配置发送到后端

### 7. 文档和测试

创建了以下文档：
- `docs/WORK_ORDER_SHARE_AUTH.md`: 功能使用文档
- `server/test_work_order_share_auth.sh`: API 测试脚本

### 8. Bug 修复

修复了 `server/api/form_app.go:833` 的语法错误（缺少 `[]`）

## API 端点汇总

### 创建分享链接
**POST** `/api/work-order-reports/shares`
- 需要认证（JWT）
- 新增参数：`auth_mode`（"public"|"login"）、`permissions`

### 免登录和需登录都支持的 API
- **GET** `/api/share/work-order-reports/:token` - 获取分享信息
- **GET** `/api/share/work-order-reports/:token/work-orders` - 获取工单列表
- **GET** `/api/share/work-order-reports/:token/statistics` - 获取统计报告
- **GET** `/api/share/work-order-reports/:token/work-orders/:id/progress` - 获取工单进展

### 需登录模式专用 API
- **GET** `/api/share/work-order-reports/:token/work-orders/:id/detail` - 获取工单详情
- **POST** `/api/share/work-order-reports/:token/work-orders/:id/comment` - 添加评论
- **POST** `/api/share/work-order-reports/:token/work-orders/:id/status` - 更新状态
- **PUT** `/api/share/work-order-reports/:token/work-orders/:id/fields` - 更新字段

## 使用场景

### 免登录模式（public）
- 公开报告展示
- 临时分享给外部人员查看
- 不涉及敏感信息的工单统计
- 只读访问

### 需登录模式（login）
- 需要身份验证的协作场景
- 允许外部人员参与工单处理
- 支持第三方系统集成（通过 JWT）
- 细粒度权限控制
- 所有操作记录操作人信息
- 支持第三方平台 SSO 登录

## 安全特性

1. **JWT 认证**: 需登录模式使用标准 JWT token 进行身份验证
2. **权限控制**: 通过 `permissions` 配置细粒度的操作权限
3. **范围限制**: 所有操作仅限分享链接中 `filters` 定义的工单范围
4. **过期时间**: 分享链接支持设置过期时间
5. **审计日志**: 所有操作都会记录在工单活动时间线中

## 后续工作建议

1. **前端分享页面**: 创建独立的分享页面来展示工单报告（`/work-order-report-share/:token`）
2. **第三方登录集成**: 实现企业微信、钉钉等第三方平台的 SSO 登录流程
3. **权限细化**: 可以进一步细化权限，如按工单类型、状态等维度控制权限
4. **通知功能**: 工单状态变更时通知相关人员
5. **数据导出**: 支持导出分享范围内的工单数据

## 测试方法

1. 运行后端编译测试：
```bash
cd server
go build
```

2. 运行 API 测试脚本（需要先启动服务并获取有效 JWT token）：
```bash
cd server
chmod +x test_work_order_share_auth.sh
# 编辑脚本，填入实际的 JWT token
./test_work_order_share_auth.sh
```

3. 前端测试：
- 创建工单报告统计
- 点击"生成分享链接"
- 选择"需登录"模式并配置权限
- 生成链接后在无痕窗口测试免登录和登录两种场景

## 兼容性说明

- 现有的免登录分享链接会自动使用 `auth_mode='public'` 默认值，保持向后兼容
- 数据库迁移脚本会为现有记录添加默认值
- 前端界面会根据 `auth_mode` 字段自动适配显示
