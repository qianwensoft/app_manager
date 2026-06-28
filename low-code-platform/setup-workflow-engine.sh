#!/bin/bash

# Low-Code Platform 集成到 workflow-engine 的脚本

WORKFLOW_ENGINE_PATH="/Volumes/data/workspace/qianwen/workflow-engine"
TARGET_PATH="./packages/workflow-engine"

echo "正在集成 workflow-engine..."

if [ -d "$WORKFLOW_ENGINE_PATH" ]; then
    echo "检测到 workflow-engine 项目: $WORKFLOW_ENGINE_PATH"

    # 选项 1: 软链接（开发环境推荐）
    if [ ! -L "$TARGET_PATH" ]; then
        echo "创建软链接..."
        ln -s "$WORKFLOW_ENGINE_PATH" "$TARGET_PATH"
        echo "✓ 软链接已创建"
    else
        echo "✓ 软链接已存在"
    fi

    # 选项 2: Git Submodule（生产环境推荐）
    # git submodule add https://github.com/your-org/workflow-engine.git packages/workflow-engine
    # git submodule update --init --recursive

else
    echo "⚠ 未找到 workflow-engine 项目"
    echo "请确保 workflow-engine 项目在: $WORKFLOW_ENGINE_PATH"
    echo ""
    echo "或者修改此脚本中的 WORKFLOW_ENGINE_PATH 变量"
    exit 1
fi

echo ""
echo "集成完成！"
echo ""
echo "接下来的步骤："
echo "1. cd low-code-platform"
echo "2. pnpm install"
echo "3. pnpm dev"
