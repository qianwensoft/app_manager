# AI 生成组态测试用例

## 前置条件
- `CLAUDE_API_KEY` 已配置且有效
- `config.yaml` 中 `claude.model` = `claude-opus-4-5`

---

## TC-AI-001 text_to_canvas 基础生成

**目标**：通过自然语言描述生成组态画布

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"text_to_canvas",
    "params":{
      "description":"水处理厂监控大屏，包含2个进水泵、3个过滤罐、1个出水阀门、实时流量仪表盘",
      "canvas_width":1920,
      "canvas_height":1080,
      "style":"dark"
    }
  }' | jq .
```

**期望结果**：
- `result.canvas_project` 为合法 CanvasProject 对象
- `result.canvas_project.canvases.1.elements` 数组长度 >= 5
- 包含 `dynamic-pump`, `dynamic-tank`, `dynamic-valve`, `echarts-gauge` 类型元素
- 所有元素 `x`, `y`, `width`, `height` 在画布范围内（0-1920, 0-1080）
- `result.usage.input_tokens` > 0

---

## TC-AI-002 text_to_canvas 工业场景

**目标**：生成电力监控场景

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"text_to_canvas",
    "params":{
      "description":"变电站监控界面，包含主变压器、断路器状态、电压电流实时曲线、告警列表",
      "canvas_width":1920,
      "canvas_height":1080,
      "style":"dark"
    }
  }' | jq '.result.canvas_project.canvases["1"].elements | length'
```

**期望结果**：元素数量 >= 8

---

## TC-AI-003 image_to_canvas（需要测试图片）

**目标**：通过图片生成组态画布

```bash
# 将测试图片转为 base64
IMAGE_B64=$(base64 -i /path/to/scada-screenshot.png)

curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"image_to_canvas\",
    \"params\":{
      \"image_base64\":\"data:image/png;base64,${IMAGE_B64}\",
      \"natural_language\":\"工厂设备监控界面\",
      \"canvas_width\":1920,
      \"canvas_height\":1080
    }
  }" | jq '.result.canvas_project.canvases["1"].elements | length'
```

**期望结果**：
- 返回合法 CanvasProject
- 元素布局与图片内容相符
- 无 JSON 解析错误

---

## TC-AI-004 refine_canvas 微调

**目标**：对已有画布进行自然语言微调

**前置**：TC-MCP-004 已保存画布（scada_id=1）

```bash
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"refine_canvas",
    "params":{
      "scada_id":1,
      "instruction":"在画布左上角添加一个标题文字「水处理监控系统」，字号24，颜色白色"
    }
  }' | jq '.result.canvas_project.canvases["1"].elements[] | select(.type=="text")'
```

**期望结果**：
- 返回包含新 `text` 元素的完整 CanvasProject
- 新元素 `text` = "水处理监控系统"，`fontSize` = 24

---

## TC-AI-005 save 生成结果

**目标**：将 AI 生成的画布保存到数据库

```bash
# 1. 生成画布
CANVAS=$(curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"text_to_canvas","params":{"description":"简单测试画布","canvas_width":1920,"canvas_height":1080}}' \
  | jq '.result.canvas_project')

# 2. 保存到 scada_id=1
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"save_canvas\",\"params\":{\"scada_id\":1,\"canvas_data\":${CANVAS}}}" | jq .
```

**期望结果**：`result.ok` = true，前端刷新后可看到 AI 生成的画布

---

## TC-AI-006 错误处理 - API Key 未配置

**目标**：Claude API Key 未配置时返回明确错误

```bash
# 临时清空 api_key（通过 update_server_config）
curl -s -X POST http://localhost:18080/mcp/v1/ \
  -H "X-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"text_to_canvas","params":{"description":"test"}}' | jq .error
```

**期望结果**：`error.code` = -32603，`error.message` 包含 "api_key not configured"
