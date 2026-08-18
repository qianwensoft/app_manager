# 变更日志 - 工单分享链接认证模式

## 版本信息
- **功能**: 工单分享链接认证模式
- **日期**: 2026-07-07
- **类型**: 功能增强

## 新增功能

### 1. 分享链接认证模式

为工单报告分享链接添加了两种认证模式：

#### 免登录模式（public）
- 任何人通过链接都可以查看工单信息
- 无需登录
- 只读访问
- 适合公开报告展示

#### 需登录模式（login）
- 必须登录后才能访问
- 支持细粒度权限控制
- 所有操作记录操作人
- 支持第三方平台 SSO 登录

### 2. 权限控制

需登录模式支持以下权限配置：
- ✅ **查看工单详情**（默认权限，无法关闭）
- ☑️ **添加评论**：可以在工单中添加评论和进展记录
- ☑️ **更新工单状态**：可以将工单状态变更为其他状态
- ☑️ **更新工单字段**：可以修改工单标题、描述、优先级等字段

### 3. 新增 API 接口

需登录模式下新增以下 API：
- `GET /api/share/work-order-reports/:token/work-orders/:id/detail` - 获取工单详情
- `POST /api/share/work-order-reports/:token/work-orders/:id/comment` - 添加评论
- `POST /api/share/work-order-reports/:token/work-orders/:id/status` - 更新状态
- `PUT /api/share/work-order-reports/:token/work-orders/:id/fields` - 更新字段

## 变更说明

### 数据库变更

**表**: `work_order_report_shares`

新增字段：
- `auth_mode` VARCHAR(16): 认证模式，默认 'public'
- `permissions` TEXT: 权限配置（JSON 格式）

**迁移脚本**:
- MySQL: `server/migrations/mysql/007_add_work_order_share_auth_mode.sql`
- SQLite: `server/migrations/sqlite/007_add_work_order_share_auth_mode.sql`

### 后端变更

**新增文件**:
- `server/api/work_order_share_auth.go` - 需登录模式的工单操作 API

**修改文件**:
- `server/models/work_order.go` - 添加新字段
- `server/api/work_order.go` - 更新分享链接创建和访问逻辑
- `server/auth/middleware.go` - 添加可选认证中间件
- `server/api/router.go` - 更新路由配置

### 前端变更

**修改文件**:
- `web/src/views/work-orders/WorkOrderReportShareManage.vue` - 显示认证模式和权限配置
- `web/src/components/WorkOrderStatsDialog.vue` - 添加认证模式选择和权限配置

### Bug 修复

- 修复 `server/api/form_app.go:833` 的语法错误（缺少 `[]`）

## 向后兼容性

✅ **完全向后兼容**

- 现有的分享链接会自动使用免登录模式（`auth_mode='public'`）
- 数据库迁移脚本为现有记录设置默认值
- API 保持向后兼容，新参数为可选参数
- 前端界面根据 `auth_mode` 自动适配

## 升级指南

### 1. 停止服务

```bash
# 停止正在运行的服务
pkill -f app-manager
```

### 2. 备份数据库

```bash
# SQLite
cp data/app-manager.db data/app-manager.db.backup

# MySQL
mysqldump -u root -p app_manager > app_manager_backup.sql
```

### 3. 更新代码

```bash
git pull origin main
```

### 4. 编译后端

```bash
cd server
go build
```

### 5. 执行数据库迁移

**选项 A**: 启动服务自动迁移
```bash
./app-manager config.sqlite.yaml
```

**选项 B**: 手动执行迁移
```bash
# SQLite
sqlite3 data/app-manager.db < migrations/sqlite/007_add_work_order_share_auth_mode.sql

# MySQL
mysql -u root -p app_manager < migrations/mysql/007_add_work_order_share_auth_mode.sql
```

### 6. 更新前端

```bash
cd ../web
npm install
npm run build
```

### 7. 启动服务

```bash
cd ../server
./app-manager config.sqlite.yaml
```

### 8. 验证

访问工单管理页面，创建一个新的分享链接，验证新功能是否正常工作。

## 测试建议

### 功能测试

1. **创建免登录分享链接**
   - 创建工单统计报告
   - 生成免登录分享链接
   - 在无痕窗口访问，验证无需登录即可查看

2. **创建需登录分享链接**
   - 创建工单统计报告
   - 生成需登录分享链接，配置不同权限
   - 在无痕窗口访问，验证需要登录
   - 登录后验证权限控制是否正常

3. **权限验证**
   - 测试只有查看权限时，不能执行其他操作
   - 测试添加评论权限
   - 测试更新状态权限
   - 测试更新字段权限

### API 测试

运行测试脚本：
```bash
cd server
chmod +x test_work_order_share_auth.sh
# 编辑脚本，填入实际的 JWT token
./test_work_order_share_auth.sh
```

## 已知问题

无

## 未来计划

1. **前端分享页面**: 创建独立的工单报告分享页面
2. **第三方登录集成**: 完善企业微信、钉钉等第三方登录流程
3. **权限细化**: 支持按工单类型、状态等维度控制权限
4. **实时通知**: 工单状态变更时通知相关人员
5. **动态权限**: 支持创建后修改分享链接的权限配置

## 文档

- 详细文档: `docs/WORK_ORDER_SHARE_AUTH.md`
- 快速开始: `QUICK_START_WORK_ORDER_SHARE_AUTH.md`
- 实现总结: `docs/work-orders/WORK_ORDER_SHARE_AUTH_IMPLEMENTATION.md`
- API 测试: `server/test_work_order_share_auth.sh`

## 贡献者

- Claude (AI Assistant)

## 反馈

如有问题或建议，请联系开发团队。
