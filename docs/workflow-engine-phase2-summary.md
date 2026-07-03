# 工作流引擎实施总结 - 阶段2完成

## 实施日期
2026-07-01

## 实施内容

### 1. 数据库架构 ✅

**新增表**
- `workflow_execution_logs` - 工作流执行日志，记录每次执行的完整信息
- `compensation_dead_letters` - 补偿失败的死信队列

**模型变更**
- `DataInterface.DatasetID` 改为可空指针，支持纯工作流类型接口
- `DataInterface.WorkflowJSON` - 工作流定义（步骤、事务、错误处理）
- `DataInterface.DatasourcesJSON` - 数据源配置（别名映射）

### 2. 工作流引擎核心 ✅

#### 执行引擎 (`DataIfEngine`)
- 工作流解析和步骤编排
- 多数据源加载和上下文管理
- 事务生命周期管理
- 失败自动触发补偿机制
- 执行日志持久化

#### 执行上下文 (`Context`)
- 请求参数（request）
- 工作流变量（variables）
- 步骤输出（step_outputs）
- 数据源映射（datasources）
- 环境变量（env）

### 3. 步骤执行器 ✅

#### SQL 步骤 (`SQLStepExecutor`)
- 命名参数绑定：`:request.user_id`、`:variables.amount`、`:step_id.field`
- 支持事务和非事务模式
- 输出模板：`{{last_insert_id}}`、`{{affected_rows}}`
- 预期影响行数校验
- 动态数据源路由

#### 条件步骤 (`ConditionEvaluator`)
- 基于 goja (JavaScript) 引擎
- 支持访问完整上下文
- then/else 分支执行
- 内置辅助函数：has、get、isEmpty

#### HTTP 步骤 (`HTTPStepExecutor`)
- 支持 GET/POST/PUT/DELETE/PATCH 方法
- 请求头和请求体模板变量展开
- JSON 响应自动解析
- 输出映射配置
- 超时控制

#### 脚本步骤 (`ScriptStepExecutor`)
- JavaScript 代码执行
- 完整上下文注入
- 变量读写（setVariable/getVariable）
- 内置工具函数：sum、max、min、log
- 结果自动合并到上下文

#### 接口调用步骤 (`InterfaceStepExecutor`)
- 复用现有数据接口
- 参数模板展开
- 输出映射配置
- 避免循环依赖的回调设计

### 4. 事务管理 ✅

#### 事务管理器 (`TransactionManager`)
- 事务组管理（同数据源多步骤共享事务）
- 四种隔离级别支持：
  - read_uncommitted
  - read_committed
  - repeatable_read
  - serializable
- 失败统一回滚
- 成功统一提交

### 5. 数据源路由 ✅

#### 路由器 (`DatasourceRouter`)
- **静态路由**：固定数据源
- **规则路由**：基于条件表达式顺序匹配
- **脚本路由**：JavaScript 动态计算

路由应用场景：
- 分库分表（按用户ID取模）
- 地域路由（按region选择数据库）
- 读写分离（按操作类型选择主从库）

### 6. 补偿机制 ✅

**Saga 模式补偿**
- 失败时逆序执行补偿步骤
- 仅补偿已成功的步骤
- 补偿失败记录到死信队列
- 支持 SQL 和接口调用补偿

### 7. API 集成 ✅

**接口执行入口**
- `POST /api/data/interfaces/execute/:code`
- 支持 `kind=workflow` 类型接口
- 自动保存执行日志
- 返回最终输出变量

## 核心特性汇总

✅ 多数据源支持  
✅ 事务管理（单数据源多步骤）  
✅ 条件分支（JavaScript 表达式）  
✅ 补偿机制（Saga 模式）  
✅ 动态路由（参数/规则/脚本）  
✅ 命名参数（路径表达式）  
✅ HTTP 调用  
✅ 脚本执行  
✅ 接口复用  
✅ 执行日志审计  

## 技术栈

- **语言**: Go 1.21+
- **ORM**: GORM
- **JavaScript 引擎**: goja
- **数据库**: SQLite/MySQL/PostgreSQL（通过 dbdriver 抽象）

## 文件清单

### 核心文件
```
server/workflow/
├── dataif_engine.go           # 工作流执行引擎
├── context.go                 # 执行上下文
├── step.go                    # 步骤定义和结果结构
├── step_executor.go           # 步骤执行器接口
├── sql_executor.go            # SQL 步骤执行器
├── condition_evaluator.go     # 条件表达式评估器
├── http_executor.go           # HTTP 步骤执行器
├── script_executor.go         # 脚本步骤执行器
├── interface_executor.go      # 接口调用步骤执行器
├── transaction_manager.go     # 事务管理器
└── datasource_router.go       # 数据源路由器

server/models/
├── workflow.go                # WorkflowExecutionLog、CompensationDeadLetter
└── data_stack.go              # DataInterface 模型更新

server/api/
└── iface_executor.go          # workflow kind 集成

server/migrations/
└── add_workflow_interface_fields.go  # 数据库迁移
```

### 文档
```
docs/
├── workflow-engine-usage.md   # 使用手册
└── runtime-monitor-enhancements-2026-06-30.md  # 设计文档
```

## 使用示例

### 简单订单创建工作流

```json
{
  "version": "1.0",
  "steps": [
    {
      "id": "create_order",
      "type": "sql",
      "datasource": "order_db",
      "sql": "INSERT INTO orders (user_id, amount) VALUES (:request.user_id, :request.amount)",
      "output": {"order_id": "{{last_insert_id}}"}
    },
    {
      "id": "notify",
      "type": "http",
      "http_config": {
        "method": "POST",
        "url": "https://api.example.com/notify",
        "body": {"order_id": "{{variables.order_id}}"}
      }
    }
  ]
}
```

### 复杂事务 + 补偿工作流

```json
{
  "version": "1.0",
  "steps": [
    {
      "id": "deduct_inventory",
      "type": "sql",
      "datasource": "inventory_db",
      "transaction_group": "tx_inventory",
      "sql": "UPDATE inventory SET quantity = quantity - :request.quantity WHERE product_id = :request.product_id"
    },
    {
      "id": "create_order",
      "type": "sql",
      "datasource": "order_db",
      "transaction_group": "tx_order",
      "sql": "INSERT INTO orders (user_id, product_id, quantity) VALUES (:request.user_id, :request.product_id, :request.quantity)",
      "output": {"order_id": "{{last_insert_id}}"}
    }
  ],
  "transactions": {
    "tx_inventory": {
      "datasource": "inventory_db",
      "isolation": "repeatable_read"
    },
    "tx_order": {
      "datasource": "order_db",
      "isolation": "read_committed"
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

## 性能考虑

1. **事务持有时间**：避免在事务中执行 HTTP 或长时间脚本
2. **参数展开缓存**：命名参数在执行前一次性展开
3. **上下文大小**：避免在 variables 中存储大量数据
4. **步骤数量**：建议单个工作流步骤数 < 20

## 限制与注意事项

1. **跨数据源事务**：不支持分布式事务，需使用补偿模式
2. **循环步骤**：当前版本未实现（待阶段3）
3. **异步执行**：当前版本同步执行（待阶段3）
4. **接口调用循环依赖**：工作流不能调用自身或形成调用环

## 下一步计划（阶段3）

### 待实现功能
- [ ] 延迟步骤（type=delay）
- [ ] 循环步骤（type=loop）
- [ ] 并行执行（async=true）
- [ ] 步骤重试机制
- [ ] 死信队列处理界面
- [ ] Web UI 工作流设计器
- [ ] 工作流版本管理
- [ ] 执行进度查询 API
- [ ] 性能监控和统计

### Web UI 设计器需求
- 拖拽式步骤编排
- 可视化条件分支
- 数据源配置向导
- 参数映射辅助
- 实时语法校验
- 执行日志可视化

## 测试建议

1. **单元测试**：各执行器的边界条件
2. **集成测试**：完整工作流端到端测试
3. **压力测试**：并发执行工作流性能
4. **失败场景**：补偿机制正确性验证

## 总结

阶段2已完成基础工作流引擎的核心功能实现，支持多种步骤类型、事务管理、补偿机制和动态路由。系统架构清晰，扩展性良好，为后续 Web UI 和高级特性打下坚实基础。
