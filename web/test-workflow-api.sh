#!/bin/bash

# 测试工作流 API 调用
echo "=== 测试工作流执行 API ==="

# 1. 先登录获取 token
echo "1. 登录获取 token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功，token: ${TOKEN:0:20}..."

# 2. 获取工作流列表
echo ""
echo "2. 获取工作流列表..."
WORKFLOWS=$(curl -s -X GET http://localhost:8080/api/work-orders/workflows \
  -H "Authorization: Bearer $TOKEN")

echo "工作流列表: $WORKFLOWS" | head -c 200
echo ""

WORKFLOW_ID=$(echo $WORKFLOWS | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo "使用工作流 ID: $WORKFLOW_ID"

# 3. 获取一个工单
echo ""
echo "3. 获取工单列表..."
WORKORDERS=$(curl -s -X GET "http://localhost:8080/api/work-orders?limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "工单列表: $WORKORDERS" | head -c 200
echo ""

WORKORDER_ID=$(echo $WORKORDERS | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo "使用工单 ID: $WORKORDER_ID"

# 4. 执行测试
if [ -z "$WORKFLOW_ID" ] || [ -z "$WORKORDER_ID" ]; then
  echo "❌ 缺少工作流或工单 ID"
  exit 1
fi

echo ""
echo "4. 执行工作流测试..."
echo "请求: POST /api/work-orders/workflows/$WORKFLOW_ID/test"
echo "Body: {\"work_order_id\":$WORKORDER_ID,\"event\":\"work_order.test\"}"

TEST_RESPONSE=$(curl -s -X POST "http://localhost:8080/api/work-orders/workflows/$WORKFLOW_ID/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"work_order_id\":$WORKORDER_ID,\"event\":\"work_order.test\"}")

echo "响应: $TEST_RESPONSE"

# 5. 等待一下，然后查询日志
echo ""
echo "5. 等待 2 秒后查询日志..."
sleep 2

LOGS=$(curl -s -X GET "http://localhost:8080/api/work-orders/workflow-logs?workflow_id=$WORKFLOW_ID&work_order_id=$WORKORDER_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "日志查询结果:"
echo "$LOGS" | head -c 500
echo ""

# 检查是否有日志
LOG_COUNT=$(echo "$LOGS" | grep -o '"total":[0-9]*' | cut -d':' -f2)
echo ""
echo "找到 $LOG_COUNT 条日志"

if [ "$LOG_COUNT" -gt 0 ]; then
  echo "✅ 测试成功，日志已创建"
else
  echo "❌ 测试失败，没有找到日志"
  echo ""
  echo "检查数据库中最新的日志..."
  sqlite3 /Volumes/data/workspace/qianwen/app-manager/server/data/app-manager.db \
    "SELECT id, workflow_id, work_order_id, event, status FROM work_order_workflow_logs ORDER BY id DESC LIMIT 3;"
fi
