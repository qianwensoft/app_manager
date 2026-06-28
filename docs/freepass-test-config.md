# FreePass 平台 SSO 测试配置

## 环境信息

- **FreePass URL**: http://27.195.159.118:20600
- **文档地址**: 
  - http://27.195.159.118:20600/sp/opendoc/freepass/10.0.2504.01/zh_cn/840673469570752513
  - http://27.195.159.118:20600/sp/opendoc/freepass/10.0.2504.01/zh_cn/840673581315399680
  - http://27.195.159.118:20600/sp/opendoc/freepass/10.0.2504.01/zh_cn/840673671426703360

## 配置步骤

### 1. 获取 FreePass 凭证

从 FreePass 管理后台获取以下信息：
- **Corp ID**: 企业 ID
- **App Key**: 应用密钥
- **App Secret**: 应用密钥（敏感信息）

### 2. 创建外部应用（Token 管理）

```bash
POST /api/outbound/apps
```

```json
{
  "name": "FreePass API",
  "description": "FreePass 平台 API 集成",
  "base_url": "http://27.195.159.118:20600",
  "auth_type": "dynamic_bearer",
  "token_provider_json": "{\"fetch\":{\"url\":\"http://27.195.159.118:20600/oauth2/access_token\",\"method\":\"POST\",\"body\":\"{\\\"app_key\\\":\\\"{{app.app_key}}\\\",\\\"app_secret\\\":\\\"{{app.app_secret}}\\\",\\\"grant_type\\\":\\\"client_credentials\\\"}\"},\"paths\":{\"access_token\":\"accessToken\",\"expires_in\":\"expires_in\",\"refresh_token\":\"refreshToken\"},\"skew_seconds\":60}",
  "app_params_json": "[{\"key\":\"app_key\",\"value\":\"YOUR_APP_KEY_HERE\",\"sensitive\":false},{\"key\":\"app_secret\",\"value\":\"YOUR_APP_SECRET_HERE\",\"sensitive\":true}]"
}
```

### 3. 创建第三方平台（用户管理）

```bash
POST /api/thirdparty
```

```json
{
  "name": "FreePass 平台",
  "type": "freepass",
  "description": "FreePass 单点登录",
  "open_api_origin": "http://27.195.159.118:20600",
  "corp_id": "YOUR_CORP_ID",
  "app_key": "YOUR_APP_KEY",
  "app_secret": "YOUR_APP_SECRET",
  "outbound_app_id": 1,
  "user_sync_enabled": true,
  "user_info_endpoint": "/api/v1/user/info",
  "user_list_endpoint": "/api/v1/user/list",
  "role_mapping_json": "{\"admin\":\"admin\",\"manager\":\"operator\",\"user\":\"viewer\"}",
  "default_role": "viewer",
  "enabled": true
}
```

### 4. 配置说明

#### Token Provider 配置

根据 FreePass 文档，token 获取接口通常为：

```json
{
  "fetch": {
    "url": "http://27.195.159.118:20600/oauth2/access_token",
    "method": "POST",
    "body": "{\"app_key\":\"{{app.app_key}}\",\"app_secret\":\"{{app.app_secret}}\",\"grant_type\":\"client_credentials\"}"
  },
  "paths": {
    "access_token": "accessToken",
    "expires_in": "expires_in",
    "refresh_token": "refreshToken"
  },
  "skew_seconds": 60
}
```

#### 用户信息端点

需要根据实际 FreePass 文档配置：

- **用户信息接口**: `/api/v1/user/info` 或类似路径
  - 请求头: `Authorization: Bearer {access_token}`
  - 返回字段可能包括: `userid`, `username`, `name`, `role` 等

- **用户列表接口**: `/api/v1/user/list` 或类似路径
  - 请求头: `Authorization: Bearer {access_token}`
  - 返回格式: `{"data": [{用户1}, {用户2}, ...]}`

#### 角色映射

根据 FreePass 平台的角色体系配置映射：

```json
{
  "admin": "admin",      // FreePass 管理员 -> 本系统 admin
  "manager": "operator", // FreePass 管理者 -> 本系统 operator
  "user": "viewer",      // FreePass 普通用户 -> 本系统 viewer
  "guest": "viewer"      // FreePass 访客 -> 本系统 viewer
}
```

## 测试流程

### 自动化测试

运行测试脚本：

```bash
cd /Volumes/data/workspace/qianwen/app-manager
./scripts/test_thirdparty_sso.sh
```

脚本会自动：
1. 登录获取 admin token
2. 创建外部应用
3. 创建第三方平台
4. 提供后续测试步骤的命令

### 手动测试

#### 1. 测试 Token 获取

```bash
# 测试外部应用能否正确获取 token
curl -X POST http://localhost:8080/api/outbound/apps/1/token/fetch \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### 2. 测试 SSO 登录

首先从 FreePass 获取用户 access_token（通过 OAuth2 授权流程），然后：

```bash
curl -X POST http://localhost:8080/api/auth/thirdparty/login \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "access_token": "FREEPASS_USER_ACCESS_TOKEN"
  }'
```

成功返回：
```json
{
  "token": "LOCAL_JWT_TOKEN",
  "user": {
    "id": 2,
    "username": "zhangsan_tp1",
    "role": "viewer",
    "provider_id": 1,
    "external_user_id": "freepass_user_123",
    "external_username": "张三"
  }
}
```

#### 3. 测试批量用户同步

```bash
curl -X POST http://localhost:8080/api/thirdparty/1/sync-users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

返回：
```json
{
  "synced": 50,
  "failed": 2,
  "total": 52
}
```

#### 4. 查看同步状态

```bash
curl -X GET http://localhost:8080/api/thirdparty/1/sync-status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 常见问题

### Q1: Token 获取失败

**检查项：**
1. app_key 和 app_secret 是否正确
2. FreePass 服务是否可访问
3. token 接口 URL 是否正确
4. 请求体格式是否符合 FreePass 要求

**调试：**
```bash
# 直接测试 FreePass token 接口
curl -X POST http://27.195.159.118:20600/oauth2/access_token \
  -H "Content-Type: application/json" \
  -d '{
    "app_key": "YOUR_KEY",
    "app_secret": "YOUR_SECRET",
    "grant_type": "client_credentials"
  }'
```

### Q2: 用户信息获取失败

**检查项：**
1. user_info_endpoint 路径是否正确
2. access_token 是否有效
3. 返回的 JSON 结构是否符合预期

**调试：**
```bash
# 直接测试用户信息接口
curl -X GET http://27.195.159.118:20600/api/v1/user/info \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Q3: 角色映射不生效

**原因：**
- FreePass 返回的角色字段名不匹配
- role_mapping_json 格式错误

**解决：**
1. 查看 FreePass 用户信息返回的角色字段
2. 修改 `api/thirdparty_sso.go` 中的字段提取逻辑：
```go
externalRole := getStringFromMap(userInfo, "role", "roles", "userRole", "user_role")
```

## 需要的 FreePass 文档信息

请从提供的三个文档链接中提取以下信息：

1. **OAuth2 Token 获取接口**
   - URL 路径
   - 请求方法
   - 请求参数
   - 响应格式

2. **用户信息接口**
   - URL 路径
   - 请求方法
   - 认证方式
   - 响应字段说明

3. **用户列表接口**
   - URL 路径
   - 请求方法
   - 分页参数
   - 响应格式

有了这些信息后，我可以帮你调整配置，使其完全适配 FreePass 平台。
