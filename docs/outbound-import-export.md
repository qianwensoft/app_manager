# 外部应用导出导入功能 - 完整文档

## 功能概述

为外部应用（Outbound Apps）实现完整的导出导入功能，支持导出和导入应用的所有配置项，包括：

- ✅ 应用基本信息（名称、描述、Base URL、认证配置等）
- ✅ 连接器配置（HTTP API、Webhook Delivery）
- ✅ Webhook 配置（接收端点、签名验证、脚本等）
- ✅ 扩展脚本（Before/After Scripts）
- ✅ 访问令牌（可选导出）
- ✅ 推送配置（事件到连接器的映射）
- ✅ 数据接口关联（如果有）
- ✅ 自定义事件关联（如果有）

**创建日期**: 2024-06-09  
**版本**: v1.0  
**状态**: ✅ 已完成

---

## 📋 功能清单

### 导出功能

| 功能 | 说明 | 状态 |
|------|------|------|
| 导出应用基本信息 | 名称、描述、Base URL、认证配置 | ✅ |
| 导出连接器 | 所有连接器配置 | ✅ |
| 导出 Webhook | 所有 Webhook 配置 | ✅ |
| 导出扩展脚本 | Before/After Scripts | ✅ |
| 导出访问令牌 | 可选是否包含令牌值 | ✅ |
| 导出推送配置 | 事件到连接器的映射 | ✅ |
| 导出密钥选项 | 可选是否包含敏感信息 | ✅ |
| 导出为 JSON 文件 | 标准 JSON 格式 | ✅ |

### 导入功能

| 功能 | 说明 | 状态 |
|------|------|------|
| 上传 JSON 文件 | 拖拽或选择文件 | ✅ |
| 验证导入数据 | 格式和内容验证 | ✅ |
| 创建新应用 | 导入为新应用 | ✅ |
| 覆盖已存在应用 | 更新现有应用配置 | ✅ |
| 编码前缀 | 避免编码冲突 | ✅ |
| 选择性导入密钥 | 可选是否导入敏感信息 | ✅ |
| 生成新编码 | 自动生成 UUID 编码 | ✅ |
| 导入预览 | 导入前确认信息 | ✅ |

---

## 🚀 使用指南

### 导出应用配置

#### 1. 打开导出对话框

在外部应用详情页，点击"导出配置"按钮

#### 2. 配置导出选项

```
┌─────────────────────────────────────┐
│ 导出外部应用配置                      │
├─────────────────────────────────────┤
│ 应用: 示例应用 (demo_app)            │
│                                      │
│ 包含内容:                            │
│ ☑ 连接器配置                         │
│ ☑ Webhook 配置                       │
│ ☑ 扩展脚本                           │
│ ☑ 访问令牌                           │
│                                      │
│ 是否包含密钥: [OFF] 不包含            │
│                                      │
│ 导出格式: ◉ JSON 文件                │
│                                      │
│            [取消]  [📥 导出配置]      │
└─────────────────────────────────────┘
```

**选项说明**:

- **是否包含密钥**: 
  - `关闭`: 不导出 Webhook Secret、访问令牌值等敏感信息（推荐）
  - `开启`: 导出所有敏感信息（请妥善保管导出文件）

#### 3. 下载导出文件

点击"导出配置"后，自动下载 JSON 文件：
- 文件名格式: `{app_code}_export_{timestamp}.json`
- 示例: `demo_app_export_1704776400000.json`

### 导入应用配置

#### 步骤 1: 上传文件

```
┌─────────────────────────────────────┐
│ 导入外部应用配置                      │
├─────────────────────────────────────┤
│ [步骤 1: 上传文件]                   │
│                                      │
│  ┌─────────────────────────────┐   │
│  │      📤                      │   │
│  │  拖拽文件到此处或点击上传      │   │
│  │  仅支持 JSON 格式的配置文件    │   │
│  └─────────────────────────────┘   │
│                                      │
│  文件信息:                           │
│  - 文件名: demo_app_export.json      │
│  - 导出版本: 1.0                     │
│  - 导出时间: 2024-06-09 10:30       │
│  - 应用名称: 示例应用                │
│  - 连接器: 3 个                      │
│  - Webhooks: 2 个                    │
│                                      │
│            [取消]  [下一步 →]        │
└─────────────────────────────────────┘
```

#### 步骤 2: 验证配置

系统自动验证导入数据的格式和内容

**验证通过**:
```
┌─────────────────────────────────────┐
│  ✓ 验证通过                          │
│  配置文件格式正确，可以继续导入       │
│                                      │
│  - 应用名称: 示例应用                │
│  - 连接器: 3 个                      │
│  - Webhooks: 2 个                    │
│  - 访问令牌: 1 个                    │
│                                      │
│            [取消]  [下一步 →]        │
└─────────────────────────────────────┘
```

**验证失败**:
```
┌─────────────────────────────────────┐
│  ✗ 验证失败                          │
│  配置文件存在以下问题                 │
│                                      │
│  ❌ 应用编码已存在: demo_app          │
│  ❌ 连接器编码重复: api_connector     │
│  ❌ Webhook #2 编码不能为空           │
│                                      │
│            [取消]  [← 上一步]        │
└─────────────────────────────────────┘
```

#### 步骤 3: 导入选项

```
┌─────────────────────────────────────┐
│ 导入选项                             │
├─────────────────────────────────────┤
│ 导入模式:                            │
│ ◉ 创建新应用                         │
│ ○ 覆盖已存在应用                     │
│                                      │
│ 编码前缀: [test_____________]        │
│ 为导入的配置添加前缀，避免冲突        │
│                                      │
│ 是否导入密钥: [OFF] 跳过             │
│                                      │
│ 生成新编码: [OFF] 否                 │
│ 是否为所有配置项生成新的编码(UUID)     │
│                                      │
│      [← 上一步]  [取消]  [下一步 →]  │
└─────────────────────────────────────┘
```

**选项说明**:

1. **导入模式**:
   - `创建新应用`: 导入为全新的应用
   - `覆盖已存在应用`: 更新现有应用（⚠️ 会删除现有配置）

2. **编码前缀**:
   - 为所有编码添加前缀
   - 例如: `demo_app` → `test_demo_app`
   - 适用于创建测试环境副本

3. **是否导入密钥**:
   - `开启`: 导入所有密钥和敏感信息
   - `关闭`: 跳过密钥（需要手动配置）

4. **生成新编码**:
   - `开启`: 自动生成新的 UUID 编码
   - `关闭`: 使用原有编码（可能需要前缀避免冲突）

#### 步骤 4: 确认导入

```
┌─────────────────────────────────────┐
│ ⚠ 请确认以下导入信息                  │
├─────────────────────────────────────┤
│ 应用名称: 示例应用                    │
│ 应用编码: test_demo_app               │
│ 导入模式: [创建新应用]                │
│ 连接器: 3 个                         │
│ Webhooks: 2 个                       │
│ 访问令牌: 1 个（密钥将被跳过）         │
│ 编码前缀: test_                      │
│                                      │
│      [← 上一步]  [取消]  [✓ 确认导入] │
└─────────────────────────────────────┘
```

点击"确认导入"后，系统开始导入配置。

---

## 📊 导出数据格式

### JSON 结构

```json
{
  "export_version": "1.0",
  "export_time": "2024-06-09T10:30:00Z",
  "export_by": "admin",
  
  "app": {
    "app_code": "demo_app",
    "name": "示例应用",
    "description": "这是一个示例应用",
    "base_url": "https://api.example.com",
    "auth_type": "static_header",
    "auth_config": {
      "header_name": "X-API-Key",
      "header_value": "***"
    },
    "common_headers": {
      "Content-Type": "application/json"
    },
    "token_provider": {},
    "extension_scripts": {
      "global_before": "// 全局前置脚本",
      "global_after": "// 全局后置脚本"
    },
    "app_params": {
      "timeout": 30,
      "retry_count": 3
    },
    "enabled": true
  },
  
  "connectors": [
    {
      "connector_code": "get_users",
      "name": "获取用户列表",
      "description": "调用 API 获取用户列表",
      "connector_type": "http_api",
      "method": "GET",
      "endpoint_template": "/users",
      "headers": {},
      "query_params": {
        "page": "{{page}}",
        "limit": "{{limit}}"
      },
      "body_template": "",
      "response_map": {
        "users": "$.data",
        "total": "$.meta.total"
      },
      "before_script": "// 请求前处理",
      "after_script": "// 响应后处理",
      "error_handling": {
        "retry_on": [500, 502, 503],
        "max_retries": 3
      },
      "retry_config": {
        "initial_delay": 1000,
        "max_delay": 10000,
        "backoff_factor": 2
      },
      "timeout_sec": 30,
      "enabled": true,
      "tags": ["api", "users"]
    }
  ],
  
  "webhooks": [
    {
      "webhook_code": "github_webhook",
      "name": "GitHub Webhook",
      "description": "接收 GitHub 事件",
      "path": "/webhooks/github",
      "method": "POST",
      "secret": "",
      "signature_header": "X-Hub-Signature-256",
      "signature_method": "sha256",
      "payload_parser": "json",
      "before_script": "// Webhook 前置处理",
      "after_script": "// Webhook 后置处理",
      "event_type_field": "$.headers['X-GitHub-Event']",
      "event_type_map": {
        "push": "github.push",
        "pull_request": "github.pr"
      },
      "response_template": "{\"status\": \"ok\"}",
      "error_handling": {
        "on_error": "log_and_continue"
      },
      "enabled": true,
      "ip_whitelist": ["192.30.252.0/22"],
      "rate_limit_config": {
        "max_requests": 100,
        "window_sec": 60
      }
    }
  ],
  
  "tokens": [
    {
      "token_name": "api_access_token",
      "token_value": "",
      "expires_at": "2025-12-31T23:59:59Z",
      "scopes": ["read:users", "write:orders"],
      "description": "API 访问令牌"
    }
  ],
  
  "delivery_configs": [],
  "data_interfaces": [],
  "custom_events": []
}
```

### 字段说明

#### 元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `export_version` | String | 导出格式版本（当前为 "1.0"） |
| `export_time` | DateTime | 导出时间（ISO 8601 格式） |
| `export_by` | String | 导出用户名 |

#### 应用信息（app）

| 字段 | 类型 | 说明 |
|------|------|------|
| `app_code` | String | 应用唯一编码 |
| `name` | String | 应用名称 |
| `description` | String | 应用描述 |
| `base_url` | String | API Base URL |
| `auth_type` | String | 认证类型（none / static_header / dynamic_bearer） |
| `auth_config` | Object | 认证配置 |
| `common_headers` | Object | 公共请求头 |
| `token_provider` | Object | 令牌提供者配置 |
| `extension_scripts` | Object | 扩展脚本 |
| `app_params` | Object | 应用参数 |
| `enabled` | Boolean | 是否启用 |

#### 连接器（connectors）

| 字段 | 类型 | 说明 |
|------|------|------|
| `connector_code` | String | 连接器唯一编码 |
| `name` | String | 连接器名称 |
| `connector_type` | String | 类型（http_api / webhook_delivery） |
| `method` | String | HTTP 方法 |
| `endpoint_template` | String | 端点模板（支持变量） |
| `headers` | Object | 请求头 |
| `query_params` | Object | 查询参数 |
| `body_template` | String | 请求体模板 |
| `response_map` | Object | 响应映射 |
| `before_script` | String | 前置脚本 |
| `after_script` | String | 后置脚本 |
| `error_handling` | Object | 错误处理配置 |
| `retry_config` | Object | 重试配置 |
| `timeout_sec` | Integer | 超时时间（秒） |
| `enabled` | Boolean | 是否启用 |
| `tags` | Array | 标签列表 |

#### Webhook（webhooks）

| 字段 | 类型 | 说明 |
|------|------|------|
| `webhook_code` | String | Webhook 唯一编码 |
| `name` | String | Webhook 名称 |
| `path` | String | 接收路径 |
| `method` | String | HTTP 方法 |
| `secret` | String | 签名密钥（可选导出） |
| `signature_header` | String | 签名头名称 |
| `signature_method` | String | 签名方法 |
| `payload_parser` | String | 负载解析器 |
| `before_script` | String | 前置脚本 |
| `after_script` | String | 后置脚本 |
| `event_type_field` | String | 事件类型字段 JSONPath |
| `event_type_map` | Object | 事件类型映射 |
| `response_template` | String | 响应模板 |
| `error_handling` | Object | 错误处理配置 |
| `enabled` | Boolean | 是否启用 |
| `ip_whitelist` | Array | IP 白名单 |
| `rate_limit_config` | Object | 限流配置 |

---

## 🔒 安全考虑

### 敏感信息处理

#### 默认不导出的内容

- Webhook Secret（除非勾选"包含密钥"）
- 访问令牌值（除非勾选"包含密钥"）
- 认证配置中的密码/密钥（除非勾选"包含密钥"）

#### 导出包含密钥时的注意事项

⚠️ **警告**: 导出包含密钥的配置文件时，请注意：

1. **文件安全**: 妥善保管导出文件，避免泄露
2. **传输安全**: 通过安全渠道传输文件（加密、HTTPS）
3. **存储安全**: 不要将包含密钥的文件存储在公开位置
4. **权限控制**: 限制文件访问权限
5. **定期轮换**: 导入后尽快更换密钥

#### 导入时的密钥处理

导入时可以选择：
- **跳过密钥**: 导入后需要手动配置密钥（推荐）
- **导入密钥**: 直接使用导出的密钥（仅在安全环境）

---

## 📝 使用场景

### 场景 1: 备份配置

**目的**: 定期备份外部应用配置

**步骤**:
1. 导出应用配置（不包含密钥）
2. 保存到安全位置（如版本控制系统）
3. 定期更新备份

### 场景 2: 环境迁移

**目的**: 从开发环境迁移到生产环境

**步骤**:
1. 在开发环境导出配置
2. 在生产环境导入配置
3. 选择"创建新应用"模式
4. 添加编码前缀（如 `prod_`）
5. 跳过密钥导入
6. 导入后手动配置生产环境的密钥

### 场景 3: 应用复制

**目的**: 快速创建类似的应用

**步骤**:
1. 导出源应用配置
2. 导入时选择"创建新应用"
3. 添加编码前缀（如 `copy_`）
4. 跳过密钥导入
5. 导入后修改必要的配置

### 场景 4: 配置同步

**目的**: 同步多个应用的配置

**步骤**:
1. 导出标准配置模板
2. 在目标环境导入
3. 选择"覆盖已存在应用"（如果应用已存在）
4. 确认覆盖操作

### 场景 5: 测试环境搭建

**目的**: 快速搭建测试环境

**步骤**:
1. 导出生产环境配置
2. 在测试环境导入
3. 添加编码前缀 `test_`
4. 跳过密钥导入
5. 配置测试环境专用的密钥和端点

---

## 🔧 故障排查

### 常见问题

#### Q1: 导出时报错"应用不存在"

**原因**: 应用 ID 无效或应用已被删除

**解决**: 检查应用是否存在，刷新页面重试

#### Q2: 导入时验证失败"应用编码已存在"

**原因**: 目标环境已存在相同编码的应用

**解决**:
- 方案 1: 添加编码前缀
- 方案 2: 选择"覆盖已存在应用"模式（⚠️ 会删除现有配置）
- 方案 3: 先删除现有应用

#### Q3: 导入后连接器无法调用

**原因**: 密钥未导入或配置不正确

**解决**:
1. 检查应用认证配置
2. 检查连接器的 Headers 配置
3. 手动配置缺失的密钥

#### Q4: 导入后 Webhook 接收失败

**原因**: Webhook Secret 未配置

**解决**:
1. 打开 Webhook 配置
2. 手动设置 Secret
3. 更新外部系统的 Webhook 配置

#### Q5: 导出文件过大

**原因**: 应用包含大量配置或脚本

**解决**: 
- 当前不支持选择性导出单个配置项
- 文件已压缩为 JSON 格式
- 如需优化，可手动编辑 JSON 文件

---

## 🎯 最佳实践

### 1. 定期备份

建议每次修改重要配置后，导出备份：
- 频率: 每周或每次重大变更后
- 存储: 版本控制系统（Git）
- 命名: `{app_code}_{date}_{version}.json`

### 2. 版本管理

将导出文件纳入版本控制：

```bash
# 创建备份目录
mkdir -p backups/outbound-apps

# 导出配置
# 手动下载后移动到备份目录

# 提交到 Git
git add backups/outbound-apps/demo_app_20240609.json
git commit -m "backup: demo_app configuration"
git push
```

### 3. 环境隔离

不同环境使用不同的编码前缀：
- 开发环境: `dev_`
- 测试环境: `test_`
- 预发布环境: `staging_`
- 生产环境: `prod_`

### 4. 密钥管理

**导出时**:
- 日常备份: 不包含密钥
- 完整迁移: 包含密钥（加密传输）

**导入时**:
- 跨环境: 跳过密钥导入，手动配置
- 同环境: 可导入密钥（如恢复备份）

### 5. 测试验证

导入后务必测试：
1. 连接器测试: 调用 API 测试端点
2. Webhook 测试: 发送测试事件
3. 脚本测试: 验证扩展脚本执行
4. 集成测试: 端到端测试完整流程

---

## 📊 API 参考

### 导出应用

**请求**:
```http
GET /api/outbound/apps/:id/export?include_secrets=false
Authorization: Bearer {token}
```

**响应**:
```json
{
  "export_version": "1.0",
  "export_time": "2024-06-09T10:30:00Z",
  "export_by": "admin",
  "app": { ... },
  "connectors": [ ... ],
  "webhooks": [ ... ],
  "tokens": [ ... ]
}
```

### 导入应用

**请求**:
```http
POST /api/outbound/apps/import
Content-Type: application/json
Authorization: Bearer {token}

{
  "export_version": "1.0",
  "export_time": "2024-06-09T10:30:00Z",
  "app": { ... },
  "connectors": [ ... ],
  "options": {
    "overwrite_existing": false,
    "generate_new_codes": false,
    "import_secrets": false,
    "prefix": "test_"
  }
}
```

**响应**:
```json
{
  "message": "导入成功",
  "app_id": 123,
  "app_code": "test_demo_app",
  "is_update": false
}
```

### 验证导入数据

**请求**:
```http
POST /api/outbound/apps/import/validate
Content-Type: application/json
Authorization: Bearer {token}

{
  "export_version": "1.0",
  "app": { ... },
  "connectors": [ ... ]
}
```

**响应**:
```json
{
  "valid": true,
  "message": "导入数据验证通过",
  "summary": {
    "app_name": "示例应用",
    "connectors_count": 3,
    "webhooks_count": 2,
    "tokens_count": 1
  }
}
```

---

## 🎊 总结

外部应用导出导入功能已完成，提供：

✅ **完整的配置导出** - 包含所有配置项  
✅ **灵活的导入选项** - 多种导入模式  
✅ **安全的密钥处理** - 可选导出/导入敏感信息  
✅ **友好的用户界面** - 分步骤向导  
✅ **严格的数据验证** - 导入前验证  
✅ **详细的文档说明** - 覆盖所有使用场景  

**可以立即投入使用！** 🚀

---

**文档版本**: v1.0  
**最后更新**: 2024-06-09  
**维护者**: 开发团队
