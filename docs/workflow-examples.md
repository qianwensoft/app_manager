# 工作流引擎完整示例

## 示例1：电商订单处理工作流

包含：库存检查、订单创建、支付、发货通知

```json
{
  "version": "1.0",
  "description": "电商订单完整处理流程",
  "steps": [
    {
      "id": "validate_input",
      "type": "script",
      "label": "验证输入参数",
      "engine": "javascript",
      "code": "if (!request.user_id || !request.product_id || !request.quantity) { throw new Error('Missing required parameters'); } if (request.quantity <= 0) { throw new Error('Quantity must be positive'); } return { valid: true };"
    },
    {
      "id": "check_inventory",
      "type": "sql",
      "label": "检查库存",
      "datasource": "inventory_db",
      "sql": "SELECT quantity, price FROM inventory WHERE product_id = :request.product_id FOR UPDATE",
      "output": {
        "available_quantity": "{{row.quantity}}",
        "unit_price": "{{row.price}}"
      }
    },
    {
      "id": "calculate_total",
      "type": "script",
      "label": "计算订单总额",
      "engine": "javascript",
      "code": "var total = variables.unit_price * request.quantity; var discount = 0; if (request.quantity >= 10) { discount = total * 0.1; } else if (request.quantity >= 5) { discount = total * 0.05; } setVariable('discount', discount); setVariable('total_amount', total - discount); return { total: total, discount: discount, final_amount: total - discount };"
    },
    {
      "id": "validate_stock",
      "type": "condition",
      "label": "验证库存充足",
      "expression": "variables.available_quantity >= request.quantity",
      "then": ["create_order"],
      "else": ["insufficient_stock_error"]
    },
    {
      "id": "create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "order_db",
      "transaction_group": "tx_order",
      "sql": "INSERT INTO orders (user_id, product_id, quantity, unit_price, discount, total_amount, status, created_at) VALUES (:request.user_id, :request.product_id, :request.quantity, :variables.unit_price, :variables.discount, :variables.total_amount, 'pending', NOW())",
      "output": {
        "order_id": "{{last_insert_id}}"
      }
    },
    {
      "id": "deduct_inventory",
      "type": "sql",
      "label": "扣减库存",
      "datasource": "inventory_db",
      "transaction_group": "tx_inventory",
      "sql": "UPDATE inventory SET quantity = quantity - :request.quantity WHERE product_id = :request.product_id AND quantity >= :request.quantity",
      "expect_affected_rows": 1
    },
    {
      "id": "call_payment_api",
      "type": "http",
      "label": "调用支付接口",
      "http_config": {
        "method": "POST",
        "url": "https://payment.example.com/api/v1/charge",
        "headers": {
          "Authorization": "Bearer {{env.payment_api_key}}",
          "Content-Type": "application/json"
        },
        "body": {
          "order_id": "{{variables.order_id}}",
          "user_id": "{{request.user_id}}",
          "amount": "{{variables.total_amount}}",
          "currency": "CNY"
        }
      },
      "output": {
        "payment_id": "json.payment_id",
        "payment_status": "json.status"
      }
    },
    {
      "id": "check_payment_result",
      "type": "condition",
      "label": "检查支付结果",
      "expression": "variables.payment_status === 'success'",
      "then": ["update_order_paid", "send_notification"],
      "else": ["payment_failed_rollback"]
    },
    {
      "id": "update_order_paid",
      "type": "sql",
      "label": "更新订单状态为已支付",
      "datasource": "order_db",
      "transaction_group": "tx_order",
      "sql": "UPDATE orders SET status = 'paid', payment_id = :variables.payment_id, paid_at = NOW() WHERE id = :variables.order_id"
    },
    {
      "id": "send_notification",
      "type": "http",
      "label": "发送订单通知",
      "http_config": {
        "method": "POST",
        "url": "https://notification.example.com/api/send",
        "headers": {
          "Authorization": "Bearer {{env.notification_api_key}}"
        },
        "body": {
          "user_id": "{{request.user_id}}",
          "type": "order_created",
          "order_id": "{{variables.order_id}}",
          "message": "Your order has been placed successfully!"
        }
      }
    },
    {
      "id": "insufficient_stock_error",
      "type": "script",
      "label": "库存不足错误",
      "engine": "javascript",
      "code": "throw new Error('Insufficient stock. Available: ' + variables.available_quantity + ', Requested: ' + request.quantity);"
    },
    {
      "id": "payment_failed_rollback",
      "type": "script",
      "label": "支付失败",
      "engine": "javascript",
      "code": "throw new Error('Payment failed: ' + variables.payment_status);"
    }
  ],
  "transactions": {
    "tx_order": {
      "datasource": "order_db",
      "isolation": "read_committed"
    },
    "tx_inventory": {
      "datasource": "inventory_db",
      "isolation": "repeatable_read"
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
      },
      {
        "for_step": "create_order",
        "type": "sql",
        "datasource": "order_db",
        "sql": "UPDATE orders SET status = 'cancelled' WHERE id = :variables.order_id"
      }
    ]
  }
}
```

## 示例2：批量数据同步工作流

包含：循环处理、动态路由、重试机制

```json
{
  "version": "1.0",
  "description": "批量数据同步到多个分片",
  "steps": [
    {
      "id": "fetch_pending_records",
      "type": "sql",
      "label": "获取待同步记录",
      "datasource": "source_db",
      "sql": "SELECT id, user_id, data FROM sync_queue WHERE status = 'pending' LIMIT 100",
      "output": {
        "pending_records": "{{rows}}"
      }
    },
    {
      "id": "process_each_record",
      "type": "loop",
      "label": "处理每条记录",
      "loop_config": {
        "type": "foreach",
        "items": "variables.pending_records",
        "item": "record",
        "index": "idx",
        "body": ["determine_shard", "sync_to_target", "mark_completed"]
      }
    },
    {
      "id": "determine_shard",
      "type": "script",
      "label": "确定目标分片",
      "engine": "javascript",
      "code": "var shard_id = vars.record.user_id % 4; setVariable('target_shard', 'shard_' + shard_id); return { shard: shard_id };"
    },
    {
      "id": "sync_to_target",
      "type": "sql",
      "label": "同步到目标分片",
      "datasource_routing": {
        "type": "script",
        "engine": "javascript",
        "code": "return variables.target_shard;",
        "default": "shard_0"
      },
      "sql": "INSERT INTO user_data (user_id, data, synced_at) VALUES (:record.user_id, :record.data, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), synced_at = NOW()"
    },
    {
      "id": "mark_completed",
      "type": "sql",
      "label": "标记为已同步",
      "datasource": "source_db",
      "sql": "UPDATE sync_queue SET status = 'completed', synced_at = NOW() WHERE id = :record.id"
    },
    {
      "id": "summary",
      "type": "script",
      "label": "生成同步摘要",
      "engine": "javascript",
      "code": "var total = variables.pending_records.length; log('Synced', total, 'records'); return { total_synced: total };"
    }
  ]
}
```

## 示例3：定时任务工作流

包含：条件判断、延迟、HTTP调用

```json
{
  "version": "1.0",
  "description": "定时健康检查和告警",
  "steps": [
    {
      "id": "check_service_health",
      "type": "http",
      "label": "检查服务健康状态",
      "http_config": {
        "method": "GET",
        "url": "https://api.example.com/health",
        "headers": {
          "Authorization": "Bearer {{env.monitoring_token}}"
        }
      },
      "output": {
        "health_status": "json.status",
        "response_time": "json.response_time_ms"
      }
    },
    {
      "id": "evaluate_health",
      "type": "condition",
      "label": "评估健康状态",
      "expression": "variables.health_status !== 'healthy' || variables.response_time > 1000",
      "then": ["send_alert", "wait_before_retry", "retry_check"],
      "else": ["log_success"]
    },
    {
      "id": "send_alert",
      "type": "http",
      "label": "发送告警",
      "http_config": {
        "method": "POST",
        "url": "https://alert.example.com/api/notify",
        "body": {
          "severity": "warning",
          "service": "api-server",
          "status": "{{variables.health_status}}",
          "response_time": "{{variables.response_time}}",
          "timestamp": "{{env.current_time}}"
        }
      }
    },
    {
      "id": "wait_before_retry",
      "type": "delay",
      "label": "等待30秒后重试",
      "delay_config": {
        "seconds": 30
      }
    },
    {
      "id": "retry_check",
      "type": "interface",
      "label": "重新检查（复用本接口）",
      "interface_code": "health_check_workflow",
      "params": {
        "retry": true
      }
    },
    {
      "id": "log_success",
      "type": "script",
      "label": "记录成功日志",
      "engine": "javascript",
      "code": "log('Health check passed. Response time:', variables.response_time, 'ms'); return { success: true };"
    }
  ]
}
```

## 示例4：数据清洗工作流

包含：While循环、脚本处理、条件分支

```json
{
  "version": "1.0",
  "description": "分批清洗历史数据",
  "steps": [
    {
      "id": "init_counter",
      "type": "script",
      "label": "初始化计数器",
      "engine": "javascript",
      "code": "setVariable('processed_count', 0); setVariable('has_more', true); return { initialized: true };"
    },
    {
      "id": "batch_loop",
      "type": "loop",
      "label": "分批处理循环",
      "loop_config": {
        "type": "while",
        "condition": "variables.has_more === true",
        "max_iterations": 100,
        "body": ["fetch_batch", "clean_batch", "update_counter", "check_more"]
      }
    },
    {
      "id": "fetch_batch",
      "type": "sql",
      "label": "获取一批数据",
      "datasource": "main_db",
      "sql": "SELECT id, data FROM raw_data WHERE cleaned = 0 LIMIT 1000",
      "output": {
        "batch_records": "{{rows}}"
      }
    },
    {
      "id": "clean_batch",
      "type": "script",
      "label": "清洗数据",
      "engine": "javascript",
      "code": "var records = variables.batch_records; var cleaned = []; for (var i = 0; i < records.length; i++) { var r = records[i]; var data = JSON.parse(r.data); if (data.email && data.email.indexOf('@') > 0) { cleaned.push({ id: r.id, email: data.email.toLowerCase().trim() }); } } setVariable('cleaned_records', cleaned); return { cleaned_count: cleaned.length };"
    },
    {
      "id": "update_records",
      "type": "loop",
      "label": "更新清洗后的记录",
      "loop_config": {
        "type": "foreach",
        "items": "variables.cleaned_records",
        "item": "record",
        "body": ["update_single_record"]
      }
    },
    {
      "id": "update_single_record",
      "type": "sql",
      "label": "更新单条记录",
      "datasource": "main_db",
      "sql": "UPDATE raw_data SET cleaned = 1, email = :record.email WHERE id = :record.id"
    },
    {
      "id": "update_counter",
      "type": "script",
      "label": "更新计数器",
      "engine": "javascript",
      "code": "var count = variables.processed_count + variables.cleaned_records.length; setVariable('processed_count', count); log('Processed', count, 'records so far'); return { count: count };"
    },
    {
      "id": "check_more",
      "type": "script",
      "label": "检查是否还有数据",
      "engine": "javascript",
      "code": "var has_more = variables.batch_records.length > 0; setVariable('has_more', has_more); return { has_more: has_more };"
    },
    {
      "id": "summary",
      "type": "script",
      "label": "生成清洗报告",
      "engine": "javascript",
      "code": "return { total_processed: variables.processed_count, status: 'completed' };"
    }
  ]
}
```

## 数据源配置示例

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
    },
    {
      "alias": "shard_0",
      "data_source_id": 10,
      "description": "分片0"
    },
    {
      "alias": "shard_1",
      "data_source_id": 11,
      "description": "分片1"
    },
    {
      "alias": "shard_2",
      "data_source_id": 12,
      "description": "分片2"
    },
    {
      "alias": "shard_3",
      "data_source_id": 13,
      "description": "分片3"
    }
  ]
}
```

## 调用示例

### 创建订单工作流

```bash
curl -X POST http://localhost:8080/api/data/interfaces/execute/create_order_workflow \
  -H "Content-Type: application/json" \
  -d '{
    "param_values": {
      "user_id": 123,
      "product_id": 456,
      "quantity": 2
    }
  }'
```

### 响应示例

```json
{
  "ok": true,
  "kind": "workflow",
  "elapsed_ms": 245,
  "data": {
    "order_id": 789,
    "total_amount": 199.80,
    "discount": 10.00,
    "payment_id": "pay_abc123",
    "payment_status": "success"
  }
}
```

## 执行日志查询

```sql
-- 查看最近的工作流执行
SELECT 
  request_id,
  interface_code,
  status,
  completed_steps,
  total_steps,
  elapsed_ms,
  error_message,
  created_at
FROM workflow_execution_logs
ORDER BY created_at DESC
LIMIT 20;

-- 查看失败的工作流
SELECT 
  request_id,
  interface_code,
  failed_step_id,
  error_message,
  step_logs_json
FROM workflow_execution_logs
WHERE status = 'failed'
ORDER BY created_at DESC;

-- 查看需要补偿的工作流
SELECT 
  request_id,
  interface_code,
  compensated,
  compensation_ms
FROM workflow_execution_logs
WHERE status = 'compensated'
ORDER BY created_at DESC;
```
