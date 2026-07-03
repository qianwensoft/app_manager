#!/bin/bash
# Agent 设备配置助手脚本
# 用于通过扫码重新配置 Agent 连接服务器

set -e

DEVICE_SERIAL="${1:-}"
SERVER_URL="${2:-http://localhost:8080}"

if [ -z "$DEVICE_SERIAL" ]; then
    echo "Usage: $0 <device-serial> [server-url]"
    echo "Example: $0 982507e9 http://192.168.1.100:8080"
    exit 1
fi

echo "=== Configuring Agent on device $DEVICE_SERIAL ==="
echo "Server URL: $SERVER_URL"
echo ""

# 1. 检查设备是否连接
if ! adb -s "$DEVICE_SERIAL" get-state 2>/dev/null | grep -q "device"; then
    echo "Error: Device $DEVICE_SERIAL not connected"
    exit 1
fi

# 2. 检查 Agent 是否已安装
if ! adb -s "$DEVICE_SERIAL" shell pm list packages | grep -q "com.appmanager.agent"; then
    echo "Error: Agent app not installed on device"
    exit 1
fi

# 3. 获取 Agent 版本
AGENT_VERSION=$(adb -s "$DEVICE_SERIAL" shell dumpsys package com.appmanager.agent | grep versionName | head -1 | awk -F'=' '{print $2}')
echo "Agent version: $AGENT_VERSION"
echo ""

# 4. 打开 Agent 应用
echo "Opening Agent app..."
adb -s "$DEVICE_SERIAL" shell am start -n com.appmanager.agent/.MainActivity
sleep 2

# 5. 生成配置二维码
echo ""
echo "=== Next Steps ==="
echo "1. 在 Agent 应用中点击「扫码配置」"
echo "2. 在 Web 管理后台 $SERVER_URL 进入「设备管理」"
echo "3. 点击「添加设备」生成二维码"
echo "4. 用 Agent 扫描二维码完成配置"
echo ""
echo "或者，直接在 Agent 中手动输入："
echo "  服务器地址: $SERVER_URL"
echo "  Token: (从管理后台获取)"
echo ""

# 6. 监控连接状态
echo "Monitoring connection (Ctrl+C to stop)..."
adb -s "$DEVICE_SERIAL" logcat -c
adb -s "$DEVICE_SERIAL" logcat | grep -E "AgentWebSocket.*connect|register|token" --line-buffered
