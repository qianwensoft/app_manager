# 工单外发配置 - 占位符增强说明

## 概述

工单外发配置的入参映射支持占位符，用于将工单事件数据映射到目标接口的参数。本次增强为**标签**、**状态**、**优先级**三个字段增加了「名称」占位符，方便外发时使用中文名称而非编码。

## 新增占位符

### 1. 标签占位符

| 占位符 | 说明 | 示例输出 |
|--------|------|----------|
| `{{tags}}` | 标签编码列表（逗号分隔） | `urgent,hardware,network` |
| `{{tags_names}}` | 标签名称列表（逗号分隔） | `紧急,硬件故障,网络问题` |

**使用场景：**
- 外发到第三方系统时，通常需要使用中文标签名称而非内部编码
- 例如发送到企业微信、钉钉等消息平台时，显示 "硬件故障" 比 "hardware" 更易读

### 2. 状态占位符

| 占位符 | 说明 | 示例输出 |
|--------|------|----------|
| `{{status}}` | 状态编码 | `open`, `in_progress`, `resolved`, `closed`, `reopened` |
| `{{status_name}}` | 状态中文名称 | `待处理`, `处理中`, `已解决`, `已关闭`, `重新打开` |

**使用场景：**
- 状态变更通知：`工单 {{code}} 状态已更新为：{{status_name}}`
- 第三方系统集成时，接口可能需要中文状态描述

### 3. 优先级占位符

| 占位符 | 说明 | 示例输出 |
|--------|------|----------|
| `{{priority}}` | 优先级编码 | `normal`, `high`, `urgent` |
| `{{priority_name}}` | 优先级中文名称 | `普通`, `较高`, `紧急` |

**使用场景：**
- 工单标题带优先级：`【{{priority_name}}】{{title}}`
- 告警级别映射：将 `urgent` 映射为告警系统的 "紧急" 级别

## 使用示例

### 示例1：企业微信消息通知

```json
{
  "msgtype": "text",
  "text": {
    "content": "【{{priority_name}}】工单 {{code}}\n状态：{{status_name}}\n设备：{{device_name}}\n标签：{{tags_names}}\n描述：{{description}}"
  }
}
```

**输出效果：**
```
【紧急】工单 WO-20260620-001
状态：处理中
设备：生产车间-设备A
标签：硬件故障,网络问题
描述：设备频繁断网重启
```

### 示例2：第三方工单系统集成

```json
{
  "ticket_id": "{{code}}",
  "title": "{{title}}",
  "status": "{{status}}",
  "status_display": "{{status_name}}",
  "priority_level": "{{priority}}",
  "priority_display": "{{priority_name}}",
  "tags": "{{tags_names}}",
  "device_info": "{{device_name}}（{{device_serial}}）"
}
```

### 示例3：多参数拼接

```json
{
  "summary": "{{device_name}}_{{code}}_{{status_name}}",
  "description": "设备：{{device_name}}（{{device_serial}}），分组：{{device_group}}\n状态：{{status_name}}\n优先级：{{priority_name}}\n标签：{{tags_names}}"
}
```

## 在配置界面中使用

1. **下拉框智能提示**：在入参映射的值输入框中，下拉选择时会看到分类展示的所有占位符，包括新增的名称占位符

2. **查看所有占位符**：点击「查看所有占位符」按钮，可以看到完整的占位符列表和分类说明

3. **常用示例**：提供了多个常用的多参数拼接示例，可直接复制使用

4. **复制功能**：每个占位符和示例都提供了复制按钮，方便快速使用

## 技术实现

### 后端实现 (server/api/work_order_webhook.go)

```go
// workOrderTagNames 获取工单标签名称列表（用于 webhook payload）
func workOrderTagNames(woID uint) []string {
    // 查询工单标签关联 -> 查询标签字典 -> 返回名称列表
}

// workOrderStatusName 获取状态中文名称
func workOrderStatusName(status string) string {
    // 状态编码 -> 中文名称映射
}

// workOrderPriorityName 获取优先级中文名称
func workOrderPriorityName(priority string) string {
    // 优先级编码 -> 中文名称映射
}
```

### 前端实现 (web/src/views/work-orders/)

- `workOrderConst.js`: 定义所有可用的占位符参数，按分类组织
- `WorkOrderWebhooks.vue`: 配置界面，提供下拉选择、智能提示、示例复制等功能

## 注意事项

1. **编码 vs 名称**：
   - 编码（如 `{{status}}`）适合用于 API 接口集成，保证数据一致性
   - 名称（如 `{{status_name}}`）适合用于消息通知、用户界面展示

2. **标签顺序**：标签列表按工单关联顺序返回，与工单详情页显示顺序一致

3. **未知值处理**：
   - 如果标签编码在字典中找不到，会返回原始编码
   - 如果状态/优先级是未知值，会返回原始值

4. **性能考虑**：
   - 标签名称查询会批量查询字典表，避免 N+1 查询问题
   - 状态和优先级使用内存映射，无数据库查询开销

## 测试验证

已添加单元测试验证状态和优先级名称转换功能：

```bash
go test ./api -run "TestWorkOrderStatusName|TestWorkOrderPriorityName" -v
```

## 版本历史

- 2026-06-20: 新增标签名称、状态名称、优先级名称占位符
