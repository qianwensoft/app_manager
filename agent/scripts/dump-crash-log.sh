#!/usr/bin/env bash
# 设备已通过 adb 连接时，导出与 Agent 闪退相关的最近日志到文件。
# 用法: ./scripts/dump-crash-log.sh [输出路径]
set -euo pipefail
OUT="${1:-./agent-crash-log.txt}"
adb devices
adb logcat -d -t 3000 2>&1 | grep -iE \
  'com\.appmanager\.agent|AndroidRuntime|FATAL EXCEPTION|Fatal signal|DEBUG\s+:.*signal|ScreenCapture|CommandDispatcher|TouchIndicator|AgentService|libc\b|tombstone' \
  > "$OUT" || true
echo "已写入: $OUT （若无匹配行，可去掉 grep 直接: adb logcat -d -t 2000 > full.txt）"
