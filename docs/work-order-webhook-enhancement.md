# 工单外发配置参数映射增强

## 概述

本次更新大幅增强了工单外发配置的参数映射功能，支持多参数拼接和完整的上下文信息获取，使外发数据更加灵活和丰富。

## 主要改进

### 1. 支持多参数拼接

**之前**：只能单独使用占位符或纯文本
```json
{
  "order_no": "{{code}}",
  "device": "{{device_name}}"
}
```

**现在**：支持在一个字段中拼接多个占位符和文本
```json
{
  "order_no": "{{code}}",
  "device": "{{device_name}}_{{device_serial}}",
  "title": "【{{priority}}】{{title}}",
  "description": "设备：{{device_name}}（{{device_serial}}）\n分组：{{device_group}}\n提交人：{{created_by_username}}\n\n问题描述：\n{{description}}"
}
```

### 2. 大幅扩展可用字段（从 19 个增加到 60+ 个）

#### 新增字段分类

**工单基础信息**（新增）：
- `type_name`、`type_description` - 工单类型名称和描述
- `updated_at`、`archived` - 更新时间和归档状态

**提交设备信息（快照）**：
- 保持原有字段：`device_name`、`device_alias_server`、`device_alias_agent`、`device_group`
- 这些字段记录工单提交时刻的设备信息，不会随设备改名而变化

**提交设备信息（实时）**（新增）：
- `device_serial` - 设备序列号
- `device_name_current` - 设备当前名称
- `device_alias_server_current`、`device_alias_agent_current` - 当前别名
- `device_group_current` - 当前分组
- `device_model`、`device_brand` - 设备型号和品牌
- `device_os_version`、`device_status` - 操作系统版本和设备状态
- `device_ip`、`device_battery` - IP 地址和电量

**提交用户信息**（新增）：
- `created_by_id`、`created_by_username`、`created_by_role` - 提交人信息
- `submitter` - 兼容旧字段

**分配人信息**（新增）：
- `assigned_to_id`、`assigned_to_username` - 分配给谁

**关闭人信息**（新增）：
- `closed_by_id`、`closed_by_username`、`closed_at` - 关闭人和时间

**归档人信息**（新增）：
- `archived_by_id`、`archived_by_username`、`archived_at` - 归档人和时间

### 3. UI 交互优化

#### 3.1 分组显示占位符

占位符按以下分类分组显示，便于查找：
- 基础信息
- 设备（快照）
- 设备（实时）
- 提交人
- 分配人
- 关闭人
- 归档人
- 时间

#### 3.2 占位符帮助面板

新增"查看所有占位符"按钮，打开帮助对话框：
- 按分类 Tab 展示所有可用占位符
- 每个占位符旁有"复制"按钮，一键复制到剪贴板
- 提供常用示例 Tab，包含：
  - 多参数拼接（下划线分隔）
  - 设备信息描述
  - 提交人信息
  - 设备硬件信息
  - 工单标题（带优先级）

#### 3.3 下拉选择优化

在值映射下拉框中：
- 按分类分组显示所有占位符
- 显示占位符的中文说明和占位符格式
- 提供多参数拼接示例选项

### 4. 完整文档

新增 `docs/work-order-webhook-params.md` 文档，包含：
- 所有占位符的完整列表（60+ 个）
- 每个占位符的说明和示例值
- 配置示例（单个占位符、多参数拼接、URL 参数等）
- 注意事项和最佳实践

## 技术实现

### 后端改进（Go）

**文件**：`server/api/work_order_webhook.go`

1. **`workOrderEventPayload` 函数增强**：
   - 新增 30+ 个字段
   - 实时查询提交用户、分配人、关闭人、归档人信息
   - 实时查询设备当前信息（区别于快照）
   - 查询工单类型详细信息

2. **`renderPlaceholders` 函数改进**：
   - 单个占位符：保留原始类型（数字、布尔等）
   - 多个占位符或混合文本：执行字符串替换
   - 支持时间类型格式化
   - 支持布尔值转字符串

### 前端改进（Vue 3）

**文件**：
- `web/src/views/work-orders/workOrderConst.js` - 占位符常量定义
- `web/src/views/work-orders/WorkOrderWebhooks.vue` - UI 界面

1. **常量扩展**：
   - 从 19 个参数扩展到 60+ 个
   - 为每个参数添加 `category` 分类
   - 新增 `workOrderEventParamsByCategory` 分组对象
   - 新增 `paramCategories` 分类顺序数组

2. **UI 组件改进**：
   - 新增占位符帮助对话框（`showParamHelper`）
   - 分类 Tab 展示所有占位符
   - 一键复制功能（`copyToClipboard`）
   - 常用示例展示
   - 下拉选择支持分组显示

## 使用示例

### 示例 1：基础单字段映射

```json
{
  "work_order_id": "{{id}}",
  "code": "{{code}}",
  "status": "{{status}}"
}
```

### 示例 2：多参数拼接

```json
{
  "title": "【{{priority}}】{{title}}",
  "device_info": "{{device_name}}_{{device_serial}}_{{device_group}}",
  "external_code": "WO_{{type_code}}_{{id}}_{{code}}"
}
```

### 示例 3：复杂描述拼接

```json
{
  "summary": "{{device_group}} - {{device_name}} - {{title}}",
  "description": "设备：{{device_name}}（{{device_serial}}）\n分组：{{device_group}}\n提交人：{{created_by_username}} [{{created_by_role}}]\n设备信息：型号 {{device_model}}，品牌 {{device_brand}}，系统 Android {{device_os_version}}，电量 {{device_battery}}%\n\n问题描述：\n{{description}}",
  "reporter": "{{created_by_username}}",
  "device_status": "{{device_status}}"
}
```

### 示例 4：URL 参数拼接

```json
{
  "callback_url": "https://api.example.com/webhook?code={{code}}&device={{device_id}}&status={{status}}",
  "ticket_ref": "TICKET-{{type_code}}-{{id}}"
}
```

## 类型保留规则

- **单个占位符**（如 `"{{id}}"`）：保留原始类型
  - 数字 → 数字
  - 布尔 → 布尔
  - 字符串 → 字符串
  
- **多个占位符或混合文本**：转为字符串
  - `"{{id}}_{{code}}"` → 字符串 `"123_WO-20260620-abc"`
  - `"设备：{{device_name}}"` → 字符串 `"设备：生产线A"`

## 快照 vs 实时字段

### 快照字段（提交时冻结）
适用于审计、对账场景，记录工单提交时刻的设备状态：
- `device_name`、`device_alias_server`、`device_alias_agent`、`device_group`

### 实时字段（外发时查询）
适用于需要当前最新设备信息的场景：
- `device_name_current`、`device_serial`、`device_model`、`device_brand`、`device_os_version`、`device_status`、`device_ip`、`device_battery`

**推荐做法**：
- 审计日志、外部工单系统 → 使用快照字段
- 实时监控、设备状态推送 → 使用实时字段
- 两者结合使用 → 可以对比设备改名前后的状态

## 兼容性

- 已有配置完全兼容，无需修改
- 新增字段向后兼容，旧占位符继续可用
- `submitter` 字段保留作为兼容字段（等价于 `created_by_username`）

## 测试建议

1. **单个占位符测试**：验证类型保留功能
2. **多参数拼接测试**：验证字符串拼接和格式化
3. **设备信息测试**：
   - 提交工单后改设备名
   - 验证快照字段不变
   - 验证实时字段已更新
4. **用户信息测试**：验证提交人、分配人、关闭人信息正确
5. **空值测试**：验证字段不存在时的降级处理

## 后续改进建议

1. 支持占位符函数：`{{upper(device_name)}}`、`{{date_format(created_at, 'YYYY-MM-DD')}}`
2. 支持条件表达式：`{{priority == 'urgent' ? '紧急' : '普通'}}`
3. 支持数组遍历：`{{#each tags}}{{this}},{{/each}}`
4. 提供在线测试工具，实时预览占位符替换结果
