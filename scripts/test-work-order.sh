#!/bin/bash
# Android 工单模块自动化测试脚本

set -e

COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_RESET='\033[0m'

echo_success() {
    echo -e "${COLOR_GREEN}✓ $1${COLOR_RESET}"
}

echo_error() {
    echo -e "${COLOR_RED}✗ $1${COLOR_RESET}"
}

echo_warning() {
    echo -e "${COLOR_YELLOW}⚠ $1${COLOR_RESET}"
}

echo_info() {
    echo "ℹ $1"
}

# 检查设备连接
check_device() {
    echo_info "检查设备连接..."
    if ! adb devices | grep -q "device$"; then
        echo_error "未检测到已连接的设备"
        exit 1
    fi
    echo_success "设备已连接"
}

# 检查 APK 是否存在
check_apk() {
    echo_info "检查 APK 文件..."
    APK_PATH="agent/app/build/outputs/apk/debug/app-debug.apk"
    if [ ! -f "$APK_PATH" ]; then
        echo_warning "APK 不存在，开始构建..."
        make agent
    fi

    if [ -f "$APK_PATH" ]; then
        APK_SIZE=$(ls -lh "$APK_PATH" | awk '{print $5}')
        echo_success "APK 已就绪 (大小: $APK_SIZE)"
    else
        echo_error "APK 构建失败"
        exit 1
    fi
}

# 安装 APK
install_apk() {
    echo_info "安装 APK 到设备..."
    if adb install -r agent/app/build/outputs/apk/debug/app-debug.apk; then
        echo_success "APK 安装成功"
    else
        echo_error "APK 安装失败"
        exit 1
    fi
}

# 检查 Activity 是否已注册
check_activities() {
    echo_info "检查 Activity 注册..."

    PACKAGE="com.appmanager.agent"

    # 检查关键 Activity
    ACTIVITIES=(
        "MyWorkOrderListActivity"
        "WorkOrderListActivity"
        "WorkOrderDetailActivity"
    )

    for activity in "${ACTIVITIES[@]}"; do
        if adb shell dumpsys package $PACKAGE | grep -q "$activity"; then
            echo_success "Activity 已注册: $activity"
        else
            echo_error "Activity 未注册: $activity"
        fi
    done
}

# 启动应用
launch_app() {
    echo_info "启动应用..."
    adb shell am start -n com.appmanager.agent/.MainActivity
    sleep 2
    echo_success "应用已启动"
}

# 检查应用日志
check_logs() {
    echo_info "检查应用日志（最近 20 行）..."
    adb logcat -d | grep -E "(WorkOrder|AgentMenu)" | tail -20
}

# 清除日志
clear_logs() {
    echo_info "清除设备日志..."
    adb logcat -c
    echo_success "日志已清除"
}

# 监控日志（后台运行）
monitor_logs() {
    echo_info "开始监控日志（按 Ctrl+C 停止）..."
    adb logcat | grep -E "(WorkOrder|MyWorkOrderListActivity|WorkOrderListActivity|WorkOrderDetailActivity)" --color=auto
}

# 收集诊断信息
collect_diagnostics() {
    echo_info "收集诊断信息..."

    DIAG_DIR="diagnostics_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$DIAG_DIR"

    echo_info "收集 logcat..."
    adb logcat -d > "$DIAG_DIR/logcat.txt"

    echo_info "收集应用信息..."
    adb shell dumpsys package com.appmanager.agent > "$DIAG_DIR/package_info.txt"

    echo_info "收集设备信息..."
    adb shell getprop > "$DIAG_DIR/device_props.txt"

    echo_info "过滤工单相关日志..."
    grep -E "(WorkOrder|AgentMenu)" "$DIAG_DIR/logcat.txt" > "$DIAG_DIR/work_order_logs.txt" || true

    echo_success "诊断信息已保存到: $DIAG_DIR"
}

# 测试网络连接
test_network() {
    echo_info "测试网络连接..."

    # 获取应用配置的服务器地址
    SERVER_URL=$(adb shell "run-as com.appmanager.agent cat /data/data/com.appmanager.agent/shared_prefs/agent_config.xml" 2>/dev/null | grep serverUrl | sed 's/.*>\(.*\)<.*/\1/' || echo "")

    if [ -z "$SERVER_URL" ]; then
        echo_warning "无法获取服务器地址，请确认应用已配置"
    else
        echo_info "服务器地址: $SERVER_URL"

        # 尝试从设备 ping 服务器
        SERVER_HOST=$(echo "$SERVER_URL" | sed 's|ws://||' | sed 's|wss://||' | sed 's|/.*||')
        if adb shell "ping -c 3 $SERVER_HOST" > /dev/null 2>&1; then
            echo_success "网络连接正常"
        else
            echo_warning "无法连接到服务器"
        fi
    fi
}

# 显示菜单
show_menu() {
    echo ""
    echo "================================"
    echo "Android 工单模块测试工具"
    echo "================================"
    echo "1. 完整测试流程（检查+构建+安装）"
    echo "2. 仅构建 APK"
    echo "3. 仅安装 APK"
    echo "4. 检查 Activity 注册"
    echo "5. 启动应用"
    echo "6. 查看应用日志"
    echo "7. 清除日志"
    echo "8. 监控实时日志"
    echo "9. 收集诊断信息"
    echo "10. 测试网络连接"
    echo "0. 退出"
    echo "================================"
    echo -n "请选择操作 [0-10]: "
}

# 主菜单逻辑
main() {
    while true; do
        show_menu
        read -r choice

        case $choice in
            1)
                echo "执行完整测试流程..."
                check_device
                check_apk
                install_apk
                check_activities
                launch_app
                echo_success "完整测试流程完成"
                ;;
            2)
                echo "开始构建..."
                make agent
                echo_success "构建完成"
                ;;
            3)
                check_device
                check_apk
                install_apk
                ;;
            4)
                check_device
                check_activities
                ;;
            5)
                check_device
                launch_app
                ;;
            6)
                check_logs
                ;;
            7)
                clear_logs
                ;;
            8)
                clear_logs
                monitor_logs
                ;;
            9)
                collect_diagnostics
                ;;
            10)
                test_network
                ;;
            0)
                echo "退出"
                exit 0
                ;;
            *)
                echo_error "无效选择"
                ;;
        esac

        echo ""
        echo -n "按 Enter 继续..."
        read
    done
}

# 如果提供命令行参数，直接执行对应操作
if [ $# -gt 0 ]; then
    case $1 in
        "full")
            check_device
            check_apk
            install_apk
            check_activities
            launch_app
            ;;
        "build")
            make agent
            ;;
        "install")
            check_device
            check_apk
            install_apk
            ;;
        "logs")
            monitor_logs
            ;;
        "diag")
            collect_diagnostics
            ;;
        *)
            echo "用法: $0 [full|build|install|logs|diag]"
            echo "  full    - 完整测试流程"
            echo "  build   - 仅构建 APK"
            echo "  install - 仅安装 APK"
            echo "  logs    - 监控实时日志"
            echo "  diag    - 收集诊断信息"
            echo ""
            echo "或不带参数运行交互式菜单"
            exit 1
            ;;
    esac
else
    # 交互式菜单
    main
fi
