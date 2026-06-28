#!/bin/bash

# 第三方平台 SSO 测试脚本

# 配置
BASE_URL="http://localhost:8080"
FREEPASS_URL="http://27.195.159.118:20600"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "第三方平台 SSO 测试脚本"
echo "=========================================="

# 1. 获取 admin token
echo -e "\n${YELLOW}步骤 1: 登录获取 admin token${NC}"
ADMIN_TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  | jq -r '.token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo -e "${RED}✗ 登录失败${NC}"
  exit 1
fi
echo -e "${GREEN}✓ 登录成功${NC}"
echo "Admin Token: ${ADMIN_TOKEN:0:20}..."

# 2. 创建外部应用（用于 token 管理）
echo -e "\n${YELLOW}步骤 2: 创建外部应用（token 管理）${NC}"
OUTBOUND_APP_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/outbound/apps" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "FreePass API",
    "description": "FreePass 平台 API 集成",
    "base_url": "'"${FREEPASS_URL}"'",
    "auth_type": "dynamic_bearer",
    "token_provider_json": "{\"fetch\":{\"url\":\"'"${FREEPASS_URL}"'/oauth2/access_token\",\"method\":\"POST\",\"body\":\"{\\\"app_key\\\":\\\"{{app.app_key}}\\\",\\\"app_secret\\\":\\\"{{app.app_secret}}\\\",\\\"grant_type\\\":\\\"client_credentials\\\"}\"},\"paths\":{\"access_token\":\"accessToken\",\"expires_in\":\"expires_in\",\"refresh_token\":\"refreshToken\"},\"skew_seconds\":60}",
    "app_params_json": "[{\"key\":\"app_key\",\"value\":\"YOUR_APP_KEY\",\"sensitive\":false},{\"key\":\"app_secret\",\"value\":\"YOUR_APP_SECRET\",\"sensitive\":true}]"
  }')

OUTBOUND_APP_ID=$(echo "$OUTBOUND_APP_RESPONSE" | jq -r '.id // .data.id')

if [ -z "$OUTBOUND_APP_ID" ] || [ "$OUTBOUND_APP_ID" == "null" ]; then
  echo -e "${RED}✗ 创建外部应用失败${NC}"
  echo "$OUTBOUND_APP_RESPONSE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✓ 创建外部应用成功${NC}"
echo "Outbound App ID: ${OUTBOUND_APP_ID}"

# 3. 创建第三方平台
echo -e "\n${YELLOW}步骤 3: 创建第三方平台${NC}"
PROVIDER_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/thirdparty" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "FreePass 测试平台",
    "type": "freepass",
    "description": "FreePass 单点登录测试",
    "open_api_origin": "'"${FREEPASS_URL}"'",
    "corp_id": "YOUR_CORP_ID",
    "app_key": "YOUR_APP_KEY",
    "app_secret": "YOUR_APP_SECRET",
    "outbound_app_id": '"${OUTBOUND_APP_ID}"',
    "user_sync_enabled": true,
    "user_info_endpoint": "/api/v1/user/info",
    "user_list_endpoint": "/api/v1/user/list",
    "role_mapping_json": "{\"admin\":\"admin\",\"manager\":\"operator\",\"user\":\"viewer\"}",
    "default_role": "viewer",
    "enabled": true
  }')

PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | jq -r '.id')

if [ -z "$PROVIDER_ID" ] || [ "$PROVIDER_ID" == "null" ]; then
  echo -e "${RED}✗ 创建第三方平台失败${NC}"
  echo "$PROVIDER_RESPONSE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✓ 创建第三方平台成功${NC}"
echo "Provider ID: ${PROVIDER_ID}"

# 4. 测试 Token 获取
echo -e "\n${YELLOW}步骤 4: 测试外部应用 token 获取${NC}"
echo -e "${YELLOW}注意：此步骤需要正确的 app_key 和 app_secret${NC}"
echo "跳过自动测试，请手动验证..."

# 5. 模拟 SSO 登录测试
echo -e "\n${YELLOW}步骤 5: SSO 登录测试${NC}"
echo -e "${YELLOW}注意：需要真实的 access_token${NC}"
echo ""
echo "请按以下步骤测试："
echo ""
echo "1. 获取 FreePass access_token："
echo "   - 访问 FreePass 平台获取授权"
echo "   - 或使用 FreePass 提供的测试 token"
echo ""
echo "2. 使用 access_token 登录："
cat << EOF
   curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
     -H "Content-Type: application/json" \\
     -d '{
       "provider_id": ${PROVIDER_ID},
       "access_token": "YOUR_FREEPASS_ACCESS_TOKEN"
     }'
EOF
echo ""
echo "3. 批量同步用户："
cat << EOF
   curl -X POST "${BASE_URL}/api/thirdparty/${PROVIDER_ID}/sync-users" \\
     -H "Authorization: Bearer ${ADMIN_TOKEN}"
EOF
echo ""
echo "4. 查看同步状态："
cat << EOF
   curl -X GET "${BASE_URL}/api/thirdparty/${PROVIDER_ID}/sync-status" \\
     -H "Authorization: Bearer ${ADMIN_TOKEN}"
EOF

# 6. 查看创建的资源
echo -e "\n${YELLOW}步骤 6: 查看创建的资源${NC}"
echo ""
echo "外部应用详情："
curl -s -X GET "${BASE_URL}/api/outbound/apps/${OUTBOUND_APP_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.'

echo ""
echo "第三方平台详情："
curl -s -X GET "${BASE_URL}/api/thirdparty/${PROVIDER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.'

echo ""
echo -e "${GREEN}=========================================="
echo "测试环境配置完成！"
echo "==========================================${NC}"
echo ""
echo "接下来的步骤："
echo "1. 在 FreePass 平台获取正确的 app_key 和 app_secret"
echo "2. 更新外部应用的 app_params_json"
echo "3. 获取测试用户的 access_token"
echo "4. 使用 access_token 测试 SSO 登录"
echo "5. 测试批量用户同步"
echo ""
echo "保存的资源 ID："
echo "  - Outbound App ID: ${OUTBOUND_APP_ID}"
echo "  - Provider ID: ${PROVIDER_ID}"
