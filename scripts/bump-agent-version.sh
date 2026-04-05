#!/usr/bin/env bash
# 根据 git 提交历史判断 agent 是否有变更，有则自动升级版本号
#
# 用法：
#   scripts/bump-agent-version.sh                         # 自动检测，有变更才升级
#   scripts/bump-agent-version.sh --force                 # 强制升级（patch+1）
#   scripts/bump-agent-version.sh --version 2.1.0         # 直接指定版本名（versionCode 自动+1）
#   scripts/bump-agent-version.sh --version 2.1.0 --code 42  # 同时指定版本名和 versionCode
#
# 退出码：0=已升级, 2=无需升级（仅自动检测模式）, 1=错误

set -e

GRADLE="agent/app/build.gradle"
FORCE=""
SET_NAME=""
SET_CODE=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force)    FORCE=1; shift ;;
        --version)  SET_NAME="$2"; shift 2 ;;
        --code)     SET_CODE="$2"; shift 2 ;;
        *) echo "未知参数: $1" >&2; exit 1 ;;
    esac
done

cd "$(git rev-parse --show-toplevel)"

# 读取当前版本
CURRENT_CODE=$(grep -E '^\s+versionCode\s+[0-9]+' "$GRADLE" | grep -o '[0-9]*')
CURRENT_NAME=$(grep -E '^\s+versionName\s+"[^"]+"' "$GRADLE" | grep -o '"[^"]*"' | tr -d '"')

if [ -z "$CURRENT_CODE" ] || [ -z "$CURRENT_NAME" ]; then
    echo "[agent-version] 错误：无法从 $GRADLE 读取当前版本" >&2
    exit 1
fi

# ── 直接参数化模式 ──────────────────────────────────────────────────────────
if [ -n "$SET_NAME" ]; then
    NEW_NAME="$SET_NAME"
    if [ -n "$SET_CODE" ]; then
        NEW_CODE="$SET_CODE"
    else
        NEW_CODE=$((CURRENT_CODE + 1))
    fi
    echo "[agent-version] 手动指定版本：${CURRENT_NAME} (code ${CURRENT_CODE}) → ${NEW_NAME} (code ${NEW_CODE})"

# ── 自动检测模式 ────────────────────────────────────────────────────────────
else
    # 自上次 tag 以来触碰 agent/ 的提交数；无 tag 则检查全部历史
    LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    if [ -n "$LAST_TAG" ]; then
        COMMITS=$(git log "${LAST_TAG}..HEAD" --oneline -- agent/ 2>/dev/null | wc -l | tr -d ' ')
        RANGE="${LAST_TAG}..HEAD"
    else
        COMMITS=$(git log --oneline -- agent/ 2>/dev/null | wc -l | tr -d ' ')
        RANGE="（全部历史）"
    fi

    if [ "$COMMITS" -eq 0 ] && [ -z "$FORCE" ]; then
        echo "[agent-version] agent/ 自上次 tag 无变更，跳过版本升级"
        exit 2
    fi

    if [ "$COMMITS" -gt 0 ]; then
        echo "[agent-version] 检测到 ${COMMITS} 个 agent 提交（范围 ${RANGE}）："
        if [ -n "$LAST_TAG" ]; then
            git log "${LAST_TAG}..HEAD" --oneline -- agent/ | sed 's/^/  /'
        else
            git log --oneline -- agent/ | head -10 | sed 's/^/  /'
        fi
    fi

    NEW_CODE=$((CURRENT_CODE + 1))
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_NAME"
    NEW_PATCH=$((PATCH + 1))
    NEW_NAME="${MAJOR}.${MINOR}.${NEW_PATCH}"
    echo "[agent-version] 自动升级：${CURRENT_NAME} (code ${CURRENT_CODE}) → ${NEW_NAME} (code ${NEW_CODE})"
fi

# ── 写入 build.gradle ───────────────────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"
    sed -i '' "s/versionName \"${CURRENT_NAME}\"/versionName \"${NEW_NAME}\"/" "$GRADLE"
else
    sed -i "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"
    sed -i "s/versionName \"${CURRENT_NAME}\"/versionName \"${NEW_NAME}\"/" "$GRADLE"
fi
