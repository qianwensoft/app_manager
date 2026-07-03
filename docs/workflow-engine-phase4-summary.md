# 工作流引擎 Phase 4 实施总结

## 实施日期
2026-07-02

## Phase 4 完成功能

### 1. 步骤重试机制 ✅

**核心文件**：`server/workflow/retry_executor.go` (300行)

#### 重试策略

支持4种退避策略：

| 策略 | 说明 | 示例时序 |
|------|------|---------|
| `fixed` | 固定间隔 | 2s → 2s → 2s |
| `linear` | 线性增长 | 1s → 2s → 3s → 4s |
| `exponential` | 指数退避 | 1s → 2s → 4s → 8s |
| `custom` | 自定义序列 | 500ms → 1s → 2s → 5s |

#### 重试条件

根据错误类型决定是否重试：

```json
{
  "retry_on": ["timeout", "network_error", "server_error", "all"]
}
```

**错误识别关键词**：
- `timeout`: timeout, timed out, deadline exceeded
- `network_error`: connection refused, connection reset, network unreachable, EOF
- `server_error`: 500, 502, 503, 504, internal server error, bad gateway

#### 配置示例

```json
{
  "id": "call_payment_api",
  "type": "http",
  "on_error": "retry",
  "max_retries": 3,
  "retry_backoff": "exponential",
  "retry_interval": [1000],
  "retry_on": ["timeout", "network_error"]
}
```

#### 技术实现

**RetryExecutor 核心逻辑**：

```go
func (r *RetryExecutor) Execute(operation func() error) error {
    for attempt := 0; attempt <= r.policy.MaxRetries; attempt++ {
        err := operation()
        if err == nil {
            return nil
        }

        if !r.shouldRetry(err, attempt) {
            return err
        }

        if attempt < r.policy.MaxRetries {
            delay := r.calculateBackoff(attempt)
            time.Sleep(delay)
        }
    }
    return lastError
}
```

**集成到引擎**：

```go
func (e *DataIfEngine) executeStepWithRetry(step *Step, ...) (*StepResult, error) {
    executeFunc := func() (*StepResult, error) {
        return e.executeStep(step, ctx, workflow, txMgr)
    }
    return ExecuteWithRetry(step, executeFunc)
}
```

#### Step 模型扩展

```go
type Step struct {
    // ... existing fields
    OnError      string   `json:"on_error,omitempty"`       // retry, rollback, continue
    MaxRetries   int      `json:"max_retries,omitempty"`    // 最大重试次数
    RetryInterval []int   `json:"retry_interval,omitempty"` // 重试间隔（毫秒）
    RetryBackoff string   `json:"retry_backoff,omitempty"`  // fixed, linear, exponential, custom
    RetryOn      []string `json:"retry_on,omitempty"`       // 重试条件
}
```

#### StepResult 扩展

```go
type StepResult struct {
    // ... existing fields
    RetryCount int `json:"retry_count,omitempty"` // 实际重试次数
}
```

### 2. 异步执行支持 ✅

**核心文件**：`server/workflow/async_executor.go` (300行)

#### 异步执行模型

- **同步步骤**：顺序执行，等待完成
- **异步步骤**：后台goroutine执行，立即返回占位结果

#### 并发控制

使用信号量限制最大并发数：

```go
type AsyncExecutor struct {
    maxConcurrent  int
    semaphore      chan struct{}  // 信号量
    runningTasks   map[string]*AsyncTask
    completedTasks map[string]*AsyncTask
}
```

默认配置：最大20个并发任务

#### 配置示例

```json
{
  "id": "send_notification",
  "type": "http",
  "label": "发送通知",
  "async": true,
  "http_config": {
    "method": "POST",
    "url": "https://notify.example.com/send"
  }
}
```

#### 任务状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `running` | 正在执行 |
| `completed` | 执行成功 |
| `failed` | 执行失败 |

#### AsyncTask 模型

```go
type AsyncTask struct {
    RequestID   string      `json:"request_id"`
    StepID      string      `json:"step_id"`
    Status      string      `json:"status"`
    StartTime   time.Time   `json:"start_time"`
    EndTime     *time.Time  `json:"end_time,omitempty"`
    ElapsedMS   int64       `json:"elapsed_ms"`
    Result      *StepResult `json:"result,omitempty"`
    Error       string      `json:"error,omitempty"`
    Progress    int         `json:"progress"` // 0-100
}
```

#### 集成到引擎

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
    asyncResult := &StepResult{
        StepID: step.ID,
        Success: true,
        Output: map[string]interface{}{
            "async": true,
            "task_status": "pending",
            "request_id": requestID,
        },
    }
    result.StepLogs = append(result.StepLogs, *asyncResult)
    continue
}
```

### 3. 异步任务管理 API ✅

**核心文件**：`server/api/async_tasks.go` (60行)

#### 新增 API 端点

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/data-stack/async-tasks` | GET | viewer+ | 列出运行中的任务 |
| `/api/data-stack/async-tasks/stats` | GET | viewer+ | 获取执行器统计 |
| `/api/data-stack/async-tasks/:request_id/:step_id` | GET | viewer+ | 获取单个任务状态 |
| `/api/data-stack/async-tasks/cleanup` | POST | admin | 清理已完成任务 |

#### 查询任务状态

```bash
GET /api/data-stack/async-tasks/wf_20260702_abc123/send_email
```

**响应**：

```json
{
  "ok": true,
  "data": {
    "request_id": "wf_20260702_abc123",
    "step_id": "send_email",
    "status": "completed",
    "elapsed_ms": 2150,
    "progress": 100,
    "result": {
      "success": true,
      "output": {
        "status_code": 200
      }
    }
  }
}
```

#### 执行器统计

```bash
GET /api/data-stack/async-tasks/stats
```

**响应**：

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

#### 清理已完成任务

```bash
POST /api/data-stack/async-tasks/cleanup
{
  "older_than_minutes": 60
}
```

## 文件清单

### 新增文件

```
server/workflow/
├── retry_executor.go           # 重试执行器（300行）
└── async_executor.go           # 异步执行器（300行）

server/api/
└── async_tasks.go              # 异步任务管理API（60行）

docs/
├── workflow-retry-mechanism.md    # 重试机制文档
└── workflow-async-execution.md    # 异步执行文档

Total: ~660 lines of new code + 2 documentation files
```

### 修改文件

```
server/workflow/
├── step.go                     # 新增重试和异步字段
└── dataif_engine.go            # 集成重试和异步执行

server/api/
└── router.go                   # 注册异步任务API路由（+4行）
```

## 技术实现亮点

### 1. 重试机制

**优点**：
- 支持4种退避策略，灵活配置
- 智能错误识别，避免无效重试
- 自动限制最大间隔（60秒）
- 与事务管理无缝集成

**关键设计**：
- 函数式设计，通过闭包包装执行逻辑
- 错误类型识别基于关键词匹配
- 支持自定义重试间隔序列

### 2. 异步执行

**优点**：
- 不阻塞工作流主流程
- 信号量控制并发数，防止资源耗尽
- 任务状态可追踪
- 支持定期清理

**关键设计**：
- Goroutine池模式，复用资源
- 任务状态内存存储，快速查询
- 占位结果机制，保持工作流完整性

### 3. 功能组合

重试 + 异步可以组合使用：

```json
{
  "id": "send_webhook",
  "type": "http",
  "async": true,
  "on_error": "retry",
  "max_retries": 3,
  "retry_backoff": "exponential"
}
```

异步步骤失败后会在后台自动重试，不影响主流程。

## 使用示例

### 示例1：HTTP API 调用带重试

```json
{
  "steps": [
    {
      "id": "call_payment_api",
      "type": "http",
      "label": "调用支付API",
      "http_config": {
        "method": "POST",
        "url": "https://payment.example.com/charge"
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

**执行时序**：
1. 第1次尝试 → 超时
2. 等待 1000ms
3. 第2次尝试 → 网络错误
4. 等待 2000ms
5. 第3次尝试 → 成功

### 示例2：异步通知

```json
{
  "steps": [
    {
      "id": "create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "mysql_main",
      "sql": "INSERT INTO orders ...",
      "output": {
        "order_id": "{{last_insert_id}}"
      }
    },
    {
      "id": "send_email",
      "type": "http",
      "label": "发送邮件",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://mail.example.com/send"
      }
    },
    {
      "id": "send_sms",
      "type": "http",
      "label": "发送短信",
      "async": true,
      "http_config": {
        "method": "POST",
        "url": "https://sms.example.com/send"
      }
    }
  ]
}
```

**执行流程**：
1. 创建订单（同步，等待完成）
2. 发送邮件（异步，立即返回）
3. 发送短信（异步，立即返回）
4. 返回工作流结果（不等待邮件和短信完成）

### 示例3：组合使用

```json
{
  "steps": [
    {
      "id": "sync_to_warehouse",
      "type": "http",
      "label": "同步到仓库",
      "async": true,
      "on_error": "retry",
      "max_retries": 5,
      "retry_backoff": "linear",
      "retry_interval": [2000],
      "retry_on": ["all"],
      "http_config": {
        "method": "POST",
        "url": "https://warehouse.example.com/sync"
      }
    }
  ]
}
```

此步骤异步执行，失败后自动重试5次（间隔 2s, 4s, 6s, 8s, 10s）。

## 限制与注意事项

### 重试机制限制

1. **幂等性要求**：启用重试的步骤必须是幂等的
2. **事务内重试**：事务保持打开状态，可能导致锁超时
3. **最大间隔**：自动限制为60秒
4. **错误识别**：基于关键词匹配，可能误判

### 异步执行限制

1. **输出不可用**：异步步骤的输出无法被后续同步步骤使用
2. **事务限制**：异步步骤不能在事务组内
3. **内存占用**：已完成任务保留在内存，需定期清理
4. **服务重启**：重启后未完成的异步任务会丢失
5. **无序保证**：多个异步步骤执行顺序不确定

### 最佳实践

✅ **推荐做法**：
- HTTP API 调用配置重试（超时、网络错误）
- 通知类操作使用异步（邮件、短信、Webhook）
- 数据同步操作组合异步+重试
- 定期清理已完成的异步任务

❌ **不推荐做法**：
- 非幂等操作配置重试
- 关键业务逻辑使用异步
- 事务内步骤配置异步
- 异步步骤之间有依赖关系

## 监控指标

### 重试相关指标

- 步骤重试次数分布
- 重试成功率
- 平均重试延迟
- 重试失败原因分析

### 异步相关指标

- 运行中任务数量
- 已完成任务数量
- 可用工作线程数
- 任务平均执行时长
- 任务失败率

## 性能影响

### 重试机制

- **延迟增加**：重试会增加步骤执行时间
  - Fixed 3次：最多 6s（假设每次2s）
  - Exponential 3次：最多 15s（1s+2s+4s+8s）
- **资源占用**：事务重试期间持有数据库连接
- **建议**：事务内步骤重试次数 ≤ 3次

### 异步执行

- **并发数**：默认20个并发，可根据服务器调整
- **内存占用**：每个任务约 1-2 KB，1000个任务约 1-2 MB
- **清理策略**：建议每小时清理已完成任务

## Phase 4 总结

### 完成度

- ✅ 步骤重试机制（100%）
- ✅ 异步执行支持（100%）
- ✅ 异步任务管理 API（100%）
- ✅ 完整文档（100%）

### 代码统计

- 新增代码：~660行
- 新增文件：5个（3个代码 + 2个文档）
- 修改文件：3个
- 新增 API 端点：4个

### 测试状态

- ✅ 编译通过
- ⏸️ 单元测试（待补充）
- ⏸️ 集成测试（待补充）
- ⏸️ 性能测试（待补充）

### 文档输出

- ✅ [工作流步骤重试机制](./workflow-retry-mechanism.md)
- ✅ [工作流异步执行机制](./workflow-async-execution.md)
- ✅ Phase 4 实施总结（本文档）

## 下一步计划

### Phase 5（高级特性增强）

1. **条件重试**：根据错误内容决定是否重试
2. **重试回调**：重试前执行自定义逻辑
3. **异步结果回调**：异步任务完成后触发回调
4. **任务优先级**：支持高优先级任务优先执行

### Phase 6（Web UI）

1. 工作流设计器（可视化编排）
2. 执行监控面板（实时状态）
3. 重试配置向导
4. 异步任务监控界面

---

**Phase 4 状态**：✅ 完成  
**编译状态**：✅ 通过  
**生产就绪**：⚠️ 需要补充测试  
**最后更新**：2026-07-02
