# Workflow 集成使用指南

本文档介绍如何在 app-manager 中使用集成的 Workflow Engine 功能。

---

## 功能概述

Workflow Engine 允许您通过可视化的方式配置事件驱动的自动化流程，无需编写代码。

### 核心特性

- ✅ **可视化编排** - 拖拽节点连接，构建工作流
- ✅ **事件触发** - 自定义事件、表单事件、设备事件自动触发
- ✅ **多端支持** - React H5、React Native、Flutter、小程序
- ✅ **实时协同** - 基于 Yjs CRDT 的多人编辑
- ✅ **向后兼容** - 不影响现有功能，可选开启

---

## 快速开始

### 1. 运行数据库迁移

首次使用需要运行数据库迁移，添加 Workflow 相关表：

```bash
cd server

# 编辑 main.go 或迁移入口，添加迁移调用
# import "app-manager/migrations"
# migrations.AddWorkflowSupport(database.DB)

go run main.go
```

迁移将创建以下表：
- `workflow_definitions` - 工作流定义
- `workflow_executions` - 执行记录

并扩展现有表：
- `custom_event_definitions` 添加 `workflow_id`, `workflow_enabled` 字段
- `form_app_event_routes` 添加 `workflow_id`, `action_type` 字段

### 2. 创建第一个 Workflow

**方式 1：通过 API**

```bash
curl -X POST http://localhost:8080/api/workflows \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "扫码后自动填充表单",
    "description": "扫描二维码后自动填入产品信息",
    "category": "device",
    "trigger_type": "custom_event",
    "trigger_config": "{\"custom_event_key\":\"barcode_scan\"}",
    "schema_json": "{\"nodes\":[...],\"edges\":[...]}",
    "enabled": true
  }'
```

**方式 2：通过前端界面（待实现）**

访问 `/workflows` 页面，点击"新建工作流"。

### 3. 绑定到现有事件

**绑定到自定义事件**

```bash
curl -X POST http://localhost:8080/api/custom-events/123/bind-workflow \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 456
  }'
```

**绑定到表单事件**

```bash
curl -X POST http://localhost:8080/api/form-apps/789/event-routes/101/bind-workflow \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 456,
    "action_type": "both"
  }'
```

`action_type` 可选值：
- `navigate` - 仅页面跳转（原有行为）
- `workflow` - 仅执行工作流
- `both` - 先跳转再执行工作流

---

## 节点类型

### 触发器节点

| 节点类型 | 说明 | 输出变量 |
|---------|------|---------|
| `form_trigger` | 表单事件触发 | `fieldValue`, `formData`, `eventContext` |
| `custom_event_trigger` | 自定义事件触发 | `eventKey`, `eventData`, `deviceId` |
| `device_event_trigger` | 设备事件触发 | `eventType`, `eventData`, `deviceId` |

### 表单操作节点

| 节点类型 | 说明 | 配置参数 |
|---------|------|---------|
| `form_action` | 表单字段操作 | `formId`, `actionType`, `targetField`, `value` |
| `form_validation` | 表单校验 | `formId`, `fields`, `rules` |
| `form_submit` | 提交表单 | `formId`, `submitUrl` |

### 设备操作节点

| 节点类型 | 说明 | 配置参数 |
|---------|------|---------|
| `device_scan` | 扫码 | `scanType`, `timeout`, `resultFormat` |
| `device_photo` | 拍照 | `source`, `maxPhotos`, `compress`, `quality` |
| `device_bluetooth` | 蓝牙打印 | `printerAddress`, `template`, `dataSource` |

### 逻辑控制节点

| 节点类型 | 说明 | 配置参数 |
|---------|------|---------|
| `condition` | 条件分支 | `conditions`, `trueOutput`, `falseOutput` |
| `loop` | 循环 | `items`, `maxIterations` |
| `parallel` | 并行执行 | `branches` |

### 集成节点

| 节点类型 | 说明 | 配置参数 |
|---------|------|---------|
| `http` | HTTP 请求 | `url`, `method`, `headers`, `body` |
| `database` | 数据库查询 | `dataSourceId`, `sql`, `params` |
| `outbound` | 出站连接器 | `connectorId`, `payload` |
| `llm` | LLM 调用 | `model`, `prompt`, `temperature` |

---

## 使用场景

### 场景 1：扫码后自动填充表单

**需求**: 扫描产品二维码后，自动填充产品名称、规格、价格

**实现步骤**:

1. 创建 Workflow

```json
{
  "name": "扫码自动填充",
  "nodes": [
    {
      "id": "trigger",
      "type": "custom_event_trigger",
      "config": {
        "eventKey": "barcode_scan"
      }
    },
    {
      "id": "query_product",
      "type": "http",
      "config": {
        "url": "https://api.example.com/products/{{trigger.eventData.barcode}}",
        "method": "GET"
      }
    },
    {
      "id": "fill_form",
      "type": "form_action",
      "config": {
        "formId": 123,
        "actionType": "field.setValue",
        "targetField": "product_name",
        "value": "{{query_product.response.name}}"
      }
    }
  ],
  "edges": [
    { "from": "trigger", "to": "query_product" },
    { "from": "query_product", "to": "fill_form" }
  ]
}
```

2. 绑定到自定义事件

```bash
# 找到 barcode_scan 事件定义的 ID
GET /api/custom-event-definitions?key=barcode_scan

# 绑定 Workflow
POST /api/custom-events/{id}/bind-workflow
{ "workflow_id": <workflow_id> }
```

3. 测试

在 Agent 端扫描二维码，Workflow 将自动执行。

---

### 场景 2：表单提交后发送通知

**需求**: 用户提交工单后，自动发送钉钉通知

**实现步骤**:

1. 创建 Workflow

```json
{
  "name": "工单提交通知",
  "nodes": [
    {
      "id": "trigger",
      "type": "form_trigger",
      "config": {
        "formId": 456,
        "triggerType": "form.submit"
      }
    },
    {
      "id": "send_dingtalk",
      "type": "http",
      "config": {
        "url": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
        "method": "POST",
        "body": {
          "msgtype": "text",
          "text": {
            "content": "新工单：{{trigger.formData.title}}"
          }
        }
      }
    }
  ],
  "edges": [
    { "from": "trigger", "to": "send_dingtalk" }
  ]
}
```

2. 在表单设计器中配置事件（前端界面待实现）

或通过 API 创建 FormAppEventRoute 并绑定。

---

### 场景 3：条件审批流程

**需求**: 工单金额 > 1000 元需要主管审批，否则自动通过

**实现步骤**:

```json
{
  "name": "条件审批",
  "nodes": [
    {
      "id": "trigger",
      "type": "form_trigger",
      "config": {
        "formId": 789,
        "triggerType": "form.submit"
      }
    },
    {
      "id": "check_amount",
      "type": "condition",
      "config": {
        "conditions": [
          {
            "field": "{{trigger.formData.amount}}",
            "operator": "gt",
            "value": 1000
          }
        ]
      }
    },
    {
      "id": "auto_approve",
      "type": "form_action",
      "config": {
        "formId": 789,
        "actionType": "field.setValue",
        "targetField": "status",
        "value": "approved"
      }
    },
    {
      "id": "request_approval",
      "type": "http",
      "config": {
        "url": "/api/work-orders/{{trigger.formData.id}}/request-approval",
        "method": "POST"
      }
    }
  ],
  "edges": [
    { "from": "trigger", "to": "check_amount" },
    { "from": "check_amount", "to": "auto_approve", "condition": "false" },
    { "from": "check_amount", "to": "request_approval", "condition": "true" }
  ]
}
```

---

## API 参考

### Workflow CRUD

**列出工作流**
```http
GET /api/workflows
Query Parameters:
  - category: form | device | custom_event | manual
  - trigger_type: custom_event | form_event | manual | schedule
  - enabled: true | false
```

**创建工作流**
```http
POST /api/workflows
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "category": "form",
  "schema_json": "string",
  "trigger_type": "custom_event",
  "trigger_config": "string",
  "enabled": true,
  "timeout": 300,
  "visibility": "private"
}
```

**更新工作流**
```http
PUT /api/workflows/:id
Content-Type: application/json
```

**删除工作流**
```http
DELETE /api/workflows/:id
```

### 执行管理

**手动触发**
```http
POST /api/workflows/:id/execute
Content-Type: application/json

{
  "input": {
    "key": "value"
  }
}
```

**查看执行历史**
```http
GET /api/workflows/:id/executions
Query Parameters:
  - page: 1
  - page_size: 20
  - status: pending | running | completed | failed | timeout
```

**查看执行详情**
```http
GET /api/workflows/executions/:exec_id
```

### 事件绑定

**绑定到自定义事件**
```http
POST /api/custom-events/:id/bind-workflow
Content-Type: application/json

{
  "workflow_id": 123
}
```

**解绑**
```http
DELETE /api/custom-events/:id/unbind-workflow
```

**绑定到表单事件**
```http
POST /api/form-apps/:id/event-routes/:route_id/bind-workflow
Content-Type: application/json

{
  "workflow_id": 123,
  "action_type": "both"
}
```

---

## 变量引用

Workflow 支持在节点配置中引用变量，使用 Mustache 语法：

### 引用上游节点输出

```json
{
  "value": "{{upstream_node_id.output_variable}}"
}
```

### 引用触发器数据

```json
{
  "value": "{{trigger.formData.field_name}}"
}
```

### 内置变量

- `{{trigger.timestamp}}` - 触发时间戳
- `{{trigger.userId}}` - 触发用户 ID
- `{{trigger.deviceId}}` - 触发设备 ID
- `{{execution.id}}` - 执行记录 ID
- `{{workflow.id}}` - 工作流 ID

---

## 权限控制

### 角色权限

| 操作 | admin | operator | viewer |
|-----|-------|----------|--------|
| 查看工作流 | ✅ | ✅ | ✅ |
| 创建工作流 | ✅ | ✅ | ❌ |
| 编辑工作流 | ✅ | ✅ (自己的) | ❌ |
| 删除工作流 | ✅ | ✅ (自己的) | ❌ |
| 执行工作流 | ✅ | ✅ | ❌ |
| 绑定事件 | ✅ | ✅ | ❌ |

### 可见性

工作流支持三种可见性级别：

- `private` - 仅创建者可见
- `team` - 团队成员可见（待实现）
- `public` - 所有人可见

---

## 故障排查

### Workflow 未触发

**检查清单**:

1. Workflow 是否启用（`enabled = true`）
2. 事件是否正确绑定（`workflow_enabled = true`）
3. 触发条件是否满足（检查 `trigger_config.conditions`）
4. 查看执行日志（`GET /api/workflows/:id/executions`）

### 节点执行失败

**检查清单**:

1. 查看执行详情（`GET /api/workflows/executions/:exec_id`）
2. 检查 `error_message` 字段
3. 检查节点配置是否正确
4. 检查变量引用是否有效

### 设备能力调用失败

**检查清单**:

1. Agent 是否在线
2. Agent 版本是否支持该能力
3. 设备权限是否授予（相机/蓝牙等）
4. 查看 Agent 日志

---

## 下一步

- [ ] 实现可视化编辑器（前端）
- [ ] 集成 workflow-engine 后端执行引擎
- [ ] 实现 Yjs 协同编辑
- [ ] 添加更多节点类型
- [ ] 性能优化和监控

---

## 参考资源

- [Workflow Engine GitHub](https://github.com/your-org/workflow-engine)
- [App Manager 文档](./README.md)
- [API 文档](./API.md)

---

## 反馈与支持

如有问题或建议，请联系：
- 技术支持：support@example.com
- 提交 Issue：https://github.com/your-org/app-manager/issues
