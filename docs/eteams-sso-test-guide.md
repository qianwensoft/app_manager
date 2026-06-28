# eTeams SSO 测试功能使用指南

## 功能概述

在第三方平台管理界面中新增了"测试 SSO"功能，可以快速生成带 SSO 认证的测试链接，用于在 eTeams 等第三方平台中实现免登访问本系统的指定页面（如工单详情）。

## 使用步骤

### 1. 进入第三方平台管理

访问：**系统设置 → 第三方平台**

### 2. 点击"测试 SSO"按钮

在已配置的第三方平台（如 eTeams）行中，点击"测试 SSO"按钮。

### 3. 选择目标页面类型

在弹出的对话框中，可以选择三种目标页面类型：

#### 选项 1: 工单详情
- 选择"工单详情"
- 输入工单 ID（如：`123`）
- 生成的链接将跳转到：`/work-orders/123`

#### 选项 2: 自定义路径
- 选择"自定义路径"
- 输入目标路径（如：`/devices` 或 `/work-orders/456`）
- 生成的链接将跳转到指定路径

#### 选项 3: 首页
- 选择"首页"
- 生成的链接将跳转到系统首页：`/`

### 4. 生成链接

点击"生成链接"按钮，系统将自动生成完整的 SSO 免登链接。

### 5. 复制并使用

- 点击"复制"按钮将链接复制到剪贴板
- 将链接发送到 eTeams IM 中
- 或在 eTeams 管理后台配置应用菜单，使用此链接作为菜单 URL

## 链接结构说明

生成的链接格式：

```
http://27.195.159.118:20600/api/bs/open/auth/third
  ?app_key=YOUR_APP_KEY
  &redirect_uri=http://localhost:8080/auth-eteams-callback.html
    ?provider_id=1
    &redirect_to=/work-orders/123
```

**链接组成：**
1. **eTeams 授权端点**: `http://27.195.159.118:20600/api/bs/open/auth/third`
2. **app_key**: 第三方平台的应用密钥
3. **redirect_uri**: 回调地址（包含目标页面参数）
   - `provider_id`: 第三方平台 ID
   - `redirect_to`: 登录成功后跳转的目标页面路径

## 用户访问流程

```
用户在 eTeams 中点击链接
    ↓
eTeams 验证用户身份（已登录 IM）
    ↓
eTeams 重定向到回调页面，携带 eteams_token
    ↓
回调页面自动调用登录接口
    ↓
登录成功，保存 JWT token
    ↓
3 秒后自动跳转到目标页面（工单详情/自定义页面/首页）
```

## 典型使用场景

### 场景 1: 工单通知

在外部系统（如工单系统）中推送工单更新通知到 eTeams：

```
【工单更新】工单 #123 已分配给您
点击查看详情: [生成的SSO链接]
```

用户点击后直接查看工单详情，无需手动登录。

### 场景 2: 快捷菜单

在 eTeams 中配置应用菜单：
- 菜单名称：查看待办工单
- 菜单类型：URL
- 链接地址：生成的 SSO 链接（自定义路径 `/work-orders`）

用户点击菜单后直接进入工单列表页。

### 场景 3: 设备管理入口

为设备运维团队配置快速入口：
- 自定义路径设置为 `/devices`
- 生成链接并配置到 eTeams 应用菜单
- 运维人员点击后直接进入设备管理页面

## 安全说明

1. **eteams_token 一次性**
   - 每个 `eteams_token` 只能使用一次
   - 重复使用会导致登录失败
   - 需要重新从 eTeams 发起授权

2. **JWT token 有效期**
   - 登录成功后获得的 JWT token 会保存在浏览器
   - Token 有效期由系统配置决定
   - Token 过期后需要重新点击 SSO 链接登录

3. **用户自动创建**
   - 首次通过 SSO 登录的用户会自动创建本地账号
   - 用户名格式：`{email前缀}_tp{provider_id}`
   - 默认角色：`viewer`（可在用户管理中调整）

4. **权限控制**
   - SSO 登录后的用户权限与普通登录用户一致
   - 遵循系统的角色权限设定（admin/operator/viewer）
   - 访问受限页面时会提示权限不足

## 故障排查

### Q1: 点击链接后显示"未获取到 eteams_token"

**原因：**
- 未从 eTeams 系统内点击链接
- 直接在浏览器中打开了链接

**解决：**
- 必须从 eTeams IM 或 eTeams 应用菜单中点击
- 确保在已登录 eTeams 的环境中访问

### Q2: 登录失败，显示"eTeams error"

**原因：**
- `eteams_token` 已过期或已使用
- 第三方平台配置的 `app_key` 或 `app_secret` 不正确

**解决：**
1. 重新从 eTeams 点击链接（获取新的 token）
2. 检查第三方平台配置是否正确
3. 联系管理员验证 eTeams 应用配置

### Q3: 登录成功但跳转到错误页面

**原因：**
- `redirect_to` 参数中的路径不存在
- 路径格式不正确

**解决：**
1. 检查输入的工单 ID 是否存在
2. 确认自定义路径格式正确（必须以 `/` 开头）
3. 重新生成正确的链接

### Q4: 跳转后提示权限不足

**原因：**
- 用户角色权限不足以访问目标页面
- 默认创建的 viewer 角色无法访问管理功能

**解决：**
1. 管理员在"用户管理"中调整用户角色
2. 将用户角色提升为 operator 或 admin
3. 用户重新登录后权限生效

## 开发参考

### 回调页面实现

回调页面位置：`web/public/auth-eteams-callback.html`

关键参数：
- `provider_id`: 从 URL 参数获取
- `eteams_token`: eTeams 重定向时携带
- `redirect_to`: 登录成功后的目标路径（可选）

### 前端集成

在 Vue 组件中使用：

```vue
<template>
  <el-button @click="openWorkOrderWithSso(workOrderId)">
    在 eTeams 中打开
  </el-button>
</template>

<script setup>
const openWorkOrderWithSso = (workOrderId) => {
  const providerId = 1 // 第三方平台 ID
  const redirectTo = `/work-orders/${workOrderId}`
  const callbackUrl = `${window.location.origin}/auth-eteams-callback.html?provider_id=${providerId}&redirect_to=${encodeURIComponent(redirectTo)}`
  
  // 获取第三方平台配置
  const provider = { /* ... */ }
  const baseUrl = provider.open_api_origin
  const ssoUrl = `${baseUrl}/api/bs/open/auth/third?app_key=${encodeURIComponent(provider.app_key)}&redirect_uri=${encodeURIComponent(callbackUrl)}`
  
  // 复制链接或发送到 eTeams
  navigator.clipboard.writeText(ssoUrl)
}
</script>
```

## 总结

**已实现功能：**
- ✅ 第三方平台管理界面增加"测试 SSO"按钮
- ✅ 支持生成工单详情访问链接
- ✅ 支持自定义目标页面路径
- ✅ 回调页面支持 `redirect_to` 参数
- ✅ 一键复制生成的链接
- ✅ 完整的用户流程和错误处理

**使用场景：**
- 工单通知 → 点击查看详情
- 快捷菜单 → 快速访问常用页面
- 设备管理 → 运维团队专用入口
- 系统集成 → 第三方系统免登对接

简单、安全、易用！🎉
