# 工单外发配置 - 参数映射占位符

工单外发配置的 `params_json` 字段支持使用占位符从工单事件中提取数据。占位符格式为 `{{field_name}}`。

## 支持多参数拼接

参数值支持以下三种形式：

1. **单个占位符**（保留原始类型）：`"{{id}}"` → 返回数字类型
2. **多个占位符拼接**：`"{{device_name}}_{{code}}_{{status}}"` → 返回字符串 "设备A_WO-20260620-abc123_open"
3. **混合文本和占位符**：`"设备：{{device_name}}，状态：{{status}}，优先级：{{priority}}"` → 返回完整描述文本

## 可用占位符字段

### 工单基础信息

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{event}}` | 事件类型 | `work_order.created` |
| `{{id}}` | 工单 ID | `123` |
| `{{code}}` | 工单编号 | `WO-20260620-abc123` |
| `{{type_code}}` | 工单类型编码 | `device_fault` |
| `{{type_name}}` | 工单类型名称 | `设备故障` |
| `{{type_description}}` | 工单类型描述 | `设备硬件或软件故障反馈` |
| `{{title}}` | 工单标题 | `设备无法启动` |
| `{{description}}` | 工单描述 | `详细问题描述...` |
| `{{status}}` | 工单状态 | `open`/`in_progress`/`resolved`/`closed`/`reopened` |
| `{{priority}}` | 优先级 | `normal`/`high`/`urgent` |
| `{{visibility}}` | 可见性 | `private`/`public` |
| `{{external_ref}}` | 外部系统工单号 | `EXT-12345` |
| `{{other_codes}}` | 其他编码（二维码等） | `QR001,QR002` |
| `{{data_json}}` | 表单类型化字段数据 | JSON 字符串 |
| `{{tags}}` | 工单标签（逗号分隔） | `urgent,hardware` |
| `{{archived}}` | 是否已归档 | `true`/`false` |
| `{{actor}}` | 当前操作人 | `admin` 或 `设备#123` |

### 提交设备信息（快照）

这些字段保存的是工单**提交时刻**的设备信息快照，不会随设备信息变更而改变：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{device_id}}` | 设备 ID | `123` |
| `{{device_name}}` | 设备名称（快照） | `生产线A-1号机` |
| `{{device_alias_server}}` | 设备别名-后台（快照） | `机器1` |
| `{{device_alias_agent}}` | 设备别名-端侧（快照） | `前台设备` |
| `{{device_group}}` | 设备分组（快照） | `生产车间` |

### 提交设备信息（当前实时）

这些字段是工单外发时**实时查询**的设备当前信息：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{device_serial}}` | 设备序列号 | `ABC123456789` |
| `{{device_name_current}}` | 设备当前名称 | `生产线A-1号机(已更新)` |
| `{{device_alias_server_current}}` | 设备当前别名-后台 | `机器1(新)` |
| `{{device_alias_agent_current}}` | 设备当前别名-端侧 | `前台设备(新)` |
| `{{device_group_current}}` | 设备当前分组 | `维修车间` |
| `{{device_model}}` | 设备型号 | `SM-G9900` |
| `{{device_brand}}` | 设备品牌 | `samsung` |
| `{{device_os_version}}` | 操作系统版本 | `13` |
| `{{device_status}}` | 设备状态 | `online`/`offline` |
| `{{device_ip}}` | 设备 IP 地址 | `192.168.1.100` |
| `{{device_battery}}` | 设备电量 | `85` |

### 提交用户信息

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{created_by_id}}` | 提交人用户 ID | `5` |
| `{{created_by_username}}` | 提交人用户名 | `zhangsan` |
| `{{created_by_role}}` | 提交人角色 | `admin`/`operator`/`viewer` |
| `{{submitter}}` | 提交人（兼容旧字段） | `zhangsan` |

### 分配人信息

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{assigned_to_id}}` | 分配给用户 ID | `6` |
| `{{assigned_to_username}}` | 分配给用户名 | `lisi` |

### 关闭人信息

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{closed_by_id}}` | 关闭人用户 ID | `7` |
| `{{closed_by_username}}` | 关闭人用户名 | `admin` |
| `{{closed_at}}` | 关闭时间 | `2026-06-20T10:30:00Z` |

### 归档人信息

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{archived_by_id}}` | 归档人用户 ID | `8` |
| `{{archived_by_username}}` | 归档人用户名 | `admin` |
| `{{archived_at}}` | 归档时间 | `2026-06-20T11:00:00Z` |

### 时间信息

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{{created_at}}` | 工单创建时间 | `2026-06-20T09:00:00Z` |
| `{{updated_at}}` | 工单更新时间 | `2026-06-20T10:00:00Z` |
| `{{ts}}` | 事件触发时间戳 | `2026-06-20T10:30:45Z` |

## 配置示例

### 示例 1：单个占位符（保留类型）

```json
{
  "params_json": {
    "work_order_id": "{{id}}",
    "device_id": "{{device_id}}",
    "priority": "{{priority}}"
  }
}
```

结果（JSON 类型保持）：
```json
{
  "work_order_id": 123,
  "device_id": 456,
  "priority": "high"
}
```

### 示例 2：多参数拼接

```json
{
  "params_json": {
    "title": "【{{priority}}】{{title}}",
    "description": "设备：{{device_name}}（{{device_serial}}）\n分组：{{device_group}}\n提交人：{{created_by_username}}\n\n问题描述：\n{{description}}",
    "external_code": "{{code}}_{{device_id}}_{{type_code}}"
  }
}
```

结果：
```json
{
  "title": "【high】设备无法启动",
  "description": "设备：生产线A-1号机（ABC123456789）\n分组：生产车间\n提交人：zhangsan\n\n问题描述：\n详细问题描述...",
  "external_code": "WO-20260620-abc123_123_device_fault"
}
```

### 示例 3：使用转义字符换行

支持的转义字符：
- `\n` - 换行（Unix/Linux）
- `\r\n` - 回车换行（Windows）
- `\r` - 回车（Mac 旧系统）
- `\t` - 制表符
- `\\` - 反斜杠本身

```json
{
  "params_json": {
    "description": "设备信息：\n型号：{{device_model}}\n品牌：{{device_brand}}\n系统：Android {{device_os_version}}\n电量：{{device_battery}}%\n\n工单信息：\n标题：{{title}}\n优先级：{{priority}}\n状态：{{status}}",
    "multiline_text": "第一行\r\n第二行\r\n第三行",
    "with_tabs": "列1\t列2\t列3"
  }
}
```

结果（实际会换行）：
```
设备信息：
型号：SM-G9900
品牌：samsung
系统：Android 13
电量：85%

工单信息：
标题：设备无法启动
优先级：high
状态：open
```

### 示例 4：条件信息拼接

```json
{
  "params_json": {
    "summary": "{{device_group}} - {{device_name}} - {{title}}",
    "reporter": "{{created_by_username}} [{{created_by_role}}]",
    "device_info": "型号：{{device_model}}，品牌：{{device_brand}}，系统：Android {{device_os_version}}，电量：{{device_battery}}%",
    "assignee": "{{assigned_to_username}}",
    "tags": "{{tags}},{{priority}},{{type_code}}"
  }
}
```

### 示例 5：URL 参数拼接

```json
{
  "params_json": {
    "callback_url": "https://api.example.com/webhook?code={{code}}&device={{device_id}}&status={{status}}",
    "ticket_ref": "TICKET-{{type_code}}-{{id}}"
  }
}
```

## 注意事项

1. **占位符大小写敏感**：必须使用小写字母和下划线，如 `{{device_name}}`，不能写成 `{{Device_Name}}`
2. **不存在的占位符**：如果占位符字段不存在或为空，会被替换为空字符串
3. **类型保留**：只有当参数值**完全是单个占位符**时才保留原始类型（数字、布尔等），包含任何其他文本都会转为字符串
4. **空值处理**：
   - 字符串空值 → `""`
   - 数字空值 → `""`
   - 时间空值 → `""`
   - 布尔值 → `"true"` 或 `"false"`
5. **设备信息快照 vs 实时**：
   - 快照字段（`device_name`、`device_alias_server` 等）记录提交时刻的值，用于审计
   - 实时字段（`device_name_current`、`device_serial` 等）反映当前最新状态
6. **用户信息查询失败**：如果提交用户、分配人等已被删除，对应的用户信息占位符会为空
7. **转义字符**：支持 `\n`（换行）、`\r\n`（Windows 换行）、`\t`（制表符）、`\\`（反斜杠）等转义字符
   - 配置时使用：`"第一行\n第二行"` 会实际换行
   - JSON 中需要双重转义：`"第一行\\n第二行"` → 服务端处理为 `"第一行\n第二行"`
8. **JSON 编辑器提示**：
   - 表格模式：自动处理转义，直接输入 `\n` 即可
   - JSON 模式：需要按 JSON 规范双重转义 `\\n`

## 事件类型

外发配置可以监听以下工单事件（`events` 字段）：

- `work_order.created` - 工单创建
- `work_order.updated` - 工单更新（标题、描述、优先级、可见性、其他编码）
- `work_order.status_changed` - 工单状态变更
- `work_order.assigned` - 工单分配
- `work_order.closed` - 工单关闭
- `work_order.reopened` - 工单重开
- `work_order.archived` - 工单归档
- `work_order.commented` - 工单评论

留空表示监听所有事件。
