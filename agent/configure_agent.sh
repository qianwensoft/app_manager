#!/bin/bash
# 通过 adb 配置 Agent 的脚本
# 用法: ./configure_agent.sh [DEVICE_SERIAL] [SERVER_URL] [FORM_APP_BASE_URL]

DEVICE=${1:-"982507e9"}
SERVER_URL=${2:-"http://192.168.1.136:8080"}
FORM_APP_BASE_URL=${3:-"http://192.168.1.136:4175"}

echo "Configuring Agent on device: $DEVICE"
echo "  Server URL: $SERVER_URL"
echo "  Form App Base URL: $FORM_APP_BASE_URL"
echo ""

# 发送显式广播配置
adb -s "$DEVICE" shell am broadcast -a com.appmanager.agent.CONFIG \
  -n com.appmanager.agent/.ConfigReceiver \
  --es server_url "$SERVER_URL" \
  --es form_app_base_url "$FORM_APP_BASE_URL" \
  --es device_token "$DEVICE"

echo ""
echo "Waiting for configuration to be applied..."
sleep 2

# 验证配置
echo ""
echo "Current configuration:"
adb -s "$DEVICE" shell "run-as com.appmanager.agent cat /data/data/com.appmanager.agent/shared_prefs/agent_config.xml" | grep -E "(server_url|form_app_base_url|device_token)"

echo ""
echo "Recent ConfigReceiver logs:"
adb -s "$DEVICE" logcat -d | grep ConfigReceiver | tail -5

echo ""
echo "Configuration complete!"
echo ""
echo "To test form-app, open the Agent app on the device and navigate to a form."
