# 工作流异步执行机制

## 概述

工作流引擎支持步骤级别的异步执行，允许某些步骤在后台执行而不阻塞工作流的后续步骤。这对于耗时的操作（如长时间的数据处理、外部API调用、文件生成等）非常有用。

## 异步执行特性

### 1. 步骤级异步配置

通过在步骤定义中设置 `async: true` 来启用异步执行：

```json
{
  "id": "send_notification",
  "type": "http",
  "label": "发送通知",
  "async": true,
  "http_config": {
    "method": "POST",
    "url": "https://notify.example.com/send",
    "body": {"message": "订单已创建"}
  }
}
```

### 2. 执行模型

- **同步步骤**：顺序执行，等待完成后才执行下一步
- **异步步骤**：立即返回，在后台goroutine中执行，不阻塞后续步骤

### 3. 并发控制

异步执行器使用信号量控制最大并发数，防止资源耗尽：

```go
executor := NewAsyncExecutor(20)  // 最多20个并发任务
```

## 异步步骤配置

### 基本配置

```json
{
  "steps": [
    {
      "id": "create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "mysql_main",
      "sql": "INSERT INTO orders (user_id, amount) VALUES (:request.user_id, :request.amount)",
      "output": {
        "order_id": "{{last_insert_id}}"
      }
    },
    {
      "id": "send_email",
      "type": "http",
      "label": "发送邮件通知",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://mail.example.com/send",
        "body": {
          "to": "{{request.email}}",
          "subject": "订单创建成功",
          "body": "您的订单 {{variables.order_id}} 已创建"
        }
      }
    },
    {
      "id": "return_response",
      "type": "script",
      "label": "返回响应",
      "engine": "javascript",
      "code": "setVariable('response', {success: true, order_id: getVariable('order_id')})"
    }
  ]
}
```

在这个例子中：
1. 创建订单（同步，等待完成）
2. 发送邮件（异步，立即返回）
3. 返回响应（同步，不等待邮件发送完成）

### 异步步骤输出

异步步骤会立即返回一个占位结果：

```json
{
  "step_id": "send_email",
  "type": "http",
  "success": true,
  "output": {
    "async": true,
    "task_status": "pending",
    "request_id": "wf_20260702_abc123"
  }
}
```

## 任务状态追踪

### 查询异步任务状态

```bash
GET /api/data-stack/async-tasks/:request_id/:step_id
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "request_id": "wf_20260702_abc123",
    "step_id": "send_email",
    "status": "completed",
    "start_time": "2026-07-02T10:30:00Z",
    "end_time": "2026-07-02T10:30:02Z",
    "elapsed_ms": 2150,
    "progress": 100,
    "result": {
      "step_id": "send_email",
      "success": true,
      "output": {
        "status_code": 200,
        "response_body": {"message": "Email sent"}
      }
    }
  }
}
```

### 任务状态值

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `running` | 正在执行 |
| `completed` | 执行成功 |
| `failed` | 执行失败 |

### 列出运行中的任务

```bash
GET /api/data-stack/async-tasks
```

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "request_id": "wf_20260702_abc123",
      "step_id": "generate_report",
      "status": "running",
      "start_time": "2026-07-02T10:30:00Z",
      "elapsed_ms": 15000,
      "progress": 45
    }
  ]
}
```

### 获取执行器统计

```bash
GET /api/data-stack/async-tasks/stats
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "max_concurrent": 20,
    "running_tasks": 3,
    "completed_tasks": 127,
    "available_workers": 17
  }
}
```

## 使用场景

### 场景1：通知类操作（不关心结果）

邮件、短信、Webhook通知等操作，不影响主业务流程：

```json
{
  "steps": [
    {
      "id": "process_payment",
      "type": "http",
      "label": "处理支付",
      "http_config": {
        "method": "POST",
        "url": "https://payment.example.com/charge"
      }
    },
    {
      "id": "send_sms",
      "type": "http",
      "label": "发送短信通知",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://sms.example.com/send"
      }
    },
    {
      "id": "send_webhook",
      "type": "http",
      "label": "发送Webhook",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://webhook.example.com/notify"
      }
    }
  ]
}
```

### 场景2：日志记录和审计

将日志写入第三方系统，不阻塞主流程：

```json
{
  "steps": [
    {
      "id": "update_inventory",
      "type": "sql",
      "label": "更新库存",
      "datasource": "mysql_main",
      "sql": "UPDATE inventory SET stock = stock - 1"
    },
    {
      "id": "log_to_elk",
      "type": "http",
      "label": "记录到ELK",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://elk.example.com/logs"
      }
    }
  ]
}
```

### 场景3：报表生成

生成大型报表，不阻塞API响应：

```json
{
  "steps": [
    {
      "id": "create_report_task",
      "type": "sql",
      "label": "创建报表任务",
      "datasource": "mysql_main",
      "sql": "INSERT INTO report_tasks (user_id, type, status) VALUES (:request.user_id, 'monthly', 'pending')",
      "output": {
        "task_id": "{{last_insert_id}}"
      }
    },
    {
      "id": "generate_report",
      "type": "script",
      "label": "生成报表",
      "async": true,
      "engine": "javascript",
      "code": "/* 复杂的报表生成逻辑 */"
    }
  ]
}
```

### 场景4：数据同步

同步数据到其他系统，不影响主流程：

```json
{
  "steps": [
    {
      "id": "save_order",
      "type": "sql",
      "label": "保存订单",
      "datasource": "mysql_main",
      "sql": "INSERT INTO orders ..."
    },
    {
      "id": "sync_to_warehouse",
      "type": "http",
      "label": "同步到仓库系统",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://warehouse.example.com/sync"
      }
    },
    {
      "id": "sync_to_crm",
      "type": "http",
      "label": "同步到CRM",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://crm.example.com/sync"
      }
    }
  ]
}
```

## 最佳实践

### 1. 选择合适的异步步骤

✅ **适合异步**：
- 通知类操作（邮件、短信、Webhook）
- 日志记录和审计
- 数据同步（非关键路径）
- 报表生成
- 缓存预热

❌ **不适合异步**：
- 事务内的数据库操作
- 需要返回值的步骤
- 有依赖关系的步骤
- 关键业务逻辑

### 2. 异步步骤与事务

**重要**：异步步骤不能在事务组内！

❌ **错误示例**：

```json
{
  "steps": [
    {
      "id": "update_stock",
      "type": "sql",
      "transaction_group": "order_tx",
      "async": true  // ❌ 错误：异步步骤不能在事务内
    }
  ]
}
```

✅ **正确示例**：

```json
{
  "steps": [
    {
      "id": "update_stock",
      "type": "sql",
      "transaction_group": "order_tx"  // ✅ 事务内步骤必须同步
    },
    {
      "id": "send_notification",
      "type": "http",
      "async": true  // ✅ 事务外可以异步
    }
  ]
}
```

### 3. 异步步骤的重试

异步步骤可以配合重试机制：

```json
{
  "id": "send_webhook",
  "type": "http",
  "async": true,
  "on_error": "retry",
  "max_retries": 3,
  "retry_backoff": "exponential",
  "http_config": {
    "method": "POST",
    "url": "https://webhook.example.com/notify"
  }
}
```

### 4. 监控异步任务

定期检查异步任务状态：

```bash
# 查看运行中的任务
curl -X GET "http://localhost:8080/api/data-stack/async-tasks"

# 查看执行器统计
curl -X GET "http://localhost:8080/api/data-stack/async-tasks/stats"

# 清理已完成的任务（保留1小时内的）
curl -X POST "http://localhost:8080/api/data-stack/async-tasks/cleanup" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"older_than_minutes": 60}'
```

### 5. 设置合理的并发数

根据服务器资源调整最大并发数：

```go
// server/workflow/async_executor.go
globalAsyncExecutor = NewAsyncExecutor(20)  // 默认20个并发
```

**建议值**：
- 小型系统：10-20
- 中型系统：20-50
- 大型系统：50-100

## API 端点

### 异步任务管理 API

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/data-stack/async-tasks` | GET | viewer+ | 列出运行中的任务 |
| `/api/data-stack/async-tasks/stats` | GET | viewer+ | 获取执行器统计 |
| `/api/data-stack/async-tasks/:request_id/:step_id` | GET | viewer+ | 获取单个任务状态 |
| `/api/data-stack/async-tasks/cleanup` | POST | admin | 清理已完成任务 |

### 权限说明

- **viewer**：只读权限，可查看任务状态
- **operator**：操作权限，可查看任务状态
- **admin**：管理权限，可查看和清理任务

## 完整示例

### 电商订单流程（异步通知）

```json
{
  "version": "1.0",
  "description": "订单处理流程（带异步通知）",
  "steps": [
    {
      "id": "validate_stock",
      "type": "sql",
      "label": "验证库存",
      "datasource": "mysql_main",
      "sql": "SELECT stock FROM inventory WHERE product_id = :request.product_id FOR UPDATE",
      "transaction_group": "order_tx"
    },
    {
      "id": "deduct_stock",
      "type": "sql",
      "label": "扣减库存",
      "datasource": "mysql_main",
      "sql": "UPDATE inventory SET stock = stock - :request.quantity WHERE product_id = :request.product_id",
      "transaction_group": "order_tx"
    },
    {
      "id": "create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "mysql_main",
      "sql": "INSERT INTO orders (user_id, product_id, quantity, amount, status) VALUES (:request.user_id, :request.product_id, :request.quantity, :request.amount, 'pending')",
      "transaction_group": "order_tx",
      "output": {
        "order_id": "{{last_insert_id}}"
      }
    },
    {
      "id": "call_payment",
      "type": "http",
      "label": "调用支付接口",
      "http_config": {
        "method": "POST",
        "url": "https://payment.example.com/charge",
        "body": {
          "order_id": "{{variables.order_id}}",
          "amount": "{{request.amount}}"
        }
      },
      "on_error": "retry",
      "max_retries": 3,
      "retry_backoff": "exponential"
    },
    {
      "id": "update_order_status",
      "type": "sql",
      "label": "更新订单状态",
      "datasource": "mysql_main",
      "sql": "UPDATE orders SET status = 'paid' WHERE id = :variables.order_id",
      "transaction_group": "order_tx"
    },
    {
      "id": "send_email",
      "type": "http",
      "label": "发送邮件通知",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://mail.example.com/send",
        "body": {
          "to": "{{request.email}}",
          "subject": "订单支付成功",
          "body": "订单 {{variables.order_id}} 支付成功"
        }
      },
      "on_error": "retry",
      "max_retries": 2
    },
    {
      "id": "send_sms",
      "type": "http",
      "label": "发送短信通知",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://sms.example.com/send",
        "body": {
          "phone": "{{request.phone}}",
          "message": "订单已支付"
        }
      }
    },
    {
      "id": "sync_to_warehouse",
      "type": "http",
      "label": "同步到仓库系统",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://warehouse.example.com/orders",
        "body": {
          "order_id": "{{variables.order_id}}",
          "product_id": "{{request.product_id}}",
          "quantity": "{{request.quantity}}"
        }
      },
      "on_error": "retry",
      "max_retries": 5,
      "retry_backoff": "linear"
    }
  ],
  "transactions": {
    "order_tx": {
      "datasource": "mysql_main",
      "isolation": "read_committed",
      "steps": ["validate_stock", "deduct_stock", "create_order", "update_order_status"]
    }
  }
}
```

**执行流程**：
1. 验证库存（同步，事务内）
2. 扣减库存（同步，事务内）
3. 创建订单（同步，事务内）
4. 调用支付（同步，等待支付结果）
5. 更新订单状态（同步，事务内）
6. **提交事务** ✅
7. 发送邮件（异步，立即返回）
8. 发送短信（异步，立即返回）
9. 同步到仓库（异步，立即返回）
10. **返回工作流结果**（不等待异步步骤完成）

## 技术实现

### 核心组件

**AsyncExecutor**（`server/workflow/async_executor.go`）

```go
type AsyncExecutor struct {
    runningTasks    map[string]*AsyncTask
    completedTasks  map[string]*AsyncTask
    maxConcurrent   int
    semaphore       chan struct{}
}

func (e *AsyncExecutor) ExecuteAsync(requestID, stepID string, executeFunc func() (*StepResult, error)) *AsyncTask {
    task := &AsyncTask{
        RequestID: requestID,
        StepID:    stepID,
        Status:    "pending",
    }

    go func() {
        e.semaphore <- struct{}{}        // 获取信号量
        defer func() { <-e.semaphore }() // 释放信号量

        result, err := executeFunc()
        // 更新任务状态...
    }()

    return task
}
```

**集成到引擎**（`server/workflow/dataif_engine.go`）

```go
if step.Async {
    asyncTask := e.asyncExecutor.ExecuteAsync(
        requestID,
        step.ID,
        func() (*StepResult, error) {
            return e.executeStepWithRetry(step, ctx, workflow, txMgr)
        },
    )
    // 返回占位结果，继续执行后续步骤
}
```

## 限制与注意事项

### 1. 异步步骤的输出不可用

异步步骤的输出无法被后续同步步骤使用：

❌ **错误示例**：

```json
{
  "steps": [
    {
      "id": "async_step",
      "type": "http",
      "async": true,
      "output": {
        "result": "{{response.data}}"
      }
    },
    {
      "id": "use_result",
      "type": "sql",
      "sql": "INSERT INTO logs (data) VALUES (:variables.result)"  // ❌ result 不可用
    }
  ]
}
```

### 2. 事务限制

异步步骤不能参与事务：
- 不能设置 `transaction_group`
- 不能触发事务回滚
- 失败不会影响工作流状态

### 3. 内存占用

- 已完成的任务会保留在内存中
- 需要定期清理（建议每小时清理一次）
- 可通过 API 手动清理

### 4. 无法保证执行顺序

多个异步步骤的执行顺序不确定，取决于调度器。

### 5. 服务重启丢失

异步任务存储在内存中，服务重启后会丢失未完成的任务。

## 相关文档

- [工作流引擎使用手册](./workflow-engine-usage.md)
- [工作流步骤重试机制](./workflow-retry-mechanism.md)
- [工作流执行查询 API](./workflow-engine-phase3-summary.md)

---

**实施日期**：2026-07-02  
**状态**：✅ 已实现  
**代码文件**：
- `server/workflow/async_executor.go` (300行)
- `server/workflow/dataif_engine.go` (集成异步执行)
- `server/api/async_tasks.go` (异步任务管理API)
- `server/api/router.go` (注册API路由)
