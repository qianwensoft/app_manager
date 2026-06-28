#!/bin/bash

# eTeams SSO 完整测试脚本 - 从 IM 链接到免登本系统

BASE_URL="http://localhost:8080"
ETEAMS_URL="http://27.195.159.118:20600"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "eTeams 免登本系统 - 完整测试"
echo "=========================================="

# 1. 登录获取 admin token
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

# 2. 创建第三方平台
echo -e "\n${YELLOW}步骤 2: 创建 eTeams 第三方平台${NC}"
echo "请输入 eTeams app_key: "
read APP_KEY
echo "请输入 eTeams app_secret: "
read -s APP_SECRET
echo ""

PROVIDER_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/thirdparty" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "eTeams 平台",
    "type": "freepass",
    "description": "eTeams IM 免登本系统",
    "open_api_origin": "'"${ETEAMS_URL}"'",
    "app_key": "'"${APP_KEY}"'",
    "app_secret": "'"${APP_SECRET}"'",
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

# 3. 生成免登链接
echo -e "\n${YELLOW}步骤 3: 生成 IM 中的免登链接${NC}"

# 本系统的回调地址（前端页面）
CALLBACK_URL="${BASE_URL}/auth/eteams/callback"

# 获取完整的 eTeams 免登 URL
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
echo "用户点击后的流程："
echo "==========================================${NC}"
echo ""
echo "1. 用户在 eTeams IM 中点击链接"
echo "2. eTeams 验证用户身份（已登录 IM）"
echo "3. eTeams 重定向到: ${CALLBACK_URL}?eteams_token=xxx"
echo "4. 前端页面接收 eteams_token"
echo "5. 调用本系统登录接口"
echo "6. 自动登录到本系统"
echo ""

# 4. 创建测试用的 HTML 回调页面
echo -e "\n${YELLOW}步骤 4: 创建测试回调页面${NC}"

cat > /tmp/eteams_callback_test.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>eTeams 登录回调</title>
    <meta charset="utf-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
        }
        .loading { color: #409EFF; }
        .success { color: #67C23A; }
        .error { color: #F56C6C; }
        pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>eTeams SSO 登录测试</h1>
    <div id="status" class="loading">正在处理登录...</div>
    <div id="details"></div>

    <script>
        const API_BASE = 'http://localhost:8080';
        const PROVIDER_ID = PROVIDER_ID_PLACEHOLDER;

        async function handleCallback() {
            const urlParams = new URLSearchParams(window.location.search);
            const eteamsToken = urlParams.get('eteams_token');

            const statusEl = document.getElementById('status');
            const detailsEl = document.getElementById('details');

            if (!eteamsToken) {
                statusEl.className = 'error';
                statusEl.textContent = '错误：未获取到 eteams_token';
                detailsEl.innerHTML = '<p>URL 参数:</p><pre>' + window.location.search + '</pre>';
                return;
            }

            detailsEl.innerHTML = '<h3>步骤 1: 获取到 eteams_token</h3><pre>' + eteamsToken + '</pre>';

            try {
                // 调用本系统登录接口
                statusEl.textContent = '正在调用本系统登录接口...';

                const response = await fetch(API_BASE + '/api/auth/thirdparty/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        provider_id: PROVIDER_ID,
                        eteams_token: eteamsToken
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    statusEl.className = 'success';
                    statusEl.textContent = '✓ 登录成功！';

                    detailsEl.innerHTML += '<h3>步骤 2: 登录成功</h3>';
                    detailsEl.innerHTML += '<h4>JWT Token:</h4><pre>' + data.token.substring(0, 50) + '...</pre>';
                    detailsEl.innerHTML += '<h4>用户信息:</h4><pre>' + JSON.stringify(data.user, null, 2) + '</pre>';

                    // 保存 token
                    localStorage.setItem('token', data.token);

                    // 3秒后跳转
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 3000);
                } else {
                    throw new Error(data.error || '登录失败');
                }
            } catch (error) {
                statusEl.className = 'error';
                statusEl.textContent = '✗ 登录失败: ' + error.message;
                detailsEl.innerHTML += '<h3>错误详情:</h3><pre>' + error.stack + '</pre>';
            }
        }

        // 页面加载后执行
        handleCallback();
    </script>
</body>
</html>
EOF

# 替换 PROVIDER_ID
sed -i.bak "s/PROVIDER_ID_PLACEHOLDER/${PROVIDER_ID}/g" /tmp/eteams_callback_test.html
rm /tmp/eteams_callback_test.html.bak

echo -e "${GREEN}✓ 测试回调页面已创建${NC}"
echo "文件位置: /tmp/eteams_callback_test.html"

# 5. 启动简易 HTTP 服务器（如果需要）
echo -e "\n${YELLOW}步骤 5: 测试说明${NC}"
echo ""
echo "如果需要本地测试回调页面，可以运行："
echo ""
echo "  cd /tmp"
echo "  python3 -m http.server 8000"
echo ""
echo "然后将回调地址改为: http://localhost:8000/eteams_callback_test.html"

# 6. 模拟测试流程
echo -e "\n${BLUE}=========================================="
echo "完整测试流程："
echo "==========================================${NC}"
echo ""
echo "1️⃣  在 eTeams IM 中发送链接："
echo "   ${ETEAMS_AUTH_URL}"
echo ""
echo "2️⃣  或在 eTeams 中创建菜单/应用，URL 指向上面的链接"
echo ""
echo "3️⃣  用户点击链接后，会跳转到："
echo "   ${CALLBACK_URL}?eteams_token=xxxxxxxxxx"
echo ""
echo "4️⃣  前端接收 eteams_token 并调用登录接口："
cat << 'APITEST'

   curl -X POST http://localhost:8080/api/auth/thirdparty/login \
     -H "Content-Type: application/json" \
     -d '{
       "provider_id": PROVIDER_ID_VALUE,
       "eteams_token": "从URL获取的token"
     }'
APITEST
echo ""
echo "5️⃣  登录成功，保存 JWT token，跳转到主页"
echo ""

# 7. 手动测试命令
echo -e "\n${BLUE}=========================================="
echo "手动测试命令（需要真实的 eteams_token）："
echo "==========================================${NC}"
echo ""
cat << MANUAL
# 方式 1: 使用 eteams_token 登录
curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "eteams_token": "YOUR_ETEAMS_TOKEN_HERE"
  }'

# 方式 2: 使用账号登录（测试用）
curl -X POST "${BASE_URL}/api/auth/thirdparty/login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider_id": ${PROVIDER_ID},
    "account": "user@example.com",
    "app_key": "${APP_KEY}",
    "app_secret": "${APP_SECRET}"
  }'
MANUAL

echo ""
echo -e "${GREEN}=========================================="
echo "配置完成！"
echo "==========================================${NC}"
echo ""
echo "保存的信息："
echo "  - Provider ID: ${PROVIDER_ID}"
echo "  - eTeams 免登链接: ${ETEAMS_AUTH_URL}"
echo "  - 回调地址: ${CALLBACK_URL}"
echo ""
echo "下一步："
echo "  1. 在 eTeams IM 中测试发送免登链接"
echo "  2. 或在 eTeams 中配置应用菜单"
echo "  3. 用户点击后自动登录到本系统"
