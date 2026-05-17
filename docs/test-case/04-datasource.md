# 数据源 MCP 测试用例

## 前置条件
- 已创建至少一个 DataSource（SQLite 类型）
- 已创建至少一个 Dataset（kind=query 或 kind=static）
- 已创建至少一个 DataInterface

---

## TC-DS-001 list_datasources

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_datasources","params":{}}' | jq '.result.items[] | {id,code,name,type}'
```

**期望结果**：返回数据源列表，不含 DSN 明文

---

## TC-DS-002 list_datasets

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"list_datasets","params":{}}' | jq '.result.items[] | {id,code,name,kind}'
```

---

## TC-DS-003 query_dataset（static 类型）

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"query_dataset","params":{"dataset_id":1}}' | jq '.result'
```

**期望结果**：`result.kind` = "static"，`result.rows` 为数组

---

## TC-DS-004 query_dataset（query 类型）

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"query_dataset",
    "params":{"dataset_id":2,"params":{},"limit":10}
  }' | jq '.result'
```

**期望结果**：`result.kind` = "query"，`result.rows` 为数组，长度 <= 10

---

## TC-DS-005 bind_data_to_canvas

**目标**：批量为画布元素绑定数据点

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":5,"method":"bind_data_to_canvas",
    "params":{
      "scada_id":1,"canvas_id":1,
      "bindings":[
        {"element_id":"el_1","point_key":"pump1.speed","device_code":"PLC001","data_mode":"stomp"},
        {"element_id":"el_2","point_key":"tank1.level","device_code":"PLC001","data_mode":"http"}
      ]
    }
  }' | jq .
```

**期望结果**：`result.ok` = true，`get_canvas` 后对应元素含 `pointBinding` 字段

---

## TC-DS-006 list_sim_points

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"list_sim_points","params":{"scada_code":"test-scada"}}' | jq .
```

---

## TC-DS-007 create_sim_point

**目标**：创建模拟点位用于演示

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":7,"method":"create_sim_point",
    "params":{
      "scada_code":"test-scada",
      "link_name":"pump1.speed",
      "mode":"sine",
      "interval_ms":1000,
      "params_json":"{\"min\":0,\"max\":100,\"period\":10}"
    }
  }' | jq .
```

**期望结果**：`result.ok` = true，`result.id` > 0，STOMP 订阅后可收到该点位数据

---

## TC-DS-008 STOMP 实时数据验证

**目标**：验证模拟点位数据通过 STOMP 推送到前端

**步骤**：
1. 创建模拟点位（TC-DS-007）
2. 打开浏览器开发者工具 → Network → WS
3. 连接 `/ws/stomp`
4. 订阅 `/topic/scada/point-data/test-scada`
5. 等待 1-2 秒

**期望结果**：每秒收到包含 `pump1.speed` 键的 JSON 消息，值在 0-100 之间变化
