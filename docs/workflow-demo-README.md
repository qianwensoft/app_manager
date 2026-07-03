# 工作流引擎 Demo 应用

快速体验工作流引擎的所有核心功能。

## 🚀 快速开始

### 1. 启动服务

```bash
# 启动后端（终端1）
cd server
go run . config.sqlite.yaml

# 启动前端（终端2）
cd web
npm run dev
```

### 2. 准备数据库（可选）

如果要测试 SQL 相关功能：

```bash
# 导入测试数据库
mysql -u root -p < scripts/init-demo-database.sql
```

如果不需要测试 SQL，可以跳过此步骤。

### 3. 初始化 Demo 工作流

```bash
./scripts/init-workflow-demo.sh
```

按提示输入登录凭证（默认 `admin / admin123`），脚本会自动创建 5 个演示工作流。

### 4. 开始测试

访问前端界面：http://localhost:3001

## 📋 Demo 工作流列表

| 编码 | 名称 | 类别 | 演示功能 |
|------|------|------|----------|
| `demo_create_order` | 订单处理流程 | 订单管理 | SQL事务、异步通知、重试 |
| `demo_api_call_with_retry` | API调用重试 | 外部集成 | HTTP重试、指数退避 |
| `demo_async_tasks` | 异步任务 | 后台任务 | 异步执行、并发控制 |
| `demo_conditional_flow` | 条件分支 | 流程控制 | 条件判断、动态路径 |
| `demo_delay_workflow` | 延迟执行 | 定时任务 | 延迟步骤、时间控制 |

## 🧪 快速测试

```bash
# 1. 创建订单（带事务和异步通知）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_create_order' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": 123, "amount": 299.99}'

# 2. API重试测试
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_api_call_with_retry' \
  -H 'Content-Type: application/json' \
  -d '{}'

# 3. 异步任务（快速返回，后台处理）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_async_tasks' \
  -H 'Content-Type: application/json' \
  -d '{}'

# 4. 条件分支（大额订单）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_conditional_flow' \
  -H 'Content-Type: application/json' \
  -d '{"amount": 1500}'

# 5. 延迟执行（等待5秒）
curl -X POST 'http://localhost:8080/api/open/v1/exec/demo_delay_workflow' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## 🖥️ 前端界面

| 界面 | 地址 | 功能 |
|------|------|------|
| 工作流设计器 | http://localhost:3001/workflow-designer | 可视化设计工作流 |
| 执行日志 | http://localhost:3001/workflow-logs | 查看执行记录和详情 |
| 异步任务监控 | http://localhost:3001/async-tasks | 实时监控异步任务 |
| 死信队列管理 | http://localhost:3001/deadletter-queue | 处理补偿失败 |

## 📖 详细文档

完整使用指南和测试场景请查看：

👉 [工作流引擎 Demo 应用指南](./workflow-demo-guide.md)

包含内容：
- ✅ 每个 Demo 的详细说明
- ✅ 测试命令和预期结果
- ✅ 前端界面使用方法
- ✅ 高级测试场景
- ✅ 故障排查指南
- ✅ 清理数据方法

## 🎯 核心特性演示

### 事务管理
`demo_create_order` 演示了多步骤 SQL 操作的原子性，任何步骤失败都会自动回滚。

### 重试机制
`demo_api_call_with_retry` 展示了智能重试策略，包括指数退避和错误类型判断。

### 异步执行
`demo_async_tasks` 演示了异步任务的并发执行和资源控制，主流程快速返回。

### 条件分支
`demo_conditional_flow` 展示了根据输入动态选择执行路径的能力。

### 延迟控制
`demo_delay_workflow` 演示了延迟步骤和时间控制功能。

## 🧹 清理

```bash
# 查看清理说明
grep -A 20 "清理 Demo 数据" docs/workflow-demo-guide.md
```

## 📚 相关文档

- [工作流前端使用指南](./workflow-frontend-guide.md)
- [重试机制详解](./workflow-retry-mechanism.md)
- [异步执行详解](./workflow-async-execution.md)
- [前端实施总结](./workflow-frontend-implementation-summary.md)

## ❓ 问题排查

遇到问题？查看详细的故障排查指南：

```bash
# 检查服务器状态
curl http://localhost:8080/api/health

# 查看后端日志
cd server && go run .

# 查看前端控制台
浏览器按 F12 查看控制台错误
```

---

**Demo 版本**: 1.0  
**创建日期**: 2026-07-02  
**维护**: 工作流引擎团队
