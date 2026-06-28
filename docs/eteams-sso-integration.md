# eTeams (FreePass) SSO 集成测试指南

根据 eTeams 官方文档完整适配。

## eTeams 平台信息

- **平台 URL**: http://27.195.159.118:20600
- **文档版本**: 10.0.2504.01
- **支持功能**: 
  - 免登本系统（第三方登录 eTeams）
  - 免登第三方（eTeams 用户免登本系统）✅ 已实现

## 集成模式

### 模式 1: eTeams 用户免登本系统（推荐）

**流程：**
1. 用户在 eTeams 中点击应用链接
2. eTeams 重定向到本系统，携带 `eteams_token`
3. 本系统使用 `eteams_token` 获取用户信息
4. 自动创建/更新本地用户
5. 返回本系统 JWT token

### 模式 2: 使用账号直接登录

**流程：**
1. 输入 eTeams 账号
2. 系统使用 app_key/app_secret 获取 `etLoginToken`
3. 使用 token 验证身份
4. 自动创建/更新本地用户
5. 返回本系统 JWT token

## 配置步骤

### 1. 在 eTeams 中创建应用

登录 eTeams 管理后台：
1. 创建新应用
2. 记录 **app_key** 和 **app_secret**
3. 配置免登回调地址（本系统的登录回调页面）

### 2. 在本系统中配置第三方平台

**API 请求：**

```bash
POST /api/thirdparty
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "eTeams 平台",
  "type": "freepass",
  "description": "eTeams 单点登录",
  "open_api_origin": "http://27.195.159.118:20600",
  "corp_id": "",
  "app_key": "YOUR_APP_KEY",
  "app_secret": "YOUR_APP_SECRET",
  "enabled": true
}
```

**响应示例：**
```json
{
  "id": 1,
  "name": "eTeams 平台",
  "type": "freepass",
  ...
}
```

### 3. 前端集成

#### 方式 A: eTeams 免登链接（推荐）

在 eTeams 中配置菜单，指向：

```
http://27.195.159.118:20600/api/bs/open/auth/third?app_key=YOUR_APP_KEY&redirect_uri=http://your-system.com/auth/eteams/callback
```

**回调页面处理：**

```javascript
// auth/eteams/callback 页面
const urlParams = new URLSearchParams(window.location.search);
const eteamsToken = urlParams.get('eteams_token');

if (eteamsToken) {
  // 使用 eteams_token 登录本系统
  const response = await axios.post('/api/auth/thirdparty/login', {
    provider_id: 1,
    eteams_token: eteamsToken
  });
  
  // 保存 JWT token
  localStorage.setItem('token', response.data.token);
  
  // 跳转到主页
  window.location.href = '/';
}
```

#### 方式 B: 直接账号登录

```javascript
const response = await axios.post('/api/auth/thirdparty/login', {
  provider_id: 1,
  account: 'user@example.com',
  app_key: 'YOUR_APP_KEY',
  app_secret: 'YOUR_APP_SECRET'
});

localStorage.setItem('token', response.data.token);
```

## API 接口文档

### 1. SSO 登录

**POST** `/api/auth/thirdparty/login`

**请求体（方式 A - eteams_token）：**
```json
{
  "provider_id": 1,
  "eteams_token": "447ae6f71e8cea7da7dc21269e460f1b"
}
```

**请求体（方式 B - 账号）：**
```json
{
  "provider_id": 1,
  "account": "user@example.com",
  "app_key": "YOUR_APP_KEY",
  "app_secret": "YOUR_APP_SECRET"
}
```

**响应：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "username": "user_tp1",
    "role": "viewer",
    "provider_id": 1,
    "external_user_id": "user@example.com",
    "external_username": "user",
    "synced_at": "2026-06-28T10:00:00Z"
  }
}
```

### 2. 获取免登授权 URL

**GET** `/api/thirdparty/:id/eteams/auth-url?redirect_uri=xxx`

**参数：**
- `redirect_uri`: 免登后的回调地址（必填）

**响应：**
```json
{
  "auth_url": "http://27.195.159.118:20600/api/bs/open/auth/third?app_key=xxx&redirect_uri=xxx"
}
```

### 3. 查询同步状态

**GET** `/api/thirdparty/:id/sync-status`

**响应：**
```json
{
  "total_users": 100,
  "synced_users": 5,
  "last_synced_at": "2026-06-28T10:00:00Z",
  "note": "eTeams users are auto-created on first login"
}
```

## 完整测试脚本

```bash
#!/bin/bash

BASE_URL="http://localhost:8080"
ETEAMS_URL="http://27.195.159.118:20600"

# 1. 登录获取 admin token
ADMIN_TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

echo "Admin Token: ${ADMIN_TOKEN:0:20}..."

# 2. 创建第三方平台
PROVIDER_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/thirdparty" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "eTeams 平台",
    "type": "freepass",
    "description": "eTeams 单点登录",
    "open_api_origin": "'"${ETEAMS_URL}"'",
    "app_key": "YOUR_APP_KEY",
    "app_secret": "YOUR_APP_SECRET",
    "enabled": true
  }')

PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | jq -r '.id')
echo "Provider ID: ${PROVIDER_ID}"

# 3. 获取免登 URL
AUTH_URL_RESPONSE=$(curl -s -X GET \
  "${BASE_URL}/api/thirdparty/${PROVIDER_ID}/eteams/auth-url?redirect_uri=http://localhost:3000/auth/callback" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

echo "Auth URL: $(echo $AUTH_URL_RESPONSE | jq -r '.auth_url')"

# 4. 测试 SSO 登录（需要真实的 eteams_token）
echo ""
echo "=== 测试 SSO 登录 ==="
echo "从 eTeams 免登回调获取 eteams_token 后执行："
echo ""
cat << EOF
curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "eteams_token": "YOUR_ETEAMS_TOKEN"
  }'
EOF

# 5. 或使用账号登录
echo ""
echo "=== 使用账号登录 ==="
echo ""
cat << EOF
curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "account": "user@example.com",
    "app_key": "YOUR_APP_KEY",
    "app_secret": "YOUR_APP_SECRET"
  }'
EOF
```

## eTeams API 说明

### 1. 获取登录令牌

**接口：** `POST /papi/openapi/oauth2/get_logintoken`

**请求：**
```json
{
  "app_key": "your_app_key",
  "app_security": "your_app_secret",
  "account": "user@example.com",
  "authType": "account"
}
```

**响应：**
```json
{
  "errcode": "0",
  "errmsg": "success",
  "etLoginToken": "c9f5b0803d057a6b2dc6b36dd0f27d8b"
}
```

**authType 说明：**
- `account`: 登录账号
- `id`: 人员 ID
- `JOB_NUM`: 工号
- `EMAIL`: 邮箱
- `MOBILE`: 手机号
- `loginID`: 登录名
- `idNos`: 身份证

### 2. 获取用户信息

**接口：** `POST /papi/openapi/oauth2/getUserInfo?eteams_token=xxx`

**响应：**
```json
{
  "errcode": "0",
  "errmsg": "success",
  "acessToken": "447ae6f71e8cea7da7dc21269e460f1b",
  "email": "user@example.com",
  "mobile": "13800138000",
  "jobNum": "E001"
}
```

### 3. 免登第三方授权

**接口：** `GET /api/bs/open/auth/third?app_key=xxx&redirect_uri=xxx`

**说明：** 此接口必须在 eTeams 中发起（通过菜单或应用链接）

**回调示例：**
```
https://your-system.com/auth/callback?eteams_token=447ae6f71e8cea7da7dc21269e460f1b
```

## 用户映射规则

由于 eTeams API 不返回角色信息，所有用户默认使用配置的 `default_role`（默认为 `viewer`）。

**用户标识优先级：**
1. email
2. mobile
3. jobNum
4. account

**用户名生成规则：**
- 格式：`{username}_tp{provider_id}`
- 示例：`user_tp1`

## 注意事项

1. **eteams_token 一次性**: 每个 token 只能使用一次，免登后立即失效
2. **回调地址配置**: 确保在 eTeams 中正确配置了回调地址白名单
3. **HTTPS 要求**: 生产环境建议使用 HTTPS
4. **批量同步不支持**: eTeams 未提供用户列表接口，用户首次登录时自动创建
5. **角色管理**: 需要在本系统中手动调整用户角色

## 故障排查

### 问题 1: "eTeams error: ..."

**检查：**
- app_key 和 app_secret 是否正确
- eTeams 服务是否可访问
- account 是否存在于 eTeams 系统

### 问题 2: eteams_token 无效

**原因：**
- token 已使用过（一次性）
- token 已过期
- 未从 eTeams 系统内发起免登请求

**解决：**
重新从 eTeams 系统发起免登

### 问题 3: 回调后没有 eteams_token

**检查：**
- redirect_uri 是否在 eTeams 白名单中
- 是否从 eTeams 系统内发起请求

## 前端完整示例

```vue
<template>
  <div class="login-page">
    <el-button @click="loginWithETeams">使用 eTeams 登录</el-button>
  </div>
</template>

<script>
export default {
  methods: {
    async loginWithETeams() {
      // 1. 获取免登 URL
      const response = await this.$axios.get('/api/thirdparty/1/eteams/auth-url', {
        params: {
          redirect_uri: window.location.origin + '/auth/eteams/callback'
        }
      });
      
      // 2. 跳转到 eTeams 授权页面（需要在 eTeams 系统内打开）
      window.location.href = response.data.auth_url;
    }
  }
}
</script>
```

```vue
<!-- auth/eteams/callback.vue -->
<template>
  <div class="callback-page">
    <div v-if="loading">正在登录...</div>
    <div v-if="error">登录失败: {{ error }}</div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      loading: true,
      error: null
    }
  },
  async mounted() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const eteamsToken = urlParams.get('eteams_token');
      
      if (!eteamsToken) {
        throw new Error('未获取到 eteams_token');
      }
      
      // 使用 eteams_token 登录
      const response = await this.$axios.post('/api/auth/thirdparty/login', {
        provider_id: 1,
        eteams_token: eteamsToken
      });
      
      // 保存 token
      localStorage.setItem('token', response.data.token);
      this.$store.commit('setUser', response.data.user);
      
      // 跳转到主页
      this.$router.push('/');
    } catch (err) {
      this.error = err.message;
      this.loading = false;
    }
  }
}
</script>
```

## 总结

已完成功能：
- ✅ eTeams SSO 登录（eteams_token 模式）
- ✅ 账号密码模式登录
- ✅ 用户自动创建/更新
- ✅ 免登 URL 生成
- ✅ 完整的 API 文档
- ✅ 测试脚本

限制：
- ❌ 不支持批量用户同步（eTeams API 未提供）
- ❌ 不支持角色同步（eTeams API 未返回角色信息）
