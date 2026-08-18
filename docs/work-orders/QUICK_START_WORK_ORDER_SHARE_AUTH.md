# 工单分享链接认证模式 - 快速开始

## 功能简介

工单分享链接现在支持两种认证模式：

1. **免登录模式**：任何人通过链接都可以查看工单信息，无需登录
2. **需登录模式**：需要用户登录后才能访问，支持细粒度权限控制（评论、改状态、改字段）

## 快速开始

### 步骤 1: 数据库迁移

启动服务前，确保数据库迁移已执行：

```bash
# 服务启动时会自动执行迁移
cd server
go run . config.sqlite.yaml
```

或者手动执行迁移脚本：

**SQLite:**
```bash
sqlite3 data/app-manager.db < server/migrations/sqlite/007_add_work_order_share_auth_mode.sql
```

**MySQL:**
```bash
mysql -u root -p your_database < server/migrations/mysql/007_add_work_order_share_auth_mode.sql
```

### 步骤 2: 创建免登录分享链接

1. 访问工单管理页面
2. 点击"统计分析"按钮
3. 在统计报告对话框中，点击"生成分享链接"
4. 填写分享标题，选择有效期
5. **认证模式选择"免登录"**
6. 点击"生成链接"
7. 复制链接分享给他人

**特点：**
- 任何人都可以访问
- 只能查看，不能操作
- 适合公开报告

### 步骤 3: 创建需登录分享链接

1. 访问工单管理页面
2. 点击"统计分析"按钮
3. 在统计报告对话框中，点击"生成分享链接"
4. 填写分享标题，选择有效期
5. **认证模式选择"需登录"**
6. 勾选需要授予的权限：
   - ✅ 查看工单详情（默认开启）
   - ☑️ 添加评论
   - ☑️ 更新工单状态
   - ☑️ 更新工单字段
7. 点击"生成链接"
8. 复制链接分享给协作者

**特点：**
- 必须登录才能访问
- 支持细粒度权限控制
- 所有操作记录操作人
- 支持第三方登录（企业微信、钉钉等）

### 步骤 4: 访问分享链接

#### 免登录模式访问

直接打开链接即可查看工单报告：
```
http://your-domain/work-order-report-share/{token}
```

#### 需登录模式访问

1. 打开链接，系统提示需要登录
2. 点击"登录"按钮
3. 使用以下方式之一登录：
   - 系统账号密码登录
   - 第三方平台 SSO 登录（企业微信、钉钉等）
4. 登录成功后自动返回分享页面
5. 根据授予的权限进行操作

### 步骤 5: 管理分享链接

访问"工单设置" → "分享管理"页面：

- 查看所有分享链接
- 查看每个链接的认证模式和权限配置
- 查看浏览记录
- 复制链接
- 删除过期或不需要的链接

## API 使用示例

### 创建免登录分享链接

```bash
curl -X POST http://localhost:8080/api/work-order-reports/shares \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q1工单统计报告",
    "filters": {
      "status": "open"
    },
    "expires_in": 168,
    "auth_mode": "public"
  }'
```

### 创建需登录分享链接

```bash
curl -X POST http://localhost:8080/api/work-order-reports/shares \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "协作工单统计",
    "filters": {
      "status": "open",
      "type_code": "bug"
    },
    "expires_in": 168,
    "auth_mode": "login",
    "permissions": {
      "can_view": true,
      "can_comment": true,
      "can_update_status": true,
      "can_update_fields": false
    }
  }'
```

### 免登录访问分享链接

```bash
# 获取分享信息
curl http://localhost:8080/api/share/work-order-reports/{token}

# 获取工单列表
curl http://localhost:8080/api/share/work-order-reports/{token}/work-orders

# 获取统计报告
curl http://localhost:8080/api/share/work-order-reports/{token}/statistics
```

### 需登录访问分享链接

```bash
# 获取分享信息（需要登录）
curl http://localhost:8080/api/share/work-order-reports/{token} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 获取工单列表（需要登录）
curl http://localhost:8080/api/share/work-order-reports/{token}/work-orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 添加评论
curl -X POST http://localhost:8080/api/share/work-order-reports/{token}/work-orders/1/comment \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "comment": "已确认问题"
  }'

# 更新状态
curl -X POST http://localhost:8080/api/share/work-order-reports/{token}/work-orders/1/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "comment": "开始处理"
  }'
```

## 常见问题

### Q: 现有的分享链接会受影响吗？

A: 不会。现有的分享链接会自动使用免登录模式（`auth_mode='public'`），功能保持不变。

### Q: 如何集成第三方登录？

A: 系统已支持第三方平台 SSO 登录。用户访问需登录的分享链接时，可以通过 `/api/auth/thirdparty/login` 接口使用第三方平台账号登录，获取 JWT token 后即可访问。

### Q: 权限可以动态修改吗？

A: 当前版本创建后不支持修改权限。如需修改，请删除旧链接重新创建。

### Q: 分享链接的安全性如何？

A: 
- 免登录模式：链接包含随机 token，知道链接的人可以访问
- 需登录模式：必须提供有效 JWT token，所有操作记录操作人
- 两种模式都支持设置过期时间
- 管理员可以随时删除分享链接

### Q: 如何查看谁访问了分享链接？

A: 在"工单设置" → "分享管理"页面，点击浏览次数可以查看详细的访问记录，包括访问时间、IP地址和浏览器信息。

## 技术支持

如有问题，请参考：
- 详细文档：`docs/WORK_ORDER_SHARE_AUTH.md`
- 实现总结：`docs/work-orders/WORK_ORDER_SHARE_AUTH_IMPLEMENTATION.md`
- API 测试脚本：`server/test_work_order_share_auth.sh`
