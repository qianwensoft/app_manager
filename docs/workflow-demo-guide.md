# 工作流引擎 Demo 应用指南

## 概述

本 Demo 演示了工作流引擎的核心功能，包括：

- ✅ **SQL 事务管理** - 多步骤数据库操作的原子性
- ✅ **HTTP 调用重试** - 网络故障自动恢复
- ✅ **异步任务执行** - 后台任务并发处理
- ✅ **条件分支控制** - 根据条件选择执行路径
- ✅ **延迟执行** - 定时任务和等待机制
- ✅ **补偿回滚** - 失败场景的数据恢复

## 快速开始

### 1. 准备环境

#### 启动服务器

```bash
cd server
go run . config.sqlite.yaml
```

服务器默认监听 `http://localhost:8080`

#### 启动前端

```bash
cd web
npm run dev
```

前端访问地址 `http://localhost:3001`

### 2. 准备测试数据库（可选）

如果要测试 SQL 步骤，需要准备 MySQL 数据库：

```sql
-- 创建测试数据库
CREATE DATABASE demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE demo;

-- 创建订单表
CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  updated_at DATETIME DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建用户余额表
CREATE TABLE user_balance (
  user_id BIGINT PRIMARY KEY,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  updated_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入测试数据
INSERT INTO user_balance (user_id, balance, updated_at) VALUES
(123, 1000.00, NOW()),
(456, 500.00, NOW());
```

如果不准备数据库，可以只测试不依赖 SQL 的工作流（API重试、异步任务、条件分支、延迟执行）。

### 3. 初始化 Demo 工作流

运行初始化脚本：

```bash
cd /Volumes/data/workspace/qianwen/app-manager
./scripts/init-workflow-demo.sh
```

脚本会提示输入登录凭证（默认 `admin / admin123`），然后自动创建 5 个演示工作流。

**注意**：如果没有 MySQL 数据库，脚本中的数据源创建会失败，但其他工作流仍可正常创建和测试。

### 4. 手动创建数据源（如果脚本失败）

如果自动创建失败，可以通过前端手动创建：

1. 访问 http://localhost:3001/data
2. 点击「数据源」标签页
3. 点击「新建数据源」
4. 填写配置：
   - **编码**: `demo_mysql`
   - **名称**: `Demo MySQL 数据库`
   - **类型**: `mysql`
   - **DSN**: `root:password@tcp(localhost:3306)/demo?charset=utf8mb4&parseTime=True&loc=Local`
   - **只读**: 否
   - **配置**: `{"pool_max_open":10,"pool_max_idle":5,"pool_conn_max_lifetime_sec":3600}`

## Demo 工作流说明

### Demo 1: 订单处理流程

**接口编码**: `demo_create_order`  
**类别**: 订单管理

**功能**：演示完整的订单创建流程，包括参数验证、数据库事务、异步通知。

**步骤**：
1. **validate_params** (script) - 验证 user_id 和 amount 参数
2. **create_order** (sql) - 插入订单记录，事务组 `order_tx`
3. **update_status** (sql) - 更新订单状态为 confirmed，事务组 `order_tx`
4. **send_notification** (http, 异步) - 发送通知，带重试（指数退避，最多3次）
5. **log_success** (script) - 记录成功日志

**特点**：
- ✅ 事务保证：步骤2和3在同一事务中，要么全成功，要么全回滚
- ✅ 异步通知：步骤4异步执行，不阻塞主流程
- ✅ 重试机制：网络超时自动重试，指数退避策略

**测试命令**：

```bash
# 成功场景
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": 123,
    "amount": 299.99
  }'

# 失败场景 - 缺少 user_id
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 299.99
  }'

# 失败场景 - 金额为负
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": 123,
    "amount": -10
  }'
```

**预期结果**：
- 成功时：返回订单ID，数据库中有两条记录（orders表），通知异步发送
- 失败时：抛出错误，数据库无记录（事务回滚）

**查看执行日志**：
访问 http://localhost:3001/workflow-logs，查看详细执行情况。

---

### Demo 2: HTTP API 调用重试

**接口编码**: `demo_api_call_with_retry`  
**类别**: 外部集成

**功能**：演示 HTTP 调用的重试机制，应对网络故障和超时。

**步骤**：
1. **call_external_api** (http) - 调用 httpbin.org/delay/2（模拟慢接口）
   - 超时：5秒
   - 重试：最多5次
   - 退避策略：指数退避（500ms 起始）
   - 重试条件：timeout、network_error、server_error
2. **process_response** (script) - 处理API响应

**特点**：
- ✅ 自动重试：超时或网络错误自动重试
- ✅ 指数退避：500ms、1s、2s、4s、8s
- ✅ 智能判断：根据错误类型决定是否重试

**测试命令**：

```bash
# 正常调用（约2秒返回）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_api_call_with_retry' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**测试重试场景**：

修改工作流配置，将超时改为 1 秒，这样会触发超时重试：

```json
{
  "id": "call_external_api",
  "http_config": {
    "timeout": 1000  // 改为1秒，必然超时
  }
}
```

**预期结果**：
- 正常：2秒左右返回成功
- 超时重试：多次重试后可能成功或最终失败

**监控**：
- 执行日志：http://localhost:3001/workflow-logs
- 查看重试次数和耗时

---

### Demo 3: 异步任务处理

**接口编码**: `demo_async_tasks`  
**类别**: 后台任务

**功能**：演示异步任务并发执行，主流程快速返回。

**步骤**：
1. **main_task** (script) - 主任务处理
2. **async_email** (http, 异步) - 发送邮件（3秒延迟）
3. **async_sms** (http, 异步) - 发送短信（2秒延迟）
4. **async_log** (http, 异步) - 记录日志
5. **return_result** (script) - 返回结果

**特点**：
- ✅ 快速返回：主流程不等待后台任务
- ✅ 并发执行：3个异步任务同时执行
- ✅ 资源控制：受执行器并发限制（默认20）

**测试命令**：

```bash
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_async_tasks' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**预期结果**：
- 立即返回（< 1秒）：`{"status": "success", "message": "任务已提交，后台处理中"}`
- 后台任务：3个异步任务在后台运行 2-3 秒

**监控异步任务**：
访问 http://localhost:3001/async-tasks，实时查看：
- 运行中的任务列表
- 任务进度和状态
- 执行器使用率

**开启自动刷新**（每5秒）：
点击「自动刷新」开关，实时监控任务完成情况。

---

### Demo 4: 条件分支处理

**接口编码**: `demo_conditional_flow`  
**类别**: 流程控制

**功能**：演示根据条件选择不同的执行路径。

**步骤**：
1. **check_amount** (condition) - 检查金额是否 > 1000
   - **then**: 执行 `high_amount_process`（大额处理）
   - **else**: 执行 `normal_process`（普通处理）
2. **high_amount_process** (script) - 大额订单需要审核
3. **normal_process** (script) - 普通订单直接处理

**特点**：
- ✅ 动态分支：根据输入参数选择路径
- ✅ 表达式求值：支持复杂条件判断
- ✅ 变量传递：分支间共享上下文

**测试命令**：

```bash
# 大额订单（> 1000）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_conditional_flow' \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 1500
  }'

# 普通订单（<= 1000）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_conditional_flow' \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 500
  }'
```

**预期结果**：
- 大额：`needs_approval = true`，日志显示"大额订单，需要审核"
- 普通：`needs_approval = false`，日志显示"普通订单，直接处理"

**查看分支选择**：
在执行日志的时间线视图中，可以看到不同的执行路径。

---

### Demo 5: 延迟执行

**接口编码**: `demo_delay_workflow`  
**类别**: 定时任务

**功能**：演示延迟步骤和定时任务。

**步骤**：
1. **start_task** (script) - 记录开始时间
2. **wait_5_seconds** (delay) - 等待 5 秒
3. **check_status** (http) - 检查状态
4. **complete_task** (script) - 记录结束时间

**特点**：
- ✅ 延迟执行：指定时长等待
- ✅ 时间控制：秒/分/小时/天
- ✅ 定时任务：配合触发器实现定时

**测试命令**：

```bash
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_delay_workflow' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**预期结果**：
- 总耗时约 5-7 秒
- 步骤2耗时约5秒（delay）
- 步骤3耗时约2秒（HTTP请求）

**使用场景**：
- 订单超时自动取消（30分钟后执行）
- 定时发送提醒（每天9点）
- 轮询等待外部系统（每10秒检查一次）

---

## 前端界面使用

### 1. 工作流设计器

**访问**: http://localhost:3001/workflow-designer

**功能**：
- 可视化设计工作流
- 拖拽添加步骤
- 配置步骤属性
- 设置高级选项（异步、重试、输出）
- 导出/导入 JSON

**操作**：
1. 从左侧面板拖拽步骤到画布
2. 点击步骤，在右侧编辑属性
3. 点击「查看JSON」查看完整配置
4. 复制 JSON 到数据接口的 `workflow_json` 字段

### 2. 工作流执行日志

**访问**: http://localhost:3001/workflow-logs

**功能**：
- 查看所有执行记录
- 按接口编码、状态筛选
- 查看统计数据（成功率、平均耗时）
- 查看详细步骤日志
- 时间线视图
- 失败重试

**操作**：
1. 筛选特定接口的执行记录
2. 点击「详情」查看步骤日志
3. 点击「时间线」查看可视化流程
4. 失败记录可点击「重试」

### 3. 异步任务监控

**访问**: http://localhost:3001/async-tasks

**功能**：
- 实时查看运行中的异步任务
- 监控执行器使用率
- 查看任务进度和状态
- 清理已完成任务

**操作**：
1. 开启「自动刷新」实时监控
2. 查看运行中任务列表
3. 点击「详情」查看任务输出
4. 查看「执行器统计」了解资源使用

**使用率颜色**：
- 🟢 绿色：< 70%（正常）
- 🟡 黄色：70-90%（较高）
- 🔴 红色：> 90%（接近饱和）

### 4. 死信队列管理

**访问**: http://localhost:3001/deadletter-queue

**功能**：
- 查看补偿失败的记录
- 手动重试补偿
- 标记为已处理
- 清理历史记录

**操作**：
1. 查看待处理的死信
2. 点击「详情」查看补偿SQL和错误
3. 点击「重试」再次执行补偿
4. 或点击「标记已处理」手动解决
5. 定期「清理已处理记录」

---

## 测试场景

### 场景 1: 正常流程

```bash
# 1. 创建订单
REQUEST_ID=$(curl -s -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": 123, "amount": 299.99}' | jq -r '.request_id')

echo "请求ID: $REQUEST_ID"

# 2. 查看执行日志（等待2秒后查询）
sleep 2
curl -s "http://localhost:8080/api/data-stack/workflow-executions?interface_code=demo_create_order" | jq '.'
```

### 场景 2: 参数验证失败

```bash
# 缺少必填参数
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
  -H 'Content-Type: application/json' \
  -d '{"amount": 299.99}'

# 预期：返回错误，步骤1失败，事务回滚
```

### 场景 3: 异步任务并发

```bash
# 连续提交3个异步任务工作流
for i in {1..3}; do
  curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_async_tasks' \
    -H 'Content-Type: application/json' \
    -d '{}' &
done
wait

# 立即查看异步任务列表（应该看到多个运行中的任务）
curl -s 'http://localhost:8080/api/data-stack/async-tasks' | jq '.'
```

### 场景 4: 重试机制

```bash
# 调用会超时重试的接口
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_api_call_with_retry' \
  -H 'Content-Type: application/json' \
  -d '{}'

# 在执行日志中查看重试次数和退避延迟
```

### 场景 5: 条件分支

```bash
# 测试两种分支路径
echo "=== 大额订单 ==="
curl -s -X POST 'http://localhost:8080/api/open/v1/exec/demo_conditional_flow' \
  -H 'Content-Type: application/json' \
  -d '{"amount": 1500}' | jq '.variables'

echo "=== 普通订单 ==="
curl -s -X POST 'http://localhost:8080/api/open/v1/exec/demo_conditional_flow' \
  -H 'Content-Type: application/json' \
  -d '{"amount": 500}' | jq '.variables'
```

---

## 高级测试

### 模拟补偿失败（进入死信队列）

1. **关闭 MySQL**（如果在测试 SQL 工作流）
2. **执行订单创建**：
   ```bash
   curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
     -H 'Content-Type: application/json' \
     -d '{"user_id": 123, "amount": 299.99}'
   ```
3. **查看死信队列**：http://localhost:3001/deadletter-queue
4. **重启 MySQL**
5. **重试死信**：点击「重试」按钮

### 压力测试异步任务

```bash
# 提交100个异步任务工作流
for i in {1..100}; do
  curl -s -X POST 'http://localhost:8080/api/open/v1/exec/demo_async_tasks' \
    -H 'Content-Type: application/json' \
    -d '{}' > /dev/null &
done
wait

# 查看执行器统计
curl -s 'http://localhost:8080/api/data-stack/async-tasks/stats' | jq '.'
```

预期：
- 最多 20 个任务并发运行（默认并发数）
- 其他任务排队等待
- 使用率达到 100%

### 测试延迟精度

```bash
# 记录开始时间
START=$(date +%s)

# 执行延迟工作流
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_delay_workflow' \
  -H 'Content-Type: application/json' \
  -d '{}'

# 记录结束时间
END=$(date +%s)
DURATION=$((END - START))

echo "实际耗时: ${DURATION} 秒（预期: 5-7秒）"
```

---

## 故障排查

### 问题 1: 脚本执行失败

**症状**：`./init-workflow-demo.sh` 报错

**检查**：
1. 服务器是否启动：`curl http://localhost:8080/api/health`
2. 登录凭证是否正确
3. 数据源配置是否正确（MySQL DSN）

**解决**：
- 跳过数据源创建，手动在前端创建
- 或只测试不依赖 SQL 的工作流

### 问题 2: SQL 步骤失败

**症状**：订单创建失败，报数据库错误

**检查**：
1. MySQL 是否运行
2. 数据库 `demo` 是否存在
3. 表 `orders` 是否创建
4. DSN 是否正确
5. 数据源在前端是否配置

**解决**：
```bash
# 检查 MySQL 连接
mysql -h localhost -u root -p -e "SHOW DATABASES;"

# 检查表结构
mysql -h localhost -u root -p demo -e "SHOW TABLES;"
```

### 问题 3: 异步任务不执行

**症状**：异步任务一直显示"等待中"

**检查**：
1. 异步执行器是否启动（服务器日志）
2. 是否达到并发上限

**解决**：
- 等待其他任务完成
- 增大并发数配置（代码中 `maxConcurrent`）

### 问题 4: 前端界面空白

**症状**：访问前端页面无数据

**检查**：
1. 是否执行过工作流
2. 筛选条件是否正确
3. 后端 API 是否正常

**解决**：
```bash
# 测试 API
curl 'http://localhost:8080/api/data-stack/workflow-executions'
```

---

## 清理 Demo 数据

### 清理工作流定义

```bash
# 获取 token
TOKEN=$(curl -s -X POST 'http://localhost:8080/api/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 删除 Demo 工作流
for code in demo_create_order demo_api_call_with_retry demo_async_tasks demo_conditional_flow demo_delay_workflow; do
  IFACE_ID=$(curl -s "http://localhost:8080/api/data/interfaces?code=$code" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
  
  if [ "$IFACE_ID" != "null" ]; then
    curl -X DELETE "http://localhost:8080/api/data/interfaces/$IFACE_ID" \
      -H "Authorization: Bearer $TOKEN"
    echo "已删除: $code"
  fi
done
```

### 清理执行日志

通过前端「死信队列管理」页面：
- 点击「清理已处理记录」
- 选择保留天数：0 天
- 清理所有历史记录

或通过 SQL（SQLite）：

```sql
DELETE FROM workflow_executions;
DELETE FROM workflow_step_logs;
DELETE FROM compensation_deadletters;
DELETE FROM async_task_results;
```

### 清理测试数据库

```sql
DROP DATABASE demo;
```

---

## 下一步

完成 Demo 测试后，可以：

1. **自定义工作流**：基于 Demo 修改，创建自己的业务流程
2. **集成到项目**：将工作流集成到实际应用
3. **添加触发器**：配置定时任务、Webhook 触发
4. **监控告警**：设置失败通知和监控面板
5. **性能优化**：调整并发数、超时时间

## 参考文档

- [工作流设计器使用指南](./workflow-frontend-guide.md)
- [工作流重试机制](./workflow-retry-mechanism.md)
- [工作流异步执行](./workflow-async-execution.md)
- [前端实施总结](./workflow-frontend-implementation-summary.md)

---

**Demo 版本**: 1.0  
**创建日期**: 2026-07-02  
**适用版本**: 工作流引擎 v1.0+
