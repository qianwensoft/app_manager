#!/bin/bash

# eTeams SSO 测试 - 使用现有外部应用 E10

BASE_URL="http://localhost:8080"
ETEAMS_URL="http://27.195.159.118:20600"
OUTBOUND_APP_ID=1  # 假设 E10 的 ID 是 1，请根据实际情况调整

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "eTeams SSO 测试 - 使用外部应用 E10"
echo "=========================================="

# 1. 登录获取 admin token
echo -e "\n${YELLOW}步骤 1: 登录获取 admin token${NC}"
read -p "Admin 用户名 [admin]: " ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
read -sp "Admin 密码 [admin123]: " ADMIN_PASSWORD
echo ""
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}

ADMIN_TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  | jq -r '.token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo -e "${RED}✗ 登录失败${NC}"
  exit 1
fi
echo -e "${GREEN}✓ 登录成功${NC}"

# 2. 查看现有外部应用列表
echo -e "\n${YELLOW}步骤 2: 查看现有外部应用${NC}"
APPS_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/outbound/apps" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

echo "现有外部应用列表:"
echo "$APPS_RESPONSE" | jq '.data[] | {id, name, base_url, auth_type}'

echo ""
read -p "请输入要使用的外部应用 ID (例如 E10): " OUTBOUND_APP_ID

# 3. 获取 eTeams 配置信息
echo -e "\n${YELLOW}步骤 3: 配置 eTeams 平台信息${NC}"
read -p "eTeams app_key: " APP_KEY
read -sp "eTeams app_secret: " APP_SECRET
echo ""

# 4. 创建第三方平台（关联到外部应用）
echo -e "\n${YELLOW}步骤 4: 创建 eTeams 第三方平台（关联到外部应用 ${OUTBOUND_APP_ID}）${NC}"

PROVIDER_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/thirdparty" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "eTeams 平台",
    "type": "freepass",
    "description": "eTeams IM 免登本系统（使用外部应用 E10 管理 token）",
    "open_api_origin": "'"${ETEAMS_URL}"'",
    "app_key": "'"${APP_KEY}"'",
    "app_secret": "'"${APP_SECRET}"'",
    "outbound_app_id": '"${OUTBOUND_APP_ID}"',
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
echo "关联的外部应用: ${OUTBOUND_APP_ID}"

# 5. 测试外部应用 token（如果配置了 dynamic_bearer）
echo -e "\n${YELLOW}步骤 5: 检查外部应用 token 配置${NC}"
APP_DETAIL=$(curl -s -X GET "${BASE_URL}/api/outbound/apps/${OUTBOUND_APP_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

AUTH_TYPE=$(echo "$APP_DETAIL" | jq -r '.auth_type')
echo "外部应用认证类型: ${AUTH_TYPE}"

if [ "$AUTH_TYPE" == "dynamic_bearer" ]; then
  echo -e "${BLUE}提示: 外部应用使用 dynamic_bearer，第三方平台将自动使用其 token${NC}"

  # 可选：测试 token 获取
  read -p "是否测试 token 获取? (y/n) [n]: " TEST_TOKEN
  if [ "$TEST_TOKEN" == "y" ]; then
    echo "测试 token 获取..."
    TOKEN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/outbound/apps/${OUTBOUND_APP_ID}/token/fetch" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}")
    echo "$TOKEN_RESPONSE" | jq '.'
  fi
fi

# 6. 生成免登链接
echo -e "\n${YELLOW}步骤 6: 生成 IM 免登链接${NC}"

CALLBACK_URL="${BASE_URL}/auth-eteams-callback.html?provider_id=${PROVIDER_ID}"

AUTH_URL_RESPONSE=$(curl -s -X GET \
  "${BASE_URL}/api/thirdparty/${PROVIDER_ID}/eteams/auth-url?redirect_uri=${CALLBACK_URL}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

ETEAMS_AUTH_URL=$(echo "$AUTH_URL_RESPONSE" | jq -r '.auth_url')

echo -e "${GREEN}✓ 免登链接生成成功${NC}"
echo ""
echo -e "${BLUE}=========================================="
echo "在 eTeams IM 中发送以下链接："
echo "==========================================${NC}"
echo ""
echo "${ETEAMS_AUTH_URL}"
echo ""
echo -e "${BLUE}=========================================="
echo "测试流程："
echo "==========================================${NC}"
echo ""
echo "1️⃣  将上面的链接发送到 eTeams IM 群聊或私聊"
echo ""
echo "2️⃣  或在 eTeams 管理后台创建应用菜单:"
echo "    - 菜单类型: URL"
echo "    - 链接地址: ${ETEAMS_AUTH_URL}"
echo ""
echo "3️⃣  用户在 eTeams 中点击链接"
echo ""
echo "4️⃣  自动跳转到: ${CALLBACK_URL}?eteams_token=xxx"
echo ""
echo "5️⃣  回调页面自动完成登录"
echo ""

# 7. 提供测试命令
echo -e "\n${BLUE}=========================================="
echo "手动测试命令："
echo "==========================================${NC}"
echo ""
echo "# 1. 在浏览器中打开回调页面测试:"
echo "   ${BASE_URL}/auth-eteams-callback.html"
echo ""
echo "# 2. 使用 curl 测试登录接口（需要真实的 eteams_token）:"
cat << MANUAL

curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "eteams_token": "YOUR_ETEAMS_TOKEN"
  }'

MANUAL

echo ""
echo "# 3. 测试账号登录模式:"
cat << ACCOUNT

curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "account": "user@example.com",
    "app_key": "${APP_KEY}",
    "app_secret": "${APP_SECRET}"
  }'

ACCOUNT

echo ""
echo -e "${GREEN}=========================================="
echo "配置完成！"
echo "==========================================${NC}"
echo ""
echo "配置摘要:"
echo "  ✓ 第三方平台 ID: ${PROVIDER_ID}"
echo "  ✓ 关联外部应用 ID: ${OUTBOUND_APP_ID}"
echo "  ✓ 回调地址: ${CALLBACK_URL}"
echo "  ✓ eTeams 免登链接: 已生成"
echo ""
echo "下一步:"
echo "  1. 将免登链接发送到 eTeams IM"
echo "  2. 或在 eTeams 中配置应用菜单"
echo "  3. 点击链接测试登录"
echo ""

# 8. 保存配置到文件
CONFIG_FILE="eteams_sso_config.txt"
cat > "$CONFIG_FILE" << CONFIG
# eTeams SSO 配置信息
# 生成时间: $(date)

Provider ID: ${PROVIDER_ID}
Outbound App ID: ${OUTBOUND_APP_ID}
eTeams URL: ${ETEAMS_URL}
Callback URL: ${CALLBACK_URL}
Auth URL: ${ETEAMS_AUTH_URL}

# 测试账号登录
curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "account": "YOUR_ACCOUNT",
    "app_key": "${APP_KEY}",
    "app_secret": "${APP_SECRET}"
  }'
CONFIG

echo -e "${GREEN}✓ 配置信息已保存到: ${CONFIG_FILE}${NC}"
