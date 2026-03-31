#!/usr/bin/env bash
# Android Agent：编译 → 同步 APK 到 server/uploads → 可选 POST 到应用管理
# 用法:
#   ./scripts/sync-agent-apk.sh              # debug + 复制 + 若设 TOKEN 则部署
#   ./scripts/sync-agent-apk.sh release      # release（未配置签名时可能是 unsigned）
#   ./scripts/sync-agent-apk.sh debug --no-deploy   # 只编译并复制，不调 API
#   ./scripts/sync-agent-apk.sh debug --install     # 编译后 adb install -r（需连接设备）
# 环境变量见 scripts/sync-agent-apk.env.example
# APP_UPLOAD_DESCRIPTION 可选；未设置时自动生成含构建类型与时间的说明
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="${SERVER_DIR:-$ROOT/server}"
STORAGE_PATH="${STORAGE_PATH:-$SERVER_DIR/uploads}"
UPLOAD_URL="${UPLOAD_URL:-http://127.0.0.1:8080/api/apps/upload}"
DEPLOY=1
DO_INSTALL=0
BUILD_TYPE="debug"

usage() {
  echo "Usage: $0 [debug|release] [--no-deploy] [--install]"
  echo "  debug (default)  : assembleDebug  → app-debug.apk"
  echo "  release          : assembleRelease → app-release.apk 或 app-release-unsigned.apk"
  echo "  --no-deploy      : 不调用 /api/apps/upload（仍复制到 uploads）"
  echo "  --install        : 编译成功后 adb install -r（覆盖安装到已连接设备）"
  echo ""
  echo "Env: SERVER_DIR, STORAGE_PATH, UPLOAD_URL, APP_MANAGER_TOKEN, APP_UPLOAD_DESCRIPTION, ANDROID_SERIAL"
  exit "${1:-0}"
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage 0 ;;
    debug) BUILD_TYPE="debug" ;;
    release) BUILD_TYPE="release" ;;
    --no-deploy) DEPLOY=0 ;;
    --install) DO_INSTALL=1 ;;
    *) echo "Unknown option: $arg" >&2; usage 1 ;;
  esac
done

cd "$ROOT/agent"

echo "==> Gradle assemble ($BUILD_TYPE)"
case "$BUILD_TYPE" in
  debug)
    ./gradlew :app:assembleDebug --quiet
    APK="$ROOT/agent/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  release)
    ./gradlew :app:assembleRelease --quiet
    REL_DIR="$ROOT/agent/app/build/outputs/apk/release"
    if [[ -f "$REL_DIR/app-release.apk" ]]; then
      APK="$REL_DIR/app-release.apk"
    elif [[ -f "$REL_DIR/app-release-unsigned.apk" ]]; then
      APK="$REL_DIR/app-release-unsigned.apk"
      echo "WARN: 使用未签名 release APK；上架/部分机型安装需配置 signingConfig 后重新 assembleRelease。" >&2
    else
      echo "ERROR: 未找到 release APK（请检查 $REL_DIR）" >&2
      exit 1
    fi
    ;;
  *)
    echo "BUILD_TYPE must be debug or release" >&2
    exit 1
    ;;
esac

[[ -f "$APK" ]] || { echo "ERROR: APK 不存在: $APK" >&2; exit 1; }

if [[ "$DO_INSTALL" == "1" ]]; then
  echo "==> adb install -r $APK"
  if ! command -v adb >/dev/null 2>&1; then
    echo "ERROR: 未找到 adb" >&2
    exit 1
  fi
  adb ${ANDROID_SERIAL:+-s "$ANDROID_SERIAL"} install -r "$APK"
fi

mkdir -p "$STORAGE_PATH"
STAMP="$(date +%Y%m%d_%H%M%S)"
DEST_BASENAME="agent-${BUILD_TYPE}-${STAMP}.apk"
DEST="$STORAGE_PATH/$DEST_BASENAME"
cp "$APK" "$DEST"
echo "==> 已同步至 server uploads: $DEST"

if [[ "$DEPLOY" != "1" ]]; then
  echo "==> 已跳过 API 部署 (--no-deploy)"
  exit 0
fi

if [[ -z "${APP_MANAGER_TOKEN:-}" ]]; then
  echo "==> 未设置 APP_MANAGER_TOKEN，跳过应用管理接口（仅已复制 APK）"
  echo "    登录 Web 后从浏览器取 JWT，或: export APP_MANAGER_TOKEN='...'"
  exit 0
fi

echo "==> POST $UPLOAD_URL（注册到应用管理）"
if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: 需要 curl" >&2
  exit 1
fi

# mktemp 模板须以连续 X 结尾（Linux）；不加 .apk 后缀不影响上传
TMP_UPLOAD="$(mktemp "${TMPDIR:-/tmp}/agent-upload.XXXXXX")"
RESP_JSON="$(mktemp "${TMPDIR:-/tmp}/agent-upload-res.XXXXXX")"
trap 'rm -f "$TMP_UPLOAD" "$RESP_JSON"' EXIT
cp "$APK" "$TMP_UPLOAD"
# 上传文件名带上构建类型，列表里可区分 debug/release
UPLOAD_NAME="agent-${BUILD_TYPE}-${STAMP}.apk"
if [[ -n "${APP_UPLOAD_DESCRIPTION:-}" ]]; then
  UPLOAD_DESC="$APP_UPLOAD_DESCRIPTION"
else
  UPLOAD_DESC="Agent ${BUILD_TYPE} 构建 $(date '+%Y-%m-%d %H:%M:%S')"
fi
HTTP_CODE="$(curl -sS -o "$RESP_JSON" -w "%{http_code}" \
  -X POST "$UPLOAD_URL" \
  -H "Authorization: Bearer ${APP_MANAGER_TOKEN}" \
  -F "file=@${TMP_UPLOAD};filename=${UPLOAD_NAME}" \
  --form-string "description=${UPLOAD_DESC}")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: 上传失败 HTTP $HTTP_CODE" >&2
  cat "$RESP_JSON" >&2 || true
  exit 1
fi

echo "==> 应用管理已登记（含 package_name 等元数据，服务器无需 aapt）:"
if command -v jq >/dev/null 2>&1; then
  jq . "$RESP_JSON"
  jq -e '.data.package_name != null and (.data.package_name | length) > 0' "$RESP_JSON" >/dev/null 2>&1 || \
    echo "WARN: 响应中 package_name 为空，请检查 APK 或服务器日志" >&2
else
  cat "$RESP_JSON"
fi
