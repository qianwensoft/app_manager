# 工单状态变更说明功能

## 概述

在工单状态变更（关闭、标记已处理、重新打开等）时，现在可以添加说明文字，该说明会：

1. 记录到工单时间线（`WorkOrderActivity`）
2. 通过外发事件传递给外部系统
3. 在工作流中可以通过 `{{change_comment}}` 占位符引用

## 字段说明

### 新增字段：`change_comment`

在工单事件的 payload 中新增了 `change_comment` 字段，包含以下场景的说明信息：

- **状态变更**：关闭工单、标记为已处理、重新打开时的说明
- **标签变更**：添加或移除标签的摘要（如：`+紧急 +误报 -待定`）
- **其他操作**：普通更新操作时为空字符串

## API 使用示例

### 1. 状态变更时添加说明

```bash
# 关闭工单并添加说明
POST /api/work-orders/:id/status
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "closed",
  "comment": "问题已在版本 v2.1.3 中修复，已验证通过"
}
```

### 2. 标记为已解决并添加说明

```bash
POST /api/work-orders/:id/status
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "resolved",
  "comment": "已更换硬件设备，问题解决"
}
```

## 外发事件中使用

### 1. 在 Webhook 参数中引用

配置工单 Webhook 时，可以在参数映射中使用 `{{change_comment}}` 占位符：

```json
{
  "work_order_code": "{{code}}",
  "status": "{{status}}",
  "status_name": "{{status_name}}",
  "change_reason": "{{change_comment}}",
  "operator": "{{actor}}",
  "business_no": "{{business_no}}"
}
```

### 2. 在工作流中使用

在工作流的动作配置中，可以直接引用状态变更说明：

```json
{
  "name": "工单关闭通知",
  "events": ["work_order.closed"],
  "actions": [
    {
      "type": "call_endpoint",
      "config": {
        "endpoint_id": 1,
        "params": {
          "title": "工单{{code}}已关闭",
          "content": "{{change_comment}}",
          "closed_by": "{{actor}}"
        }
      }
    }
  ]
}
```

## 事件 Payload 完整示例

### work_order.status_changed 事件

```json
{
  "event": "work_order.status_changed",
  "id": 123,
  "code": "WO-20260621-a1b2c3d4",
  "title": "设备无法连接服务器",
  "status": "resolved",
  "status_name": "已解决",
  "priority": "high",
  "priority_name": "较高",
  "business_no": "BIZ-2026-001",
  "actor": "admin",
  "change_comment": "已更换网络设备，连接恢复正常",
  "device_id": 5,
  "device_name": "测试设备-01",
  "created_at": "2026-06-21T10:00:00Z",
  "updated_at": "2026-06-21T10:30:00Z",
  "ts": "2026-06-21T10:30:15Z"
}
```

### work_order.closed 事件

```json
{
  "event": "work_order.closed",
  "id": 123,
  "code": "WO-20260621-a1b2c3d4",
  "status": "closed",
  "status_name": "已关闭",
  "change_comment": "问题已在版本 v2.1.3 中修复，已验证通过",
  "closed_by_id": 1,
  "closed_by_username": "admin",
  "closed_at": "2026-06-21T10:35:00Z"
}
```

### work_order.tags_changed 事件

```json
{
  "event": "work_order.tags_changed",
  "id": 123,
  "code": "WO-20260621-a1b2c3d4",
  "tags": "urgent,verified",
  "tags_names": "紧急,已验证",
  "change_comment": "+紧急 +已验证 -待定",
  "actor": "operator1"
}
```

## 使用场景

### 1. 问题跟踪系统集成

将工单状态同步到外部问题跟踪系统（如 JIRA、Redmine）时，`change_comment` 可以作为备注信息：

```json
{
  "issue_key": "{{external_ref}}",
  "status": "{{status_name}}",
  "comment": "{{change_comment}}",
  "updated_by": "{{actor}}"
}
```

### 2. 通知系统

发送工单状态变更通知时，包含处理说明：

```
工单 {{code}} 状态已更新为 {{status_name}}

处理说明：{{change_comment}}

处理人：{{actor}}
更新时间：{{ts}}
```

### 3. 审计日志

记录详细的工单操作审计日志：

```json
{
  "event_type": "work_order_status_change",
  "work_order_id": "{{id}}",
  "work_order_code": "{{code}}",
  "from_status": "in_progress",
  "to_status": "{{status}}",
  "operator": "{{actor}}",
  "reason": "{{change_comment}}",
  "timestamp": "{{ts}}"
}
```

## 注意事项

1. **字段清理**：`change_comment` 会自动清理控制字符，确保 JSON 安全
2. **空值处理**：非状态变更/标签变更操作时，该字段为空字符串
3. **最大长度**：建议说明文字控制在 500 字符以内
4. **向后兼容**：旧版本的 webhook 配置无需修改，新字段不会影响现有功能

## 相关字段对比

| 字段 | 说明 | 使用场景 |
|------|------|----------|
| `business_no` | 业务单号 | 关联内部业务流程编号 |
| `external_ref` | 外部单号 | 第三方系统回写的工单号 |
| `change_comment` | 变更说明 | 状态变更/标签变更的原因或说明 |
| `description` | 工单描述 | 问题的详细描述（创建时填写） |
| `actor` | 操作人 | 执行操作的用户或设备标识 |

## 更新日志

- **2026-06-21**：新增 `change_comment` 字段，支持状态变更说明在外发事件中传递
