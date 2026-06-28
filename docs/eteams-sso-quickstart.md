# eTeams SSO 快速测试指南 - 使用外部应用 E10

## 前提条件

✅ 已有外部应用 E10（用于 token 管理）  
✅ eTeams 平台 app_key 和 app_secret  
✅ 本系统已启动（http://localhost:8080）

## 快速开始

### 1. 运行配置脚本

```bash
cd /Volumes/data/workspace/qianwen/app-manager
./scripts/test_eteams_with_e10.sh
```

脚本会引导你：
1. 输入 admin 账号密码
2. 查看现有外部应用列表
3. 选择外部应用 E10
4. 输入 eTeams app_key 和 app_secret
5. 自动创建第三方平台配置
6. 生成免登链接

### 2. 配置 eTeams

#### 方式 A: IM 中发送链接（推荐）

将脚本生成的链接发送到 eTeams IM：

```
http://27.195.159.118:20600/api/bs/open/auth/third?app_key=xxx&redirect_uri=xxx
```

用户点击后自动免登到本系统。

#### 方式 B: 配置应用菜单

在 eTeams 管理后台：
1. 创建新应用或编辑现有应用
2. 添加菜单项
3. 菜单类型选择 "URL"
4. 填入脚本生成的免登链接
5. 保存

### 3. 测试登录

**用户操作：**
1. 在 eTeams 中点击链接或菜单
2. 自动跳转到本系统回调页面
3. 页面自动完成登录
4. 3秒后跳转到主页

**登录流程：**
```
eTeams IM 点击链接
    ↓
eTeams 验证用户身份
    ↓
重定向: http://localhost:8080/auth-eteams-callback.html?eteams_token=xxx
    ↓
回调页面调用: POST /api/auth/thirdparty/login
    ↓
返回本系统 JWT token
    ↓
保存 token，跳转主页
```

## 架构说明

### Token 管理

第三方平台**不再单独管理 token**，而是关联到外部应用 E10：

```
第三方平台 (eTeams)
    ↓ 关联
外部应用 E10
    ↓ 管理
Token (dynamic_bearer)
```

**好处：**
- ✅ 统一管理：所有 eTeams API 调用都使用同一个 token
- ✅ 自动刷新：利用外部应用的 token 自动刷新机制
- ✅ 避免重复：不需要在第三方平台中再配置一遍 token 获取逻辑

### 数据库配置

```sql
-- 第三方平台关联外部应用
SELECT id, name, outbound_app_id FROM third_party_providers;

-- 外部应用 token 配置
SELECT id, name, auth_type, token_cache_json FROM outbound_apps WHERE id = 1;
```

## API 接口

### 1. 创建第三方平台

```bash
POST /api/thirdparty
Authorization: Bearer {admin_token}

{
  "name": "eTeams 平台",
  "type": "freepass",
  "open_api_origin": "http://27.195.159.118:20600",
  "app_key": "YOUR_APP_KEY",
  "app_secret": "YOUR_APP_SECRET",
  "outbound_app_id": 1,  // 关联到外部应用 E10
  "enabled": true
}
```

### 2. 生成免登链接

```bash
GET /api/thirdparty/:id/eteams/auth-url?redirect_uri=xxx
Authorization: Bearer {admin_token}

# 返回
{
  "auth_url": "http://27.195.159.118:20600/api/bs/open/auth/third?..."
}
```

### 3. SSO 登录

```bash
POST /api/auth/thirdparty/login

{
  "provider_id": 1,
  "eteams_token": "447ae6f71e8cea7da7dc21269e460f1b"
}

# 返回
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "username": "user_tp1",
    "role": "viewer",
    "external_user_id": "user@example.com"
  }
}
```

## 测试场景

### 场景 1: 用户首次登录

1. eTeams 用户 `user@example.com` 点击链接
2. 系统自动创建本地用户 `user_tp1`
3. 默认角色为 `viewer`
4. 登录成功，跳转主页

### 场景 2: 用户再次登录

1. 已存在的用户点击链接
2. 系统更新用户信息（email, mobile 等）
3. 角色保持不变
4. 登录成功

### 场景 3: 账号模式登录（测试用）

```bash
curl -X POST http://localhost:8080/api/auth/thirdparty/login \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "account": "user@example.com",
    "app_key": "YOUR_APP_KEY",
    "app_secret": "YOUR_APP_SECRET"
  }'
```

## 回调页面

已创建测试回调页面：`web/public/auth-eteams-callback.html`

**功能：**
- ✅ 自动提取 URL 中的 `eteams_token`
- ✅ 调用登录接口
- ✅ 显示登录进度
- ✅ 保存 JWT token 到 localStorage
- ✅ 3秒后自动跳转到主页

**访问地址：**
```
http://localhost:8080/auth-eteams-callback.html?provider_id=1
```

## 前端集成

### Vue 示例

```vue
<template>
  <div>
    <el-button @click="loginWithETeams">通过 eTeams 登录</el-button>
  </div>
</template>

<script>
export default {
  methods: {
    async loginWithETeams() {
      // 获取免登链接
      const response = await this.$axios.get('/api/thirdparty/1/eteams/auth-url', {
        params: {
          redirect_uri: window.location.origin + '/auth-eteams-callback.html?provider_id=1'
        },
        headers: {
          Authorization: 'Bearer ' + this.adminToken
        }
      });
      
      // 引导用户：这个链接需要在 eTeams 中打开
      this.$alert(
        '请将此链接发送到 eTeams IM 中点击：\n' + response.data.auth_url,
        '提示',
        { type: 'info' }
      );
    }
  }
}
</script>
```

## 故障排查

### Q1: 外部应用 E10 未配置 token

**症状：** 第三方平台关联了 E10，但无法使用 token

**解决：**
1. 检查外部应用 E10 的 `auth_type` 是否为 `dynamic_bearer`
2. 确认 `token_provider_json` 已正确配置
3. 测试 token 获取：
```bash
POST /api/outbound/apps/1/token/fetch
```

### Q2: eteams_token 无效

**症状：** `"eTeams error: ..."`

**原因：**
- token 已使用过（一次性）
- token 已过期
- 未从 eTeams 系统内发起

**解决：** 重新从 eTeams 点击链接

### Q3: 回调页面 CORS 错误

**症状：** 浏览器控制台显示 CORS 错误

**解决：**
1. 确认服务器 CORS 配置允许回调域名
2. 检查回调地址是否正确
3. 使用相同域名（不要混用 localhost 和 127.0.0.1）

## 生产部署建议

### 1. 使用 HTTPS

```yaml
# 生产环境配置
open_api_origin: https://your-eteams-domain.com
callback_url: https://your-system.com/auth-eteams-callback.html
```

### 2. 配置回调白名单

在 eTeams 管理后台添加回调地址白名单：
```
https://your-system.com/auth-eteams-callback.html
```

### 3. Token 安全

- 外部应用 E10 的 `app_secret` 加密存储
- JWT secret 使用强密码
- 定期轮换密钥

### 4. 监控和日志

```bash
# 查看同步用户数
GET /api/thirdparty/1/sync-status

# 审计日志
SELECT * FROM audit_logs WHERE action LIKE '%thirdparty%';
```

## 完整测试清单

- [ ] 运行配置脚本，创建第三方平台
- [ ] 确认关联到外部应用 E10
- [ ] 在 eTeams IM 中发送免登链接
- [ ] 点击链接，验证跳转到回调页面
- [ ] 确认自动登录成功
- [ ] 检查用户信息是否正确同步
- [ ] 退出后再次点击链接，确认可重复登录
- [ ] 测试多个不同的 eTeams 用户
- [ ] 验证用户角色默认为 viewer
- [ ] 在管理后台调整用户角色

## 总结

**已完成：**
- ✅ 第三方平台关联外部应用 E10
- ✅ 复用外部应用的 token 管理机制
- ✅ eTeams 免登链接生成
- ✅ SSO 登录接口
- ✅ 用户自动创建/更新
- ✅ 回调页面（带进度显示）
- ✅ 完整测试脚本
- ✅ 文档和示例

**使用流程：**
1. 运行 `./scripts/test_eteams_with_e10.sh`
2. 在 eTeams 中发送生成的链接
3. 用户点击链接自动登录

简单、安全、统一管理！🎉
