# 工作流步骤重试机制

## 概述

工作流引擎支持步骤级别的自动重试机制，当步骤执行失败时可以根据配置的策略自动重试，提高系统的容错能力和稳定性。

## 重试配置

### 步骤配置字段

```json
{
  "id": "call_payment_api",
  "type": "http",
  "label": "调用支付接口",
  "on_error": "retry",
  "max_retries": 3,
  "retry_interval": [1000, 2000, 5000],
  "retry_backoff": "exponential",
  "retry_on": ["timeout", "network_error", "server_error"]
}
```

### 字段说明

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `on_error` | string | 错误处理策略：`rollback`（回滚）、`continue`（继续）、`retry`（重试） | - |
| `max_retries` | int | 最大重试次数，0表示不重试 | 0 |
| `retry_interval` | []int | 重试间隔（毫秒），用于 `custom` 退避策略 | - |
| `retry_backoff` | string | 退避策略：`fixed`、`linear`、`exponential`、`custom` | `exponential` |
| `retry_on` | []string | 重试条件：`all`、`timeout`、`network_error`、`server_error` | `all` |

## 退避策略

### 1. Fixed（固定间隔）

每次重试使用相同的间隔时间。

```json
{
  "retry_backoff": "fixed",
  "retry_interval": [2000],
  "max_retries": 3
}
```

**重试时序**：
- 第1次重试：等待 2000ms
- 第2次重试：等待 2000ms
- 第3次重试：等待 2000ms

### 2. Linear（线性增长）

重试间隔线性增长：`base * (attempt + 1)`

```json
{
  "retry_backoff": "linear",
  "retry_interval": [1000],
  "max_retries": 3
}
```

**重试时序**：
- 第1次重试：等待 1000ms (1000 * 1)
- 第2次重试：等待 2000ms (1000 * 2)
- 第3次重试：等待 3000ms (1000 * 3)

### 3. Exponential（指数退避）⭐ 推荐

重试间隔指数增长：`base * 2^attempt`

```json
{
  "retry_backoff": "exponential",
  "retry_interval": [1000],
  "max_retries": 4
}
```

**重试时序**：
- 第1次重试：等待 1000ms (1000 * 2^0)
- 第2次重试：等待 2000ms (1000 * 2^1)
- 第3次重试：等待 4000ms (1000 * 2^2)
- 第4次重试：等待 8000ms (1000 * 2^3)

### 4. Custom（自定义序列）

按照配置的间隔序列依次重试，超出序列后使用最后一个值。

```json
{
  "retry_backoff": "custom",
  "retry_interval": [500, 1000, 2000, 5000, 10000],
  "max_retries": 5
}
```

**重试时序**：
- 第1次重试：等待 500ms
- 第2次重试：等待 1000ms
- 第3次重试：等待 2000ms
- 第4次重试：等待 5000ms
- 第5次重试：等待 10000ms

## 重试条件

### retry_on 配置

指定哪些类型的错误触发重试：

| 条件 | 说明 | 匹配的错误关键词 |
|------|------|-----------------|
| `all` | 所有错误都重试 | - |
| `timeout` | 超时错误 | timeout, timed out, deadline exceeded |
| `network_error` | 网络错误 | connection refused, connection reset, network unreachable, EOF |
| `server_error` | 服务器错误 | 500, 502, 503, 504, internal server error, bad gateway |

### 示例

```json
{
  "retry_on": ["timeout", "network_error"]
}
```

此配置仅在超时或网络错误时重试，遇到 `server_error` 不会重试。

## 使用场景

### 场景1：HTTP API 调用重试

外部 API 调用容易遇到网络抖动和临时故障，配置重试提高成功率。

```json
{
  "steps": [
    {
      "id": "call_third_party_api",
      "type": "http",
      "label": "调用第三方API",
      "http_config": {
        "method": "POST",
        "url": "https://api.example.com/webhook",
        "body": "{{variables.payload}}"
      },
      "on_error": "retry",
      "max_retries": 3,
      "retry_backoff": "exponential",
      "retry_interval": [1000],
      "retry_on": ["timeout", "network_error", "server_error"]
    }
  ]
}
```

### 场景2：数据库死锁重试

数据库操作遇到死锁或锁等待超时时自动重试。

```json
{
  "steps": [
    {
      "id": "update_inventory",
      "type": "sql",
      "label": "更新库存",
      "datasource": "mysql_main",
      "sql": "UPDATE inventory SET stock = stock - :request.quantity WHERE product_id = :request.product_id",
      "transaction_group": "order_tx",
      "on_error": "retry",
      "max_retries": 5,
      "retry_backoff": "linear",
      "retry_interval": [100],
      "retry_on": ["all"]
    }
  ]
}
```

### 场景3：接口调用重试

调用其他数据接口时遇到临时故障重试。

```json
{
  "steps": [
    {
      "id": "call_data_interface",
      "type": "interface",
      "label": "查询用户余额",
      "interface_code": "get_user_balance",
      "params": {
        "user_id": "{{request.user_id}}"
      },
      "on_error": "retry",
      "max_retries": 2,
      "retry_backoff": "fixed",
      "retry_interval": [1000]
    }
  ]
}
```

## 最佳实践

### 1. 合理设置重试次数

- **幂等操作**：可以设置较多重试次数（3-5次）
- **非幂等操作**：谨慎设置重试次数，需确保操作幂等性
- **写操作**：建议 ≤ 3次
- **读操作**：可以设置 3-5次

### 2. 选择合适的退避策略

- **网络请求**：推荐 `exponential`（指数退避），避免雪崩
- **数据库死锁**：推荐 `linear`（线性增长）或 `fixed`（固定间隔）
- **速率限制场景**：使用 `custom` 自定义间隔

### 3. 精确配置重试条件

```json
{
  "retry_on": ["timeout", "network_error"]
}
```

避免使用 `"retry_on": ["all"]` 导致不必要的重试（如参数错误、权限错误等）。

### 4. 设置最大重试间隔

重试机制自动限制最大间隔为 60 秒，避免过长的等待时间：

```go
if delayMs > r.policy.MaxInterval {
    delayMs = r.policy.MaxInterval  // 默认 60000ms
}
```

### 5. 监控重试指标

在执行日志中记录了重试次数：

```json
{
  "step_id": "call_payment_api",
  "retry_count": 2,
  "elapsed_ms": 5234,
  "success": true
}
```

可以通过查询 API 监控重试情况：

```bash
GET /api/data-stack/workflow-executions/:request_id
```

## 重试机制实现

### 核心代码

**RetryExecutor**（`server/workflow/retry_executor.go`）

```go
// Execute 执行带重试的操作
func (r *RetryExecutor) Execute(operation func() error) error {
    var lastError error

    for attempt := 0; attempt <= r.policy.MaxRetries; attempt++ {
        err := operation()
        if err == nil {
            return nil
        }

        lastError = err

        if !r.shouldRetry(err, attempt) {
            return fmt.Errorf("operation failed after %d attempts: %w", attempt+1, err)
        }

        if attempt == r.policy.MaxRetries {
            break
        }

        delay := r.calculateBackoff(attempt)
        time.Sleep(delay)
    }

    return fmt.Errorf("operation failed after %d attempts: %w", r.policy.MaxRetries+1, lastError)
}
```

**集成到引擎**（`server/workflow/dataif_engine.go`）

```go
func (e *DataIfEngine) executeStepWithRetry(step *Step, ctx *Context, workflow *Workflow, txMgr *TransactionManager) (*StepResult, error) {
    executeFunc := func() (*StepResult, error) {
        return e.executeStep(step, ctx, workflow, txMgr)
    }

    return ExecuteWithRetry(step, executeFunc)
}
```

## 完整示例

### 电商订单处理工作流

```json
{
  "version": "1.0",
  "description": "订单处理工作流（带重试）",
  "steps": [
    {
      "id": "check_inventory",
      "type": "sql",
      "label": "检查库存",
      "datasource": "mysql_main",
      "sql": "SELECT stock FROM inventory WHERE product_id = :request.product_id FOR UPDATE",
      "transaction_group": "order_tx",
      "on_error": "retry",
      "max_retries": 3,
      "retry_backoff": "linear",
      "retry_interval": [100]
    },
    {
      "id": "deduct_inventory",
      "type": "sql",
      "label": "扣减库存",
      "datasource": "mysql_main",
      "sql": "UPDATE inventory SET stock = stock - :request.quantity WHERE product_id = :request.product_id",
      "transaction_group": "order_tx"
    },
    {
      "id": "call_payment_gateway",
      "type": "http",
      "label": "调用支付网关",
      "http_config": {
        "method": "POST",
        "url": "https://payment.example.com/charge",
        "headers": {
          "Authorization": "Bearer {{env.payment_api_key}}"
        },
        "body": {
          "order_id": "{{variables.order_id}}",
          "amount": "{{request.amount}}"
        },
        "timeout": 30000
      },
      "on_error": "retry",
      "max_retries": 3,
      "retry_backoff": "exponential",
      "retry_interval": [1000],
      "retry_on": ["timeout", "network_error"]
    },
    {
      "id": "create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "mysql_main",
      "sql": "INSERT INTO orders (product_id, quantity, amount, status) VALUES (:request.product_id, :request.quantity, :request.amount, 'paid')",
      "transaction_group": "order_tx",
      "output": {
        "order_id": "{{last_insert_id}}"
      }
    },
    {
      "id": "send_notification",
      "type": "http",
      "label": "发送通知",
      "http_config": {
        "method": "POST",
        "url": "https://notify.example.com/send",
        "body": {
          "user_id": "{{request.user_id}}",
          "message": "订单 {{variables.order_id}} 已支付成功"
        }
      },
      "on_error": "retry",
      "max_retries": 2,
      "retry_backoff": "fixed",
      "retry_interval": [2000],
      "retry_on": ["all"]
    }
  ],
  "transactions": {
    "order_tx": {
      "datasource": "mysql_main",
      "isolation": "read_committed",
      "steps": ["check_inventory", "deduct_inventory", "create_order"]
    }
  }
}
```

## 限制与注意事项

### 1. 重试与事务

- 在事务内的步骤重试时，事务保持打开状态
- 重试失败会导致事务回滚
- 建议事务内步骤的重试次数不要过多（≤3次）

### 2. 幂等性要求

启用重试的步骤必须保证幂等性，避免重复执行导致数据不一致：

✅ **幂等操作**：
- 查询操作
- 基于唯一键的 INSERT IGNORE / ON DUPLICATE KEY UPDATE
- 设置固定值（UPDATE SET status = 'paid'）

❌ **非幂等操作**：
- 递增/递减（UPDATE SET balance = balance + 100）
- 重复插入
- 发送不可撤销的通知

### 3. 性能影响

- 重试会增加步骤执行时间
- 指数退避可能导致长时间等待（如 1s → 2s → 4s → 8s）
- 建议设置合理的 `max_interval` 上限（默认60秒）

### 4. 错误识别

重试条件基于错误消息的关键词匹配（不区分大小写），可能存在误判：

```go
// 超时关键词
"timeout", "timed out", "deadline exceeded"

// 网络错误关键词
"connection refused", "connection reset", "network unreachable"

// 服务器错误关键词
"500", "502", "503", "504", "internal server error"
```

## 相关文档

- [工作流引擎使用手册](./workflow-engine-usage.md)
- [工作流引擎示例](./workflow-examples.md)
- [工作流执行查询 API](./workflow-engine-phase3-summary.md)

---

**实施日期**：2026-07-01  
**状态**：✅ 已实现  
**代码文件**：
- `server/workflow/retry_executor.go` (300行)
- `server/workflow/step.go` (新增重试字段)
- `server/workflow/dataif_engine.go` (集成重试机制)
