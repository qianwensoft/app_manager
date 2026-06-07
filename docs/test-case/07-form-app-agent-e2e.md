# TC-FORM-AGENT — Form App 设备端闭环

> **前置**：Server 已启动、Form App 已发布、设备已注册 Agent 且 `agent_token` 有效。

## 1. 下发菜单

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -s -X POST "http://127.0.0.1:8080/api/form-app/infos/<FORM_APP_ID>/deploy-to-devices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_ids": [<DEVICE_ID>],
    "entry_page_key": "form",
    "menu_title": "E2E 表单",
    "show_on_agent_home": true
  }'
```

**验收**：`menu_id` 返回；设备 `agent_menu_revision` 递增。

## 2. Agent 同步菜单

1. 确认 Agent 已连接（Web 控制台设备在线）。
2. 等待 WS `agent_menu_sync` 或重启 Agent 拉取 manifest。

```bash
curl -s http://127.0.0.1:8080/api/agent/menu-manifest \
  -H "X-Device-Token: <DEVICE_AGENT_TOKEN>" | jq '.menus[] | select(.target_type=="form_app_entry")'
```

**验收**：含 `form_app_code`、`form_app_page_key`。

## 3. 打开运行时

1. Agent 首页点击磁贴（或 Intent 触发 `form_app_entry`）。
2. 进入 `FormAppActivity`，URL 为 `/form-app/runtime/<code>?page=<page_key>`。

**验收**：表单页渲染，无 401；Network 请求带 `X-Device-Token`。

## 4. 扫码跳转

1. 设计器配置事件路由：`barcode` + `prefix` + `EMP-` → `detail` 页。
2. 运行时点击右下角「扫」FAB 或物理扫码枪输入 `EMP-001`。
3. Bridge 调用 `eventManager.emit('barcode', ...)` → `POST /api/form-app/agent-runtime/match-event`。

**验收**：跳转到 `detail` 页；`param_mapping` 参数注入表单。

## 5. 自动化回归

```bash
cd server && go test ./tests -run TestPhaseD_FormAppAgentE2E -v -count=1 -p 1
```

## 故障排查

| 现象 | 可能原因 |
|------|----------|
| WebView 401 | 未走 agent-runtime API；检查 `AndroidBridge.getDeviceToken()` |
| 菜单不出现 | `deploy-to-devices` 未 bump revision；Agent 未同步 |
| 扫码无跳转 | 事件路由未启用 / matcher 不匹配；看 match-event 响应 |
