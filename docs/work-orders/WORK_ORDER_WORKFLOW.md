# 工单工作流使用指南

## 概述

工单工作流是一个强大的自动化引擎，可以监听工单事件（创建、更新、状态变更、关闭等），自动执行预定义的动作，实现工单处理的自动化。

## 功能特性

### 支持的事件类型
- `work_order.created` - 工单创建时
- `work_order.updated` - 工单更新时（标题、描述、优先级等字段修改）
- `work_order.status_changed` - 工单状态变更时
- `work_order.closed` - 工单关闭时

### 支持的动作类型

#### 1. 调用第三方接口 (call_endpoint)
调用在「外部应用」中配置的第三方接口。

**配置示例**：
```json
{
  "endpoint_id": 1,
  "params": {
    "title": "{{title}}",
    "code": "{{code}}",
    "status": "{{status}}"
  }
}
```

#### 2. 调用连接器 (call_connector)
调用在「连接器」中配置的数据连接器接口。

**配置示例**：
```json
{
  "connector_code": "erp_sync",
  "params": {
    "work_order_code": "{{code}}",
    "device_id": "{{device_id}}"
  }
}
```

#### 3. 调用数据接口 (call_data_interface)
调用「数据源与接口」中配置的数据接口。

**配置示例**：
```json
{
  "interface_id": 5,
  "params": {
    "code": "{{other_codes}}",
    "status": "{{status}}"
  }
}
```

#### 4. 执行 JavaScript (execute_js)
执行自定义 JavaScript 代码，实现复杂的业务逻辑。

**配置示例**：
```json
{
  "code": "log('工单: ' + workOrder.code); if (workOrder.priority === 'urgent') { setVariable('urgent_flag', true); }"
}
```

**可用的上下文变量**：
- `workOrder` - 当前工单对象（包含所有字段）
- `event` - 触发的事件名称
- `actor` - 操作人标识
- `variables` - 共享变量对象（可跨动作传递数据）

**可用的函数**：
- `log(msg)` - 输出日志
- `setVariable(key, value)` - 设置变量供后续动作使用
- `getVariable(key)` - 获取之前设置的变量

#### 5. 更新工单 (update_work_order)
更新当前工单或指定 ID 的工单。

**配置示例**：
```json
{
  "updates": {
    "status": "in_progress",
    "priority": "high"
  }
}
```

**更新指定工单**：
```json
{
  "work_order_id": 123,
  "updates": {
    "status": "closed"
  }
}
```

#### 6. 创建工单 (create_work_order)
自动创建新工单。

**配置示例**：
```json
{
  "fields": {
    "title": "自动创建：{{title}}",
    "description": "源工单：{{code}}",
    "type_code": "follow_up",
    "device_id": "{{device_id}}",
    "priority": "normal",
    "other_codes": "{{other_codes}}"
  }
}
```

#### 7. 查询工单 (query_work_orders)
查询符合条件的工单，结果存入 `variables.queried_work_orders` 供后续动作使用。

**配置示例**：
```json
{
  "conditions": {
    "device_id": "{{device_id}}",
    "status": "open"
  },
  "limit": 10
}
```

### 占位符支持

在动作配置的字符串值中，可以使用占位符引用工单字段：

- `{{code}}` - 工单编号
- `{{title}}` - 工单标题
- `{{description}}` - 工单描述
- `{{status}}` - 工单状态
- `{{priority}}` - 优先级
- `{{type_code}}` - 工单类型编码
- `{{other_codes}}` - 其他编码
- `{{device_id}}` - 设备 ID
- `{{event}}` - 触发事件
- `{{actor}}` - 操作人

## 使用场景示例

### 场景 1：工单创建时自动调用 ERP 接口
监听 `work_order.created` 事件，调用 ERP 系统接口同步工单信息。

**配置**：
- 事件：`work_order.created`
- 动作：调用第三方接口
- 配置：
```json
{
  "endpoint_id": 2,
  "params": {
    "work_order_code": "{{code}}",
    "title": "{{title}}",
    "device_id": "{{device_id}}",
    "other_codes": "{{other_codes}}"
  }
}
```

### 场景 2：根据其他编码自动更新工单
收到工单后，根据「其他编码」查询外部系统，自动更新工单状态。

**配置**：
- 事件：`work_order.created`
- 动作序列：
  1. 调用数据接口（查询外部数据）
  2. 执行 JS（判断查询结果）
  3. 更新工单（根据判断结果更新）

**动作 1 配置**：
```json
{
  "interface_id": 3,
  "params": {
    "code": "{{other_codes}}"
  }
}
```

**动作 2 配置**：
```json
{
  "code": "var result = variables.last_interface_result; if (result && result.status === 'processed') { setVariable('should_close', true); }"
}
```

**动作 3 配置**：
```json
{
  "updates": {
    "status": "resolved",
    "description": "外部系统已处理"
  }
}
```

### 场景 3：紧急工单自动创建跟进工单
高优先级工单创建时，自动创建一个跟进工单。

**配置**：
- 事件：`work_order.created`
- 动作序列：
  1. 执行 JS（判断优先级）
  2. 创建工单（条件满足时）

**动作 1 配置**：
```json
{
  "code": "if (workOrder.priority === 'urgent' || workOrder.priority === 'high') { setVariable('should_follow_up', true); }"
}
```

**动作 2 配置**：
```json
{
  "fields": {
    "title": "跟进：{{title}}",
    "description": "源工单：{{code}}",
    "type_code": "follow_up",
    "device_id": "{{device_id}}",
    "priority": "normal"
  }
}
```

### 场景 4：工单关闭时自动查询并关闭相关工单
工单关闭时，查询同一设备的其他开启工单，一并关闭。

**配置**：
- 事件：`work_order.closed`
- 动作序列：
  1. 查询工单（同设备未关闭工单）
  2. 执行 JS（遍历并更新）

**动作 1 配置**：
```json
{
  "conditions": {
    "device_id": "{{device_id}}",
    "status": "open"
  },
  "limit": 50
}
```

**动作 2 配置**：
```json
{
  "code": "var orders = variables.queried_work_orders || []; log('找到 ' + orders.length + ' 个待关闭工单'); for (var i = 0; i < orders.length; i++) { log('关闭工单: ' + orders[i].code); }"
}
```

## 安全与限制

### 查询锁
- 更新工单时使用 `FOR UPDATE` 锁，避免并发冲突
- 工作流异步执行，不阻塞主流程

### 错误处理
- 动作执行失败时，工作流会记录错误信息到日志
- 部分动作失败不影响已执行的动作
- 可在「工作流日志」中查看执行详情和错误信息

### JavaScript 沙箱限制
- 不支持 `require()` / `import`
- 不支持文件系统访问
- 不支持网络请求（使用 call_endpoint 动作代替）
- 执行超时保护

## 最佳实践

1. **测试先行**：使用「测试」功能验证工作流逻辑
2. **渐进式开发**：先配置单个动作，测试通过后再添加更多
3. **日志记录**：在 JS 中使用 `log()` 记录关键步骤
4. **错误兜底**：为关键动作添加条件判断
5. **性能考虑**：避免在工作流中执行大量查询或循环

## 管理入口

- 工作流配置：工单管理 → 工单设置 → 工作流
- 执行日志：工作流列表 → 查看执行日志
