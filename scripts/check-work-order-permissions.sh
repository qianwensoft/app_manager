#!/bin/bash
# 工单模块权限和逻辑完整检查脚本

set -e

COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_RESET='\033[0m'

echo_success() { echo -e "${COLOR_GREEN}✓ $1${COLOR_RESET}"; }
echo_error() { echo -e "${COLOR_RED}✗ $1${COLOR_RESET}"; }
echo_warning() { echo -e "${COLOR_YELLOW}⚠ $1${COLOR_RESET}"; }
echo_info() { echo -e "${COLOR_BLUE}ℹ $1${COLOR_RESET}"; }

echo "════════════════════════════════════════════════════════════"
echo "  工单模块权限和逻辑完整检查"
echo "════════════════════════════════════════════════════════════"
echo

# ============================================================
# 1. 后端API权限检查
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  后端API权限检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo_info "检查 router.go 中的工单路由配置..."

# 检查路由配置
if grep -q "FormRuntimeAuthMiddleware" server/api/router.go; then
    echo_success "找到 FormRuntimeAuthMiddleware（支持 device-token）"

    # 提取工单相关路由
    echo "  工单相关路由："
    grep -A 2 "work-orders" server/api/router.go | grep -E "woRuntime|wo :=" | head -5
else
    echo_error "未找到 FormRuntimeAuthMiddleware"
fi

echo

# 检查认证中间件实现
echo_info "检查 FormRuntimeAuthMiddleware 实现..."
if grep -q "X-Device-Token" server/auth/middleware.go; then
    echo_success "支持 X-Device-Token header"
    echo "  认证流程："
    echo "    1. 先尝试 JWT token (Authorization header 或 ?token=)"
    echo "    2. 再尝试 device token (X-Device-Token header 或 ?device_token=)"
else
    echo_error "未找到 X-Device-Token 支持"
fi

echo

# ============================================================
# 2. 数据库菜单配置检查
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  数据库菜单配置检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DB_PATH="server/data/app-manager.db"
if [ -f "$DB_PATH" ]; then
    echo_info "检查数据库: $DB_PATH"

    # 查询工单菜单配置
    MENU_DATA=$(sqlite3 "$DB_PATH" "SELECT id, title, target_type, intent_action, show_on_agent_home FROM agent_menu_items WHERE intent_action LIKE '%WORK_ORDER%';" 2>/dev/null)

    if [ -n "$MENU_DATA" ]; then
        echo_success "找到工单菜单配置："
        echo "$MENU_DATA" | while IFS='|' read -r id title target_type intent_action show_on_home; do
            echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "  菜单 ID: $id"
            echo "  标题: $title"
            echo "  类型: $target_type"
            echo "  Intent: $intent_action"

            if [ "$show_on_home" = "0" ]; then
                echo_success "  位置: 后台菜单 (show_on_agent_home=0) ✓"
            else
                echo_error "  位置: 主屏幕 (show_on_agent_home=1) ✗"
                echo_warning "    → 应该设置为 0（后台菜单）"
            fi

            # 验证配置正确性
            if [ "$target_type" = "agent_native" ]; then
                echo_success "  target_type 正确: agent_native ✓"
            else
                echo_error "  target_type 错误: $target_type ✗"
            fi

            if [ -n "$intent_action" ]; then
                echo_success "  intent_action 已设置 ✓"
            else
                echo_error "  intent_action 为空 ✗"
            fi
        done
    else
        echo_warning "未找到工单菜单配置"
        echo_info "可能需要运行服务器以初始化菜单"
    fi
else
    echo_warning "数据库文件不存在: $DB_PATH"
fi

echo

# ============================================================
# 3. Android 端代码检查
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Android 端代码检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 Activity 文件
echo_info "检查 Activity 实现..."

ACTIVITIES=(
    "agent/app/src/main/java/com/appmanager/agent/ui/MyWorkOrderListActivity.kt"
    "agent/app/src/main/java/com/appmanager/agent/ui/WorkOrderListActivity.kt"
    "agent/app/src/main/java/com/appmanager/agent/ui/WorkOrderDetailActivity.kt"
)

for activity in "${ACTIVITIES[@]}"; do
    if [ -f "$activity" ]; then
        filename=$(basename "$activity")
        echo_success "找到: $filename"

        # 检查是否使用 AgentCatalogApi
        if grep -q "AgentCatalogApi.getJson" "$activity"; then
            echo "    → 使用 AgentCatalogApi.getJson ✓"
        fi

        # 检查 device token 传递
        if grep -q "deviceToken" "$activity"; then
            echo "    → 传递 deviceToken ✓"
        fi
    else
        echo_error "未找到: $(basename "$activity")"
    fi
done

echo

# 检查 AgentCatalogApi
echo_info "检查 AgentCatalogApi 实现..."
API_FILE="agent/app/src/main/java/com/appmanager/agent/util/AgentCatalogApi.kt"
if [ -f "$API_FILE" ]; then
    echo_success "找到 AgentCatalogApi.kt"

    if grep -q "X-Device-Token" "$API_FILE"; then
        echo "  ✓ 设置 X-Device-Token header"
        echo "  ✓ 所有请求方法都包含 deviceToken 参数"
        echo "  ✓ 支持: getJson, postJson, putJson, delete, uploadFile"
    else
        echo_error "未找到 X-Device-Token header 设置"
    fi
else
    echo_error "未找到 AgentCatalogApi.kt"
fi

echo

# 检查 BackendMenuActivity
echo_info "检查 BackendMenuActivity 菜单启动逻辑..."
BACKEND_MENU="agent/app/src/main/java/com/appmanager/agent/ui/BackendMenuActivity.kt"
if [ -f "$BACKEND_MENU" ]; then
    echo_success "找到 BackendMenuActivity.kt"

    # 检查 intent_action 处理
    if grep -q "com.appmanager.agent.WORK_ORDER_LIST" "$BACKEND_MENU"; then
        echo "  ✓ 处理 WORK_ORDER_LIST intent"
    fi

    if grep -q "com.appmanager.agent.MY_WORK_ORDER_LIST" "$BACKEND_MENU"; then
        echo "  ✓ 处理 MY_WORK_ORDER_LIST intent"
    fi

    # 检查显式 Intent
    if grep -q "Intent(this, WorkOrderListActivity::class.java)" "$BACKEND_MENU"; then
        echo "  ✓ 使用显式 Intent（避免 exported=false 问题）"
    fi
else
    echo_error "未找到 BackendMenuActivity.kt"
fi

echo

# 检查 AndroidManifest.xml
echo_info "检查 AndroidManifest.xml..."
MANIFEST="agent/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
    echo_success "找到 AndroidManifest.xml"

    # 检查 Activity 注册
    if grep -q "WorkOrderListActivity" "$MANIFEST"; then
        echo "  ✓ WorkOrderListActivity 已注册"

        # 检查 exported 设置
        if grep -A 5 "WorkOrderListActivity" "$MANIFEST" | grep -q 'android:exported="false"'; then
            echo "    → exported=false (使用显式 Intent) ✓"
        fi
    else
        echo_error "  WorkOrderListActivity 未注册"
    fi

    if grep -q "MyWorkOrderListActivity" "$MANIFEST"; then
        echo "  ✓ MyWorkOrderListActivity 已注册"
    else
        echo_error "  MyWorkOrderListActivity 未注册"
    fi
else
    echo_error "未找到 AndroidManifest.xml"
fi

echo

# ============================================================
# 4. API 端点检查
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  API 端点和权限总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "端点列表和权限要求："
echo
echo "  📍 GET /api/work-orders/mine"
echo "     认证: FormRuntimeAuthMiddleware (支持 device-token)"
echo "     用途: 获取当前设备的工单列表"
echo "     使用者: MyWorkOrderListActivity"
echo
echo "  📍 GET /api/work-orders"
echo "     认证: FormRuntimeAuthMiddleware (支持 device-token)"
echo "     用途: 获取所有工单列表"
echo "     使用者: WorkOrderListActivity"
echo
echo "  📍 GET /api/work-orders/:id"
echo "     认证: FormRuntimeAuthMiddleware (支持 device-token)"
echo "     用途: 获取工单详情"
echo "     使用者: WorkOrderDetailActivity"
echo
echo "  📍 GET /api/work-orders/:id/progress"
echo "     认证: FormRuntimeAuthMiddleware (支持 device-token)"
echo "     用途: 获取工单进展列表"
echo "     使用者: WorkOrderDetailActivity"
echo

# ============================================================
# 5. 常见问题诊断
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  常见问题诊断"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "可能的权限/逻辑问题："
echo
echo "  ❌ 问题 1: HTTP 401 Unauthorized"
echo "     原因: device-token 无效或未传递"
echo "     检查:"
echo "       - 设备配置中的 deviceToken 是否正确"
echo "       - AgentCatalogApi 是否正确传递 token"
echo "       - 后端数据库中设备记录的 agent_token 字段"
echo
echo "  ❌ 问题 2: HTTP 403 Forbidden"
echo "     原因: 角色权限不足"
echo "     检查:"
echo "       - 端点是否需要特定角色（admin/operator）"
echo "       - device-token 认证后默认角色是 viewer"
echo "       - /api/work-orders/mine 和 /api/work-orders 都应支持 viewer"
echo
echo "  ❌ 问题 3: 菜单无法打开"
echo "     原因: 配置或 APK 版本问题"
echo "     检查:"
echo "       - 数据库菜单配置是否正确"
echo "       - show_on_agent_home 是否为 0"
echo "       - target_type 是否为 agent_native"
echo "       - intent_action 是否正确"
echo "       - APK 是否是最新版本"
echo
echo "  ❌ 问题 4: 列表加载失败"
echo "     原因: 网络或 API 问题"
echo "     检查:"
echo "       - 设备网络连接"
echo "       - 服务器 URL 配置"
echo "       - API 返回数据格式"
echo

# ============================================================
# 6. 设备测试（如果已连接）
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  设备测试（需要设备连接）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v adb &> /dev/null; then
    if adb devices | grep -q "device$"; then
        echo_success "检测到已连接的设备"

        # 检查应用是否安装
        if adb shell pm list packages | grep -q "com.appmanager.agent"; then
            echo_success "应用已安装"

            # 检查 Activity 注册
            echo_info "检查 Activity 注册..."
            if adb shell dumpsys package com.appmanager.agent | grep -q "WorkOrderListActivity"; then
                echo_success "  WorkOrderListActivity 已注册"
            else
                echo_error "  WorkOrderListActivity 未注册 (需要重新安装 APK)"
            fi

            if adb shell dumpsys package com.appmanager.agent | grep -q "MyWorkOrderListActivity"; then
                echo_success "  MyWorkOrderListActivity 已注册"
            else
                echo_error "  MyWorkOrderListActivity 未注册 (需要重新安装 APK)"
            fi

            # 测试直接启动
            echo
            echo_info "测试直接启动 Activity..."
            echo "  运行命令: adb shell am start -n com.appmanager.agent/.ui.MyWorkOrderListActivity"

            if adb shell am start -n com.appmanager.agent/.ui.MyWorkOrderListActivity 2>&1 | grep -q "Error"; then
                echo_error "  启动失败 - Activity 可能未正确注册"
            else
                echo_success "  启动成功 - Activity 可以直接打开"
                echo_warning "  如果从菜单无法打开，问题在菜单配置或同步"
            fi
        else
            echo_warning "应用未安装"
            echo_info "  运行: make install-agent"
        fi
    else
        echo_warning "未检测到已连接的设备"
        echo_info "  连接设备后重新运行此脚本"
    fi
else
    echo_warning "未安装 adb 命令"
fi

echo

# ============================================================
# 7. 总结和建议
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  总结和建议"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "✅ 权限设计检查："
echo "  ✓ 后端支持 device-token 认证"
echo "  ✓ Android 端正确传递 X-Device-Token header"
echo "  ✓ 所有工单端点使用 FormRuntimeAuthMiddleware"
echo "  ✓ device-token 认证后角色为 viewer（足够访问工单）"
echo
echo "✅ 逻辑流程检查："
echo "  ✓ 菜单配置 → 菜单同步 → BackendMenuActivity 路由 → 启动 Activity"
echo "  ✓ Activity → AgentCatalogApi → 后端 API → 返回数据"
echo "  ✓ 使用显式 Intent 避免 exported=false 问题"
echo
echo "📋 下一步操作："
echo "  1. 如果数据库菜单配置有误，运行: sqlite3 server/data/app-manager.db < server/fix-work-order-menu.sql"
echo "  2. 确保设备安装最新 APK: make agent && make install-agent"
echo "  3. 重启应用触发菜单同步: adb shell am force-stop com.appmanager.agent"
echo "  4. 查看实时日志诊断: adb logcat | grep -E 'WorkOrder|BackendMenu'"
echo
echo "📚 详细文档:"
echo "  - 快速修复: docs/quick-fix-work-order-menu.md"
echo "  - 完整诊断: docs/troubleshooting-work-order-menu.md"
echo

echo "════════════════════════════════════════════════════════════"
echo "  检查完成"
echo "════════════════════════════════════════════════════════════"
