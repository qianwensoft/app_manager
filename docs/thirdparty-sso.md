# 第三方平台 SSO 登录与用户同步功能

## 概述

本功能实现了第三方平台（如 FreePass）的单点登录（SSO）和用户同步功能。核心设计思路：
- **第三方平台**主要用于用户、角色管理
- **外部应用**统一管理 token（不再在第三方平台单独维护 token）
- 第三方平台可关联外部应用，复用其 dynamic_bearer token 管理机制

## 数据库变更

### 1. User 表新增字段

```sql
ALTER TABLE users ADD COLUMN provider_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN external_user_id VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_username VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN user_info_json TEXT;
ALTER TABLE users ADD COLUMN synced_at DATETIME;
CREATE INDEX idx_users_provider_id ON users(provider_id);
CREATE INDEX idx_users_external_user_id ON users(external_user_id);
```

字段说明：
- `provider_id`: 关联的第三方平台 ID（0 表示本地用户）
- `external_user_id`: 第三方平台的用户 ID
- `external_username`: 第三方平台的用户名
- `user_info_json`: 第三方平台返回的完整用户信息（JSON）
- `synced_at`: 最后一次从第三方平台同步的时间

### 2. ThirdPartyProvider 表新增字段

```sql
ALTER TABLE third_party_providers ADD COLUMN outbound_app_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE third_party_providers ADD COLUMN user_sync_enabled BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE third_party_providers ADD COLUMN user_info_endpoint VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE third_party_providers ADD COLUMN user_list_endpoint VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE third_party_providers ADD COLUMN role_mapping_json TEXT;
ALTER TABLE third_party_providers ADD COLUMN default_role VARCHAR(20) NOT NULL DEFAULT 'viewer';
CREATE INDEX idx_third_party_providers_outbound_app_id ON third_party_providers(outbound_app_id);
```

字段说明：
- `outbound_app_id`: 关联的外部应用 ID，用于统一管理 token
- `user_sync_enabled`: 是否启用用户自动同步
- `user_info_endpoint`: 获取单个用户信息的 API 端点路径（相对于 OpenApiOrigin）
- `user_list_endpoint`: 获取用户列表的 API 端点路径（用于批量同步）
- `role_mapping_json`: 角色映射配置（JSON 对象），例如：`{"admin": "admin", "user": "viewer"}`
- `default_role`: 未映射角色的默认角色

## API 接口

### 1. SSO 登录

**POST** `/api/auth/thirdparty/login`

使用第三方平台的 access_token 进行单点登录。

**请求体：**
```json
{
  "provider_id": 1,
  "access_token": "第三方平台的 access_token"
}
```

**响应：**
```json
{
  "token": "本系统的 JWT token",
  "user": {
    "id": 1,
    "username": "user_tp1",
    "role": "viewer",
    "provider_id": 1,
    "external_user_id": "ext_123",
    "external_username": "张三",
    "synced_at": "2026-06-28T10:00:00Z"
  }
}
```

**工作流程：**
1. 验证第三方平台配置是否启用
2. 使用 access_token 调用第三方平台的用户信息接口
3. 根据 `external_user_id` 查找或创建本地用户
4. 应用角色映射规则
5. 生成本系统 JWT token
6. 返回 token 和用户信息

### 2. 批量同步用户

**POST** `/api/thirdparty/:id/sync-users`

从第三方平台批量同步用户到本系统。

**权限要求：** admin

**响应：**
```json
{
  "synced": 10,
  "failed": 2,
  "total": 12
}
```

**工作流程：**
1. 验证第三方平台配置
2. 确保关联的外部应用 token 有效
3. 调用用户列表接口获取所有用户
4. 逐个同步或创建本地用户
5. 应用角色映射规则

### 3. 查询同步状态

**GET** `/api/thirdparty/:id/sync-status`

获取用户同步状态统计。

**权限要求：** admin

**响应：**
```json
{
  "total_users": 100,
  "synced_users": 50,
  "last_synced_at": "2026-06-28T10:00:00Z"
}
```

## 配置示例

### 1. 创建外部应用（管理 token）

在"外部应用"页面创建一个新的外部应用：

```yaml
名称: FreePass API
Base URL: https://your-freepass.com
认证类型: dynamic_bearer
Token Provider 配置:
  fetch:
    url: https://your-freepass.com/oauth2/access_token
    method: POST
    body:
      app_key: "your_app_key"
      app_secret: "your_app_secret"
      grant_type: "client_credentials"
  paths:
    access_token: "accessToken"
    expires_in: "expires_in"
    refresh_token: "refreshToken"
```

### 2. 创建第三方平台（管理用户）

在"第三方平台"页面创建：

```yaml
名称: FreePass 平台
类型: freepass
关联外部应用: 选择上面创建的"FreePass API"
OpenAPI Origin: https://your-freepass.com
Corp ID: your_corp_id
App Key: your_app_key
App Secret: your_app_secret

用户同步配置:
  启用用户同步: 是
  用户信息端点: /api/v1/user/info
  用户列表端点: /api/v1/user/list
  角色映射:
    {
      "admin": "admin",
      "manager": "operator",
      "user": "viewer"
    }
  默认角色: viewer
```

## 前端集成

### 1. 登录页面

在登录页面添加"第三方平台登录"按钮：

```vue
<template>
  <el-button @click="thirdPartyLogin">使用 FreePass 登录</el-button>
</template>

<script>
export default {
  methods: {
    async thirdPartyLogin() {
      // 1. 跳转到第三方平台授权页面
      const authURL = await this.getAuthURL(providerId);
      window.location.href = authURL;
      
      // 2. 回调后获取 access_token
      // (在回调页面处理)
      
      // 3. 使用 access_token 登录本系统
      const response = await axios.post('/api/auth/thirdparty/login', {
        provider_id: providerId,
        access_token: accessToken
      });
      
      // 4. 保存 JWT token
      localStorage.setItem('token', response.data.token);
      
      // 5. 跳转到主页
      this.$router.push('/');
    }
  }
}
</script>
```

### 2. 用户同步管理

在第三方平台管理页面添加同步功能：

```vue
<template>
  <el-button @click="syncUsers">同步用户</el-button>
  <div>
    <p>总用户数: {{ status.total_users }}</p>
    <p>已同步: {{ status.synced_users }}</p>
    <p>最后同步: {{ status.last_synced_at }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      status: {}
    }
  },
  methods: {
    async syncUsers() {
      const result = await axios.post(`/api/thirdparty/${providerId}/sync-users`);
      this.$message.success(`同步成功: ${result.data.synced} / ${result.data.total}`);
      await this.loadStatus();
    },
    async loadStatus() {
      const response = await axios.get(`/api/thirdparty/${providerId}/sync-status`);
      this.status = response.data;
    }
  }
}
</script>
```

## 角色映射规则

角色映射通过 `role_mapping_json` 字段配置，格式为 JSON 对象：

```json
{
  "admin": "admin",
  "manager": "operator",
  "user": "viewer",
  "guest": "viewer"
}
```

- 键：第三方平台的角色名称
- 值：本系统的角色（admin / operator / viewer）

如果第三方平台返回的角色不在映射表中，则使用 `default_role` 指定的默认角色。

## 用户名生成规则

为避免冲突，第三方平台用户的本地用户名格式为：

```
{external_username}_tp{provider_id}
```

例如：`zhangsan_tp1`

如果用户名已存在，会自动添加序号：`zhangsan_tp1_1`、`zhangsan_tp1_2`...

## 安全考虑

1. **Token 安全**：第三方平台的 access_token 仅用于一次性验证，不存储在本地
2. **密码为空**：第三方登录的用户 password 字段为空，无法使用本地密码登录
3. **角色隔离**：通过角色映射确保第三方用户权限不会超出预期
4. **同步日志**：`synced_at` 字段记录最后同步时间，便于审计

## 测试流程

### 1. 测试 SSO 登录

```bash
# 1. 获取第三方平台 access_token（通过第三方平台的 OAuth 流程）
ACCESS_TOKEN="your_access_token_here"

# 2. 使用 access_token 登录
curl -X POST http://localhost:8080/api/auth/thirdparty/login \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "access_token": "'$ACCESS_TOKEN'"
  }'

# 3. 使用返回的 JWT token 访问受保护接口
JWT_TOKEN="returned_jwt_token"
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:8080/api/auth/me
```

### 2. 测试用户同步

```bash
# 需要 admin 权限
curl -X POST http://localhost:8080/api/thirdparty/1/sync-users \
  -H "Authorization: Bearer $ADMIN_JWT_TOKEN"

# 查看同步状态
curl http://localhost:8080/api/thirdparty/1/sync-status \
  -H "Authorization: Bearer $ADMIN_JWT_TOKEN"
```

## 故障排查

### 问题 1：登录失败 "failed to fetch user info"

**原因：**
- 第三方平台的 access_token 无效或已过期
- `user_info_endpoint` 配置错误
- 第三方平台 API 返回格式不符合预期

**解决：**
1. 检查 access_token 是否有效
2. 验证 `user_info_endpoint` 路径是否正确
3. 查看第三方平台 API 文档，确认响应格式
4. 修改 `fetchUserInfoFromProvider` 函数中的字段提取逻辑

### 问题 2：用户同步失败

**原因：**
- 关联的外部应用未配置或 token 无效
- `user_list_endpoint` 配置错误
- 角色映射配置格式错误

**解决：**
1. 确认外部应用已正确配置 token provider
2. 测试外部应用的 token 是否能正常获取
3. 验证 `user_list_endpoint` 返回的数据格式
4. 检查 `role_mapping_json` 是否为有效 JSON

### 问题 3：角色映射不生效

**原因：**
- `role_mapping_json` 格式错误
- 第三方平台返回的角色字段名不匹配

**解决：**
1. 验证 JSON 格式：`{"key": "value"}`
2. 查看第三方平台返回的用户信息中的角色字段名
3. 修改 `getStringFromMap` 调用中的字段名列表

## 后续优化建议

1. **定时自动同步**：添加定时任务，定期从第三方平台同步用户信息
2. **增量同步**：支持只同步变更的用户，提高效率
3. **同步日志**：记录每次同步的详细日志，便于追踪问题
4. **多平台支持**：扩展支持更多第三方平台（钉钉、企业微信等）
5. **部门同步**：除了用户，还可以同步组织架构和部门信息
6. **双向同步**：支持将本系统的用户变更同步回第三方平台
