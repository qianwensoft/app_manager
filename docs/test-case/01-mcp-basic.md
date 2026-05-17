# MCP 基础接口测试用例

## 前置条件
- 服务器运行在 `http://localhost:18080`
- 已创建 API Key（通过 `POST /api/auth/apikey`）
- 环境变量 `CLAUDE_API_KEY` 已配置

---

## TC-MCP-001 list_components

**目标**：验证组件注册表返回所有可用元素类型

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_components","params":{}}' | jq .
```

**期望结果**：
- `result.components` 数组长度 >= 20
- 包含 `rect`, `circle`, `text`, `echarts-gauge`, `dynamic-valve`, `dynamic-pump`, `dynamic-tank`, `dynamic-pipe`
- 每个组件有 `type`, `label`, `category`, `defaults` 字段

---

## TC-MCP-002 list_scada

**目标**：列出所有组态配置

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"list_scada","params":{}}' | jq .
```

**期望结果**：
- `result.items` 为数组
- 每项包含 `id`, `scada_name`, `scada_code`, `publish_status`, `content_version`
- 不包含 `canvas_data`（大字段不在列表中返回）

---

## TC-MCP-003 get_canvas

**目标**：获取指定组态的完整画布数据

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"get_canvas","params":{"scada_id":1}}' | jq .
```

**期望结果**：
- `result.canvas_data` 为对象（非字符串）
- 包含 `version`, `canvases`, `activeCanvasId`

---

## TC-MCP-004 save_canvas

**目标**：保存画布数据并验证版本号递增

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"save_canvas",
    "params":{
      "scada_id":1,
      "canvas_data":{
        "version":1,"activeCanvasId":1,
        "canvasGroups":[{"id":1,"name":"Main","type":"panel"}],
        "canvases":{"1":{"id":1,"name":"Main","width":1920,"height":1080,
          "background":"solid","backgroundColor":"#1a1a2e",
          "showGrid":false,"snapToGrid":false,"gridSize":10,
          "gridColor":"#333","showRuler":false,"zoom":1,
          "viewport":{"x":0,"y":0,"width":1920,"height":1080},
          "elements":[]}}
      }
    }
  }' | jq .
```

**期望结果**：
- `result.ok` = true
- `result.content_version` = 上一次版本 + 1

---

## TC-MCP-005 add_element

**目标**：向画布添加一个矩形元素

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":5,"method":"add_element",
    "params":{
      "scada_id":1,"canvas_id":1,
      "element":{
        "id":"el_test_1","type":"rect","name":"Test Rect",
        "x":100,"y":100,"width":200,"height":100,
        "rotation":0,"visible":true,"locked":false,"zIndex":1,
        "fill":"#4a90d9","stroke":"#2c5f8a","strokeWidth":1,"opacity":1
      }
    }
  }' | jq .
```

**期望结果**：`result.ok` = true

**验证**：再次调用 `get_canvas`，确认 `elements` 数组包含 `id=el_test_1` 的元素

---

## TC-MCP-006 update_element

**目标**：更新元素的颜色和位置

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":6,"method":"update_element",
    "params":{
      "scada_id":1,"canvas_id":1,"element_id":"el_test_1",
      "patch":{"fill":"#ff0000","x":200}
    }
  }' | jq .
```

**期望结果**：`result.ok` = true，元素 `fill` 变为 `#ff0000`，`x` 变为 200

---

## TC-MCP-007 delete_element

**目标**：删除指定元素

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":7,"method":"delete_element",
    "params":{"scada_id":1,"canvas_id":1,"element_id":"el_test_1"}
  }' | jq .
```

**期望结果**：`result.ok` = true，再次 `get_canvas` 后 `elements` 中不含该元素

---

## TC-MCP-008 publish_scada

**目标**：发布组态

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":8,"method":"publish_scada","params":{"scada_id":1}}' | jq .
```

**期望结果**：`result.ok` = true，数据库中 `publish_status` = 1

---

## TC-MCP-009 错误处理 - 方法不存在

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":9,"method":"nonexistent","params":{}}' | jq .
```

**期望结果**：`error.code` = -32601，`error.message` 包含 "method not found"

---

## TC-MCP-010 错误处理 - 无 API Key

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":10,"method":"list_components","params":{}}' | jq .
```

**期望结果**：HTTP 401 或 403
