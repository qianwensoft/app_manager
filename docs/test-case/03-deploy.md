# 组态下发测试用例

## 前置条件
- 至少一台 Android 设备已连接并在线（`status=online`）
- 组态 scada_id=1 已发布（`publish_status=1`）
- 已创建部门和设备分组数据

---

## TC-DEPLOY-001 list_devices

**目标**：列出所有设备

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_devices","params":{}}' | jq '.result.items[] | {id,name,status}'
```

**期望结果**：返回设备列表，每项含 `id`, `name`, `status`, `agent_connected`

---

## TC-DEPLOY-002 list_device_groups

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"list_device_groups","params":{}}' | jq .
```

---

## TC-DEPLOY-003 list_departments

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"list_departments","params":{}}' | jq .
```

---

## TC-DEPLOY-004 deploy_scada 按设备下发

**目标**：将组态直接下发到指定设备

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"deploy_scada",
    "params":{
      "scada_id":1,
      "target_type":"device",
      "target_ids":[1],
      "deploy_mode":"webview",
      "rule_name":"测试下发-设备1"
    }
  }' | jq .
```

**期望结果**：
- `result.ok` = true
- `result.total_devices` = 1
- `result.success` = 1
- Android 设备 Agent 菜单出现对应组态入口

---

## TC-DEPLOY-005 deploy_scada 按部门下发

**目标**：将组态下发到整个部门的所有设备

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":5,"method":"deploy_scada",
    "params":{
      "scada_id":1,
      "target_type":"department",
      "target_ids":[1],
      "deploy_mode":"webview",
      "rule_name":"生产部门全员下发"
    }
  }' | jq '{ok:.result.ok, total:.result.total_devices, success:.result.success}'
```

**期望结果**：`total_devices` = 部门下所有用户关联设备数量

---

## TC-DEPLOY-006 deploy_scada 未发布组态

**目标**：未发布的组态不允许下发

```bash
# 先确保 scada_id=2 未发布
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":6,"method":"deploy_scada",
    "params":{"scada_id":2,"target_type":"device","target_ids":[1],"deploy_mode":"webview"}
  }' | jq .error
```

**期望结果**：`error.code` = -32602，`error.message` 包含 "must be published"

---

## TC-DEPLOY-007 get_deploy_status

**目标**：查询下发记录

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"get_deploy_status","params":{"scada_id":1}}' | jq '.result.items[] | {device_id,status,deployed_at}'
```

**期望结果**：返回下发记录，`status` 为 `success` 或 `failed`

---

## TC-DEPLOY-008 Android 端验证

**目标**：验证 Android 设备收到下发后能正常展示组态

**步骤**：
1. 执行 TC-DEPLOY-004
2. 在 Android 设备上打开 Agent 应用
3. 检查菜单中是否出现组态名称
4. 点击进入，验证 WebView 加载组态预览页面
5. 验证实时数据通过 STOMP 正常更新

**期望结果**：
- 菜单项显示正确的组态名称
- WebView 全屏展示组态画面
- 数据点实时刷新（如有模拟点位）
