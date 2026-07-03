#!/bin/bash

# 工作流引擎 Demo 初始化脚本
# 用途：创建演示用的数据源、数据集、数据接口和工作流

set -e

API_BASE="http://localhost:8080/api"
TOKEN=""

echo "======================================"
echo "工作流引擎 Demo 初始化"
echo "======================================"
echo ""

# 检查服务器是否运行
echo "1. 检查服务器状态..."
if ! curl -s "$API_BASE/health" > /dev/null 2>&1; then
    echo "错误: 服务器未启动，请先启动服务器"
    echo "运行: cd server && go run ."
    exit 1
fi
echo "✓ 服务器运行正常"
echo ""

# 获取 Token
echo "2. 获取访问令牌..."
read -p "请输入用户名 [admin]: " USERNAME
USERNAME=${USERNAME:-admin}
read -sp "请输入密码 [admin123]: " PASSWORD
PASSWORD=${PASSWORD:-admin123}
echo ""

LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "错误: 登录失败"
    echo "响应: $LOGIN_RESPONSE"
    exit 1
fi
echo "✓ 登录成功"
echo ""

# 创建数据源
echo "3. 创建 Demo 数据源..."
DS_RESPONSE=$(curl -s -X POST "$API_BASE/data/sources" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "demo_mysql",
    "name": "Demo MySQL 数据库",
    "type": "mysql",
    "dsn": "root:password@tcp(localhost:3306)/demo?charset=utf8mb4&parseTime=True&loc=Local",
    "read_only": false,
    "config_json": "{\"pool_max_open\":10,\"pool_max_idle\":5,\"pool_conn_max_lifetime_sec\":3600}"
  }')

DS_ID=$(echo $DS_RESPONSE | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
if [ -z "$DS_ID" ]; then
    echo "提示: 数据源可能已存在，继续..."
    # 尝试获取现有数据源
    DS_LIST=$(curl -s -X GET "$API_BASE/data/sources" -H "Authorization: Bearer $TOKEN")
    DS_ID=$(echo $DS_LIST | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
fi
echo "✓ 数据源 ID: $DS_ID"
echo ""

# 创建工作流1: 简单的订单处理流程
echo "4. 创建工作流: 订单处理流程..."
curl -s -X POST "$API_BASE/data/interfaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "demo_create_order",
    "name": "Demo: 创建订单",
    "slug": "demo-create-order",
    "kind": "workflow",
    "category": "订单管理",
    "workflow_json": "{\"version\":\"1.0\",\"description\":\"演示订单创建流程\",\"steps\":[{\"id\":\"validate_params\",\"type\":\"script\",\"label\":\"验证参数\",\"engine\":\"javascript\",\"code\":\"if (!getVariable('request').user_id) { throw new Error('缺少 user_id'); } if (!getVariable('request').amount || getVariable('request').amount <= 0) { throw new Error('金额必须大于0'); } setVariable('validated', true);\"},{\"id\":\"create_order\",\"type\":\"sql\",\"label\":\"创建订单\",\"datasource\":\"demo_mysql\",\"sql\":\"INSERT INTO orders (user_id, amount, status, created_at) VALUES (:request.user_id, :request.amount, 'pending', NOW())\",\"transaction_group\":\"order_tx\",\"output\":{\"order_id\":\"{{last_insert_id}}\"}},{\"id\":\"update_status\",\"type\":\"sql\",\"label\":\"更新订单状态\",\"datasource\":\"demo_mysql\",\"sql\":\"UPDATE orders SET status = 'confirmed' WHERE id = :variables.order_id\",\"transaction_group\":\"order_tx\"},{\"id\":\"send_notification\",\"type\":\"http\",\"label\":\"发送通知\",\"async\":true,\"http_config\":{\"method\":\"POST\",\"url\":\"https://httpbin.org/post\",\"body\":{\"order_id\":\"{{variables.order_id}}\",\"user_id\":\"{{request.user_id}}\",\"message\":\"订单已创建\"},\"timeout\":30000},\"on_error\":\"retry\",\"max_retries\":3,\"retry_backoff\":\"exponential\",\"retry_interval\":[1000],\"retry_on\":[\"timeout\",\"network_error\"]},{\"id\":\"log_success\",\"type\":\"script\",\"label\":\"记录成功日志\",\"engine\":\"javascript\",\"code\":\"log('订单创建成功: ' + getVariable('order_id')); setVariable('success', true);\"}],\"transactions\":{\"order_tx\":{\"datasource\":\"demo_mysql\",\"isolation\":\"read_committed\",\"steps\":[\"create_order\",\"update_status\"]}}}",
    "datasources_json": "{\"demo_mysql\":{\"data_source_id\":" + DS_ID + "}}"
  }' > /dev/null

echo "✓ 订单处理流程已创建"
echo ""

# 创建工作流2: 带重试的HTTP调用
echo "5. 创建工作流: HTTP API 调用（带重试）..."
curl -s -X POST "$API_BASE/data/interfaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "demo_api_call_with_retry",
    "name": "Demo: API调用重试",
    "slug": "demo-api-retry",
    "kind": "workflow",
    "category": "外部集成",
    "workflow_json": "{\"version\":\"1.0\",\"description\":\"演示HTTP调用重试机制\",\"steps\":[{\"id\":\"call_external_api\",\"type\":\"http\",\"label\":\"调用外部API\",\"http_config\":{\"method\":\"GET\",\"url\":\"https://httpbin.org/delay/2\",\"timeout\":5000},\"on_error\":\"retry\",\"max_retries\":5,\"retry_backoff\":\"exponential\",\"retry_interval\":[500],\"retry_on\":[\"timeout\",\"network_error\",\"server_error\"],\"output\":{\"api_response\":\"{{response}}\"}},{\"id\":\"process_response\",\"type\":\"script\",\"label\":\"处理响应\",\"engine\":\"javascript\",\"code\":\"var response = getVariable('api_response'); log('API 响应: ' + JSON.stringify(response)); setVariable('processed', true);\"}]}",
    "datasources_json": "{}"
  }' > /dev/null

echo "✓ API重试流程已创建"
echo ""

# 创建工作流3: 异步任务处理
echo "6. 创建工作流: 异步任务处理..."
curl -s -X POST "$API_BASE/data/interfaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "demo_async_tasks",
    "name": "Demo: 异步任务",
    "slug": "demo-async",
    "kind": "workflow",
    "category": "后台任务",
    "workflow_json": "{\"version\":\"1.0\",\"description\":\"演示异步任务执行\",\"steps\":[{\"id\":\"main_task\",\"type\":\"script\",\"label\":\"主任务\",\"engine\":\"javascript\",\"code\":\"log('执行主任务'); setVariable('main_result', 'completed'); log('主任务完成');\"},{\"id\":\"async_email\",\"type\":\"http\",\"label\":\"发送邮件\",\"async\":true,\"http_config\":{\"method\":\"POST\",\"url\":\"https://httpbin.org/delay/3\",\"body\":{\"to\":\"user@example.com\",\"subject\":\"任务完成通知\"},\"timeout\":30000}},{\"id\":\"async_sms\",\"type\":\"http\",\"label\":\"发送短信\",\"async\":true,\"http_config\":{\"method\":\"POST\",\"url\":\"https://httpbin.org/delay/2\",\"body\":{\"phone\":\"13800138000\",\"message\":\"任务已完成\"},\"timeout\":30000}},{\"id\":\"async_log\",\"type\":\"http\",\"label\":\"记录日志\",\"async\":true,\"http_config\":{\"method\":\"POST\",\"url\":\"https://httpbin.org/post\",\"body\":{\"level\":\"info\",\"message\":\"任务执行完成\"},\"timeout\":30000}},{\"id\":\"return_result\",\"type\":\"script\",\"label\":\"返回结果\",\"engine\":\"javascript\",\"code\":\"setVariable('result', {status: 'success', message: '任务已提交，后台处理中'});\"}]}",
    "datasources_json": "{}"
  }' > /dev/null

echo "✓ 异步任务流程已创建"
echo ""

# 创建工作流4: 条件分支和循环
echo "7. 创建工作流: 条件分支处理..."
curl -s -X POST "$API_BASE/data/interfaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "demo_conditional_flow",
    "name": "Demo: 条件分支",
    "slug": "demo-condition",
    "kind": "workflow",
    "category": "流程控制",
    "workflow_json": "{\"version\":\"1.0\",\"description\":\"演示条件分支\",\"steps\":[{\"id\":\"check_amount\",\"type\":\"condition\",\"label\":\"检查金额\",\"expression\":\"get(request, 'amount') > 1000\",\"then\":[\"high_amount_process\"],\"else\":[\"normal_process\"]},{\"id\":\"high_amount_process\",\"type\":\"script\",\"label\":\"大额处理\",\"engine\":\"javascript\",\"code\":\"log('大额订单，需要审核'); setVariable('needs_approval', true);\"},{\"id\":\"normal_process\",\"type\":\"script\",\"label\":\"普通处理\",\"engine\":\"javascript\",\"code\":\"log('普通订单，直接处理'); setVariable('needs_approval', false);\"}]}",
    "datasources_json": "{}"
  }' > /dev/null

echo "✓ 条件分支流程已创建"
echo ""

# 创建工作流5: 延迟和超时
echo "8. 创建工作流: 延迟执行..."
curl -s -X POST "$API_BASE/data/interfaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "demo_delay_workflow",
    "name": "Demo: 延迟执行",
    "slug": "demo-delay",
    "kind": "workflow",
    "category": "定时任务",
    "workflow_json": "{\"version\":\"1.0\",\"description\":\"演示延迟执行\",\"steps\":[{\"id\":\"start_task\",\"type\":\"script\",\"label\":\"开始任务\",\"engine\":\"javascript\",\"code\":\"log('任务开始'); setVariable('start_time', new Date().toISOString());\"},{\"id\":\"wait_5_seconds\",\"type\":\"delay\",\"label\":\"等待5秒\",\"delay_config\":{\"duration\":5,\"unit\":\"seconds\"}},{\"id\":\"check_status\",\"type\":\"http\",\"label\":\"检查状态\",\"http_config\":{\"method\":\"GET\",\"url\":\"https://httpbin.org/get\",\"timeout\":10000}},{\"id\":\"complete_task\",\"type\":\"script\",\"label\":\"完成任务\",\"engine\":\"javascript\",\"code\":\"log('任务完成'); setVariable('end_time', new Date().toISOString());\"}]}",
    "datasources_json": "{}"
  }' > /dev/null

echo "✓ 延迟执行流程已创建"
echo ""

echo "======================================"
echo "Demo 初始化完成！"
echo "======================================"
echo ""
echo "已创建的工作流接口："
echo "1. demo_create_order - 订单处理流程（带事务和异步通知）"
echo "2. demo_api_call_with_retry - HTTP调用重试"
echo "3. demo_async_tasks - 异步任务处理"
echo "4. demo_conditional_flow - 条件分支"
echo "5. demo_delay_workflow - 延迟执行"
echo ""
echo "测试命令："
echo ""
echo "# 1. 创建订单"
echo "curl -X POST '$API_BASE/open/v1/exec/demo_create_order' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"user_id\": 123, \"amount\": 299.99}'"
echo ""
echo "# 2. API重试测试"
echo "curl -X POST '$API_BASE/open/v1/exec/demo_api_call_with_retry' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{}'"
echo ""
echo "# 3. 异步任务"
echo "curl -X POST '$API_BASE/open/v1/exec/demo_async_tasks' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{}'"
echo ""
echo "# 4. 条件分支（大额）"
echo "curl -X POST '$API_BASE/open/v1/exec/demo_conditional_flow' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"amount\": 1500}'"
echo ""
echo "# 5. 延迟执行"
echo "curl -X POST '$API_BASE/open/v1/exec/demo_delay_workflow' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{}'"
echo ""
echo "前端访问："
echo "- 工作流设计器: http://localhost:3001/workflow-designer"
echo "- 执行日志: http://localhost:3001/workflow-logs"
echo "- 异步任务: http://localhost:3001/async-tasks"
echo "- 死信队列: http://localhost:3001/deadletter-queue"
echo ""
