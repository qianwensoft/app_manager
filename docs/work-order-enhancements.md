# 工单系统增强功能完整说明

## 更新日期
2026-06-21

## 功能概览

本次更新为工单系统添加了两个重要功能：

1. **业务单号字段** - 支持关联内部业务流程编号
2. **状态变更说明** - 支持在状态变更时添加说明，并在外发事件中获取

---

## 一、业务单号功能

### 1.1 数据库字段

- **字段名**: `business_no`
- **类型**: VARCHAR(128) / TEXT
- **索引**: 已建立索引，支持快速查询
- **位置**: `work_orders` 表

### 1.2 数据库迁移

迁移文件已创建：
- SQLite: `/server/migrations/sqlite/003_add_work_order_business_no.sql`
- MySQL: `/server/migrations/mysql/003_add_work_order_business_no.sql`

### 1.3 API 支持

#### 创建工单时设置业务单号

```bash
POST /api/work-orders
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "设备故障",
  "description": "设备无法启动",
  "business_no": "BIZ-2026-001",
  "device_id": 5,
  "priority": "high"
}
```

#### 更新工单业务单号

```bash
PUT /api/work-orders/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "business_no": "BIZ-2026-002"
}
```

业务单号变更会自动记录到工单时间线中。

#### 按业务单号搜索

```bash
GET /api/work-orders?business_no=BIZ-2026
```

支持模糊搜索（LIKE 查询）。

### 1.4 Web 端支持

#### 工单详情页
- 显示业务单号（只读或可编辑模式）
- 支持内联编辑，点击"编辑"按钮修改
- 修改后自动更新并记录到时间线

#### 工单列表页
- 新增"业务单号"列，显示工单的业务单号
- 新增业务单号搜索框，支持模糊搜索
- 搜索条件自动同步到 URL 参数，支持分享链接

#### 工单看板
- 自定义卡片模板中可以使用 `{{business_no}}` 占位符

### 1.5 Android Agent 支持

#### 提交表单
- 在"问题描述"和"其他编码"之间插入"业务单号"输入框
- 支持手动输入业务单号
- 提交时将业务单号发送到服务器

#### 我的工单列表
- 显示工单的业务单号（如果有）

---

## 二、状态变更说明功能

### 2.1 核心机制

当执行以下操作时，可以添加说明（comment），该说明会：

1. 记录到工单时间线（`WorkOrderActivity` 表）
2. 包含在外发事件的 payload 中（`change_comment` 字段）
3. 可在工作流和 Webhook 中通过 `{{change_comment}}` 占位符引用

### 2.2 支持的操作

#### 状态变更操作

```bash
# 关闭工单
POST /api/work-orders/:id/status
{
  "status": "closed",
  "comment": "问题已在版本 v2.1.3 中修复，已验证通过"
}

# 标记为已解决
POST /api/work-orders/:id/status
{
  "status": "resolved",
  "comment": "已更换硬件设备，问题解决"
}

# 标记为处理中
POST /api/work-orders/:id/status
{
  "status": "in_progress",
  "comment": "已安排技术人员现场处理"
}

# 重新打开
POST /api/work-orders/:id/status
{
  "status": "reopened",
  "comment": "问题复现，需要重新处理"
}
```

#### 标签变更操作

标签变更时，系统会自动生成摘要作为 `change_comment`：

```
示例：+紧急 +已验证 -待定
```

### 2.3 外发事件中的字段

所有工单事件的 payload 中都包含 `change_comment` 字段：

```json
{
  "event": "work_order.closed",
  "id": 123,
  "code": "WO-20260621-a1b2c3d4",
  "title": "设备无法连接服务器",
  "status": "closed",
  "status_name": "已关闭",
  "business_no": "BIZ-2026-001",
  "change_comment": "问题已在版本 v2.1.3 中修复，已验证通过",
  "actor": "admin",
  "device_id": 5,
  "created_at": "2026-06-21T10:00:00Z",
  "updated_at": "2026-06-21T10:30:00Z",
  "ts": "2026-06-21T10:30:15Z"
}
```

### 2.4 在 Webhook 中使用

#### 参数映射配置

```json
{
  "work_order_code": "{{code}}",
  "status": "{{status}}",
  "status_name": "{{status_name}}",
  "close_reason": "{{change_comment}}",
  "operator": "{{actor}}",
  "business_no": "{{business_no}}",
  "device_id": "{{device_id}}"
}
```

#### 完整示例

假设配置了一个 Webhook，当工单关闭时调用第三方接口：

**Webhook 配置：**
```json
{
  "name": "工单关闭通知",
  "events": ["work_order.closed"],
  "target": "endpoint",
  "endpoint_id": 1,
  "params_json": {
    "orderNo": "{{code}}",
    "businessNo": "{{business_no}}",
    "closeReason": "{{change_comment}}",
    "closedBy": "{{actor}}",
    "closedAt": "{{ts}}"
  }
}
```

**实际发送的数据：**
```json
{
  "orderNo": "WO-20260621-a1b2c3d4",
  "businessNo": "BIZ-2026-001",
  "closeReason": "问题已在版本 v2.1.3 中修复，已验证通过",
  "closedBy": "admin",
  "closedAt": "2026-06-21T10:35:00Z"
}
```

### 2.5 在工作流中使用

```json
{
  "name": "工单状态变更通知",
  "type_code": "",
  "events": ["work_order.status_changed", "work_order.closed"],
  "actions": [
    {
      "type": "call_endpoint",
      "config": {
        "endpoint_id": 2,
        "params": {
          "title": "工单 {{code}} 状态已更新",
          "content": "新状态：{{status_name}}\n处理说明：{{change_comment}}\n操作人：{{actor}}",
          "priority": "{{priority_name}}",
          "business_no": "{{business_no}}"
        }
      }
    }
  ]
}
```

---

## 三、可用占位符完整列表

在 Webhook 和工作流的参数映射中，可以使用以下占位符：

### 基本信息
- `{{event}}` - 事件类型（如 work_order.closed）
- `{{id}}` - 工单 ID
- `{{code}}` - 工单编号（如 WO-20260621-a1b2c3d4）
- `{{title}}` - 工单标题
- `{{description}}` - 工单描述

### 状态和优先级
- `{{status}}` - 状态代码（open / in_progress / resolved / closed / reopened）
- `{{status_name}}` - 状态中文名称（待处理 / 处理中 / 已解决 / 已关闭 / 重新打开）
- `{{priority}}` - 优先级代码（normal / high / urgent）
- `{{priority_name}}` - 优先级中文名称（普通 / 较高 / 紧急）

### 编号相关
- `{{business_no}}` - **业务单号**（本次新增）
- `{{external_ref}}` - 外部单号（第三方系统回写）
- `{{other_codes}}` - 其他编码（逗号分隔）

### 操作信息
- `{{actor}}` - 操作人（用户名或设备标识）
- `{{change_comment}}` - **变更说明**（本次新增）

### 设备信息
- `{{device_id}}` - 设备 ID
- `{{device_name}}` - 设备名称（快照）
- `{{device_alias_server}}` - 设备别名（后台设置）
- `{{device_alias_agent}}` - 设备别名（端侧设置）
- `{{device_group}}` - 设备分组
- `{{device_serial}}` - 设备序列号（实时）
- `{{device_model}}` - 设备型号
- `{{device_brand}}` - 设备品牌

### 标签
- `{{tags}}` - 标签代码列表（逗号分隔）
- `{{tags_names}}` - 标签名称列表（逗号分隔）

### 提交人信息
- `{{created_by_id}}` - 提交人 ID
- `{{created_by_username}}` - 提交人用户名
- `{{created_by_role}}` - 提交人角色
- `{{submitter}}` - 提交人（兼容字段）

### 时间
- `{{created_at}}` - 创建时间
- `{{updated_at}}` - 更新时间
- `{{ts}}` - 事件时间戳（UTC）

### 其他
- `{{visibility}}` - 可见性（public / private）
- `{{archived}}` - 是否归档（true / false）
- `{{data_json}}` - 类型化字段数据（JSON 字符串）

---

## 四、使用场景示例

### 场景 1：与 JIRA 集成

```json
{
  "name": "同步到 JIRA",
  "events": ["work_order.created", "work_order.status_changed", "work_order.closed"],
  "params": {
    "project": "SUPPORT",
    "summary": "{{title}}",
    "description": "{{description}}\n\n业务单号：{{business_no}}",
    "status": "{{status_name}}",
    "comment": "{{change_comment}}",
    "priority": "{{priority_name}}",
    "reporter": "{{created_by_username}}"
  }
}
```

### 场景 2：钉钉通知

```json
{
  "name": "钉钉工单通知",
  "events": ["work_order.closed"],
  "params": {
    "msgtype": "markdown",
    "markdown": {
      "title": "工单已关闭",
      "text": "## 工单 {{code}} 已关闭\n\n- **标题**: {{title}}\n- **业务单号**: {{business_no}}\n- **关闭原因**: {{change_comment}}\n- **处理人**: {{actor}}\n- **设备**: {{device_name}}"
    }
  }
}
```

### 场景 3：数据仓库审计

```json
{
  "name": "工单审计日志",
  "events": ["work_order.status_changed", "work_order.closed"],
  "params": {
    "event_type": "work_order_status_change",
    "work_order_id": "{{id}}",
    "work_order_code": "{{code}}",
    "business_no": "{{business_no}}",
    "new_status": "{{status}}",
    "new_status_name": "{{status_name}}",
    "change_reason": "{{change_comment}}",
    "operator": "{{actor}}",
    "device_id": "{{device_id}}",
    "timestamp": "{{ts}}"
  }
}
```

---

## 五、测试验证

已创建单元测试验证功能：

```bash
# 运行测试
cd server
go test ./api -v -run TestWorkOrderEventPayload

# 测试结果
✓ Payload structure validated successfully
✓ All required fields present
✓ All webhook placeholders can be resolved
✓ change_comment placeholder works correctly
✓ business_no placeholder works correctly
✓ Empty change_comment handled correctly
```

---

## 六、向后兼容性

1. **业务单号**：
   - 新增字段，旧数据为空字符串
   - 不影响现有功能

2. **状态变更说明**：
   - 新增字段 `change_comment`
   - 旧的 Webhook 配置无需修改
   - 不使用该占位符时为空字符串，不影响现有逻辑

3. **数据库迁移**：
   - SQLite 和 MySQL 迁移脚本已准备
   - 支持在现有数据库上安全升级

---

## 七、注意事项

1. **字段清理**：
   - `change_comment` 和 `business_no` 都会自动清理控制字符
   - 确保 JSON 序列化安全

2. **最大长度**：
   - `business_no`: 建议 128 字符以内
   - `change_comment`: 建议 500 字符以内

3. **搜索性能**：
   - `business_no` 已建立索引，支持高效查询
   - 模糊搜索使用 LIKE，大数据量时注意性能

4. **事件频率**：
   - 每次状态变更都会触发外发事件
   - 建议在 Webhook 端做好幂等性处理

---

## 八、相关文件

### 后端
- `/server/models/work_order.go` - 数据模型
- `/server/api/work_order.go` - 工单 API
- `/server/api/work_order_webhook.go` - 事件分发逻辑
- `/server/api/work_order_tag.go` - 标签变更
- `/server/migrations/sqlite/003_add_work_order_business_no.sql` - SQLite 迁移
- `/server/migrations/mysql/003_add_work_order_business_no.sql` - MySQL 迁移

### Web 端
- `/web/src/views/work-orders/WorkOrderDetail.vue` - 详情页
- `/web/src/views/work-orders/WorkOrders.vue` - 列表页

### Android Agent
- `/agent/app/src/main/res/layout/activity_feedback.xml` - 布局文件
- `/agent/app/src/main/java/com/appmanager/agent/ui/FeedbackActivity.kt` - 提交逻辑

### 测试和文档
- `/server/api/work_order_webhook_payload_test.go` - 单元测试
- `/docs/work-order-change-comment.md` - 功能说明文档

---

## 九、常见问题

### Q1: 业务单号是否必填？
A: 不是必填字段，可以为空。

### Q2: 状态变更时是否必须填写说明？
A: 不是必须的，`comment` 参数可以为空字符串。

### Q3: 如何在现有系统中升级？
A: 运行数据库迁移脚本，然后重启服务即可。旧数据的 `business_no` 将为空，不影响现有功能。

### Q4: 外发事件中的 change_comment 什么时候有值？
A: 
- 状态变更操作（关闭、解决、重开等）：包含用户填写的说明
- 标签变更操作：自动生成摘要（如 `+紧急 -待定`）
- 普通更新操作：为空字符串

### Q5: 如何在工作流中判断是否有变更说明？
A: 可以在工作流的 `execute_js` 动作中检查：
```javascript
if (payload.change_comment && payload.change_comment.trim() !== '') {
  // 有变更说明
}
```

---

**更新完成日期**: 2026-06-21  
**版本**: v1.0  
**维护者**: 开发团队
