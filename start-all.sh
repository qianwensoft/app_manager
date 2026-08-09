#!/bin/bash

# 启动所有服务的脚本

BASE_DIR="/Volumes/data/workspace/qianwen/app-manager"
cd "$BASE_DIR"

# 清理旧进程
echo "🧹 清理旧进程..."
pkill -f "bin/app-manager" 2>/dev/null
pkill -f "node.*vite" 2>/dev/null
lsof -ti:3000,5174,8080 | xargs kill -9 2>/dev/null
sleep 2

# 启动后端
echo "1️⃣ 启动后端服务 (8080)..."
cd "$BASE_DIR"
nohup ./bin/app-manager server/config.sqlite.yaml > /tmp/backend.log 2>&1 &
echo $! > /tmp/backend.pid
sleep 3

# 启动 Web
echo "2️⃣ 启动 Web 前端 (3000)..."
cd "$BASE_DIR/web"
nohup npm run dev > /tmp/web.log 2>&1 &
echo $! > /tmp/web.pid
sleep 5

# 启动 SCADA
echo "3️⃣ 启动 SCADA 编辑器 (5174)..."
cd "$BASE_DIR/scada-editor"
nohup npm run dev > /tmp/scada.log 2>&1 &
echo $! > /tmp/scada.pid
sleep 5

echo ""
echo "✅ 所有服务已启动"
echo ""
echo "📡 端口监听检查:"
lsof -i:3000,5174,8080 2>/dev/null | grep LISTEN

echo ""
echo "🌐 访问地址:"
echo "   管理后台:     http://localhost:3000"
echo "   SCADA编辑器:  http://localhost:5174/scada-editor/"
echo "   后端API:      http://localhost:8080"
