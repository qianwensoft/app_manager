#!/usr/bin/env bash
# Phase A 自动化验证：A1 数据流 + A3 MCP
# 用法：./scripts/phase-a-test.sh
set -euo pipefail
cd "$(dirname "$0")/../server"
echo "==> Phase A integration tests (A1 + A3)"
go test ./tests/ -count=1 -timeout 120s -v "$@"
