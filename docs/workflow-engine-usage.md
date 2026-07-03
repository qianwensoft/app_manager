# 工作流引擎 - 使用示例

## 概览

工作流引擎支持通过数据接口（DataInterface）配置多步骤、跨数据源的数据操作流程。

## 核心特性

- ✅ 多数据源支持：单个工作流可操作多个数据源
- ✅ 事务管理：支持事务组，多步骤共享事务
- ✅ 条件分支：基于 JavaScript 表达式的条件步骤
- ✅ 补偿机制：失败时自动执行补偿步骤（Saga 模式）
- ✅ 动态路由：根据参数/规则/脚本动态选择数据源
- ✅ 命名参数：SQL 中使用 `:request.user_id`、`:variables.amount` 等占位符
- ✅ 执行日志：完整的步骤执行记录和审计追踪

## 数据接口配置

### 1. 创建数据接口

```json
{
  "code": "create_order_with_inventory",
  "name": "创建订单并扣减库存",
  "kind": "workflow",
  "enabled": true,
  "dataset_id": null,
  "workflow_json": "...",
  "datasources_json": "..."
}
```

### 2. 数据源配置 (`datasources_json`)

```json
{
  "datasources": [
    {
      "alias": "order_db",
      "data_source_id": 1,
      "description": "订单数据库"
    },
    {
      "alias": "inventory_db",
      "data_source_id": 2,
      "description": "库存数据库"
    }
  ]
}
```

### 3. 工作流定义 (`workflow_json`)

```json
{
  "version": "1.0",
  "description": "创建订单并扣减库存",
  "steps": [
    {
      "id": "check_inventory",
      "type": "sql",
      "label": "检查库存",
      "datasource": "inventory_db",
      "sql": "SELECT quantity FROM inventory WHERE product_id = :request.product_id FOR UPDATE",
      "output": {
        "available_quantity": "{{row.quantity}}"
      }
    },
    {
      "id": "validate_stock",
      "type": "condition",
      "label": "验证库存充足",
      "expression": "variables.available_quantity >= request.quantity",
      "then": ["deduct_inventory", "create_order"],
      "else": ["fail_insufficient_stock"]
    },
    {
      "id": "deduct_inventory",
      "type": "sql",
      "label": "扣减库存",
      "datasource": "inventory_db",
      "transaction_group": "tx_inventory",
      "sql": "UPDATE inventory SET quantity = quantity - :request.quantity WHERE product_id = :request.product_id",
      "expect_affected_rows": 1
    },
    {
      "id": "create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "order_db",
      "transaction_group": "tx_order",
      "sql": "INSERT INTO orders (user_id, product_id, quantity, status) VALUES (:request.user_id, :request.product_id, :request.quantity, 'pending')",
      "output": {
        "order_id": "{{last_insert_id}}"
      }
    }
  ],
  "transactions": {
    "tx_inventory": {
      "datasource": "inventory_db",
      "isolation": "repeatable_read",
      "steps": ["deduct_inventory"]
    },
    "tx_order": {
      "datasource": "order_db",
      "isolation": "read_committed",
      "steps": ["create_order"]
    }
  },
  "error_handling": {
    "strategy": "compensate",
    "compensation_steps": [
      {
        "for_step": "deduct_inventory",
        "type": "sql",
        "datasource": "inventory_db",
        "sql": "UPDATE inventory SET quantity = quantity + :request.quantity WHERE product_id = :request.product_id"
      }
    ]
  }
}
```

## 步骤类型

### SQL 步骤

```json
{
  "id": "insert_user",
  "type": "sql",
  "label": "插入用户",
  "datasource": "main_db",
  "sql": "INSERT INTO users (name, email) VALUES (:request.name, :request.email)",
  "transaction_group": "tx_main",
  "expect_affected_rows": 1,
  "output": {
    "user_id": "{{last_insert_id}}",
    "affected": "{{affected_rows}}"
  }
}
```

### 条件步骤

```json
{
  "id": "check_premium",
  "type": "condition",
  "label": "检查是否高级用户",
  "expression": "request.user_level === 'premium' && request.amount > 1000",
  "then": ["apply_discount"],
  "else": ["normal_process"]
}
```

### HTTP 步骤

```json
{
  "id": "notify_external",
  "type": "http",
  "label": "通知外部系统",
  "http_config": {
    "method": "POST",
    "url": "https://api.example.com/webhooks/order",
    "headers": {
      "Authorization": "Bearer {{env.api_token}}",
      "Content-Type": "application/json"
    },
    "body": {
      "order_id": "{{variables.order_id}}",
      "user_id": "{{request.user_id}}",
      "amount": "{{request.amount}}"
    }
  },
  "output": {
    "notification_id": "json.id",
    "notification_status": "json.status"
  }
}
```

### 脚本步骤

```json
{
  "id": "calculate_discount",
  "type": "script",
  "label": "计算折扣",
  "engine": "javascript",
  "code": "var discount = 0; if (request.amount > 1000) { discount = request.amount * 0.1; } else if (request.amount > 500) { discount = request.amount * 0.05; } setVariable('discount_amount', discount); return { discount: discount, final_amount: request.amount - discount };",
  "output": {
    "discount": "discount",
    "final_amount": "final_amount"
  }
}
```

### 接口调用步骤

```json
{
  "id": "check_user_balance",
  "type": "interface",
  "label": "检查用户余额",
  "interface_code": "get_user_balance",
  "params": {
    "user_id": "{{request.user_id}}"
  },
  "output": {
    "current_balance": "data.balance"
  }
}
```

### 延迟步骤

```json
{
  "id": "wait_for_processing",
  "type": "delay",
  "label": "等待处理",
  "delay_config": {
    "seconds": 5
  }
}
```

支持的时间单位：
- `milliseconds` - 毫秒
- `seconds` - 秒
- `minutes` - 分钟

最大延迟时间：10分钟

### 循环步骤

#### 计数循环（for i = 0; i < count; i++）

```json
{
  "id": "batch_create_users",
  "type": "loop",
  "label": "批量创建用户",
  "loop_config": {
    "type": "count",
    "count": 10,
    "iterator": "i",
    "body": ["create_user_step"]
  }
}
```

#### Foreach 循环（for item in array）

```json
{
  "id": "process_orders",
  "type": "loop",
  "label": "处理订单列表",
  "loop_config": {
    "type": "foreach",
    "items": "variables.order_ids",
    "item": "order_id",
    "index": "idx",
    "body": ["process_single_order"]
  }
}
```

#### While 循环（while condition）

```json
{
  "id": "retry_until_success",
  "type": "loop",
  "label": "重试直到成功",
  "loop_config": {
    "type": "while",
    "condition": "variables.retry_count < 5 && !variables.success",
    "max_iterations": 10,
    "body": ["attempt_operation", "check_result"]
  }
}
```

循环限制：
- 最大迭代次数：1000
- While 循环默认最大迭代：100

## 动态数据源路由

### 基于规则的路由

```json
{
  "id": "save_data",
  "type": "sql",
  "label": "保存数据",
  "datasource_routing": {
    "type": "rules",
    "rules": [
      {
        "condition": "request.region === 'cn'",
        "datasource": "db_cn"
      },
      {
        "condition": "request.region === 'us'",
        "datasource": "db_us"
      }
    ],
    "default": "db_global"
  },
  "sql": "INSERT INTO logs (message) VALUES (:request.message)"
}
```

### 基于脚本的路由

```json
{
  "id": "query_user",
  "type": "sql",
  "label": "查询用户",
  "datasource_routing": {
    "type": "script",
    "engine": "javascript",
    "code": "if (request.user_id % 2 === 0) { return 'db_shard_0'; } else { return 'db_shard_1'; }",
    "default": "db_primary"
  },
  "sql": "SELECT * FROM users WHERE id = :request.user_id"
}
```

## 命名参数语法

支持的参数路径：

- `request.*` - 请求参数，如 `:request.user_id`
- `variables.*` 或 `vars.*` - 工作流变量，如 `:variables.order_id`
- `env.*` - 环境变量，如 `:env.app_version`
- `<step_id>.*` - 步骤输出，如 `:check_inventory.quantity`

示例：

```sql
-- 使用请求参数
INSERT INTO orders (user_id, product_id, amount) 
VALUES (:request.user_id, :request.product_id, :request.amount)

-- 使用步骤输出
UPDATE users SET balance = balance - :create_order.total_price 
WHERE id = :request.user_id

-- 使用工作流变量
INSERT INTO audit_log (order_id, action) 
VALUES (:variables.order_id, 'created')
```

## 输出模板

步骤可以通过 `output` 字段定义输出变量：

```json
{
  "output": {
    "order_id": "{{last_insert_id}}",
    "rows_affected": "{{affected_rows}}"
  }
}
```

或简写形式（将 last_insert_id 赋值给指定变量）：

```json
{
  "output": "order_id"
}
```

## 调用工作流接口

### HTTP API

```bash
POST /api/data/interfaces/execute/:code
Content-Type: application/json

{
  "param_values": {
    "user_id": 123,
    "product_id": 456,
    "quantity": 2
  }
}
```

### 响应格式

```json
{
  "ok": true,
  "kind": "workflow",
  "elapsed_ms": 45,
  "data": {
    "order_id": 789,
    "available_quantity": 100
  }
}
```

## 执行日志查询

工作流执行日志保存在 `workflow_execution_logs` 表中：

```sql
SELECT 
  request_id,
  interface_code,
  status,
  total_steps,
  completed_steps,
  elapsed_ms,
  compensated,
  error_message,
  step_logs_json
FROM workflow_execution_logs
WHERE interface_code = 'create_order_with_inventory'
ORDER BY created_at DESC
LIMIT 10;
```

## 事务隔离级别

支持的隔离级别：

- `read_uncommitted` - 读未提交
- `read_committed` - 读已提交（PostgreSQL 默认）
- `repeatable_read` - 可重复读（MySQL 默认）
- `serializable` - 可串行化

## 补偿策略

支持的错误处理策略：

- `compensate` - 执行补偿步骤（Saga 模式）
- `rollback` - 回滚所有事务（仅适用于单数据源）
- `ignore` - 忽略错误继续执行

## 最佳实践

1. **事务边界**：同一数据源的相关步骤放在同一事务组中
2. **补偿设计**：为关键步骤设计幂等的补偿逻辑
3. **超时设置**：避免长时间持有数据库锁
4. **参数验证**：在工作流开始前验证必需参数
5. **审计日志**：利用执行日志进行问题排查和审计

## 限制与注意事项

- 跨数据源操作无法使用分布式事务（需使用补偿模式）
- 条件步骤中的 JavaScript 表达式应保持简单，避免复杂计算
- 步骤 ID 必须在工作流内唯一
- 补偿步骤按逆序执行
