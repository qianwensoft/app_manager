#!/bin/bash

# 工单分享链接认证模式测试脚本

BASE_URL="http://localhost:8080"
TOKEN=""  # 需要替换为实际的 JWT token

echo "=== 工单分享链接认证模式功能测试 ==="
echo ""

# 1. 创建免登录分享链接
echo "1. 创建免登录分享链接"
PUBLIC_SHARE=$(curl -s -X POST "$BASE_URL/api/work-order-reports/shares" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试免登录分享",
    "filters": {
      "status": "open"
    },
    "expires_in": 168,
    "auth_mode": "public"
  }')
echo "Response: $PUBLIC_SHARE"
PUBLIC_TOKEN=$(echo $PUBLIC_SHARE | jq -r '.data.token')
echo "Public Share Token: $PUBLIC_TOKEN"
echo ""

# 2. 创建需登录分享链接
echo "2. 创建需登录分享链接"
LOGIN_SHARE=$(curl -s -X POST "$BASE_URL/api/work-order-reports/shares" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试需登录分享",
    "filters": {
      "status": "open"
    },
    "expires_in": 168,
    "auth_mode": "login",
    "permissions": {
      "can_view": true,
      "can_comment": true,
      "can_update_status": true,
      "can_update_fields": false
    }
  }')
echo "Response: $LOGIN_SHARE"
LOGIN_TOKEN=$(echo $LOGIN_SHARE | jq -r '.data.token')
echo "Login Share Token: $LOGIN_TOKEN"
echo ""

# 3. 免登录访问公开分享链接
echo "3. 免登录访问公开分享链接"
curl -s "$BASE_URL/api/share/work-order-reports/$PUBLIC_TOKEN" | jq '.'
echo ""

# 4. 免登录访问需登录分享链接（应该能获取基本信息但标记需要登录）
echo "4. 免登录访问需登录分享链接"
curl -s "$BASE_URL/api/share/work-order-reports/$LOGIN_TOKEN" | jq '.'
echo ""

# 5. 免登录访问需登录分享的工单列表（应该返回401）
echo "5. 免登录访问需登录分享的工单列表（预期401）"
curl -s "$BASE_URL/api/share/work-order-reports/$LOGIN_TOKEN/work-orders" | jq '.'
echo ""

# 6. 已登录访问需登录分享的工单列表（应该成功）
echo "6. 已登录访问需登录分享的工单列表"
curl -s "$BASE_URL/api/share/work-order-reports/$LOGIN_TOKEN/work-orders" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 7. 测试工单评论（需登录模式）
echo "7. 测试工单评论（需登录模式）"
curl -s -X POST "$BASE_URL/api/share/work-order-reports/$LOGIN_TOKEN/work-orders/1/comment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "comment": "通过分享链接添加的评论"
  }' | jq '.'
echo ""

echo "测试完成！"
