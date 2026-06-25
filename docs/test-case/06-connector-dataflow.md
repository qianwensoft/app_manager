# 连接器与数据流测试用例

## 架构说明

```
外部数据源 → 连接器通道 → 后端数据处理 → STOMP 推送 → 前端组态画面
                ↑
    Android 事件 / Webhook / HTTP 轮询 / MQTT / Kafka / WebSocket
```

---

## TC-CONN-001 Android 事件触发数据流

**目标**：Android 设备事件通过 OutboundConnector 触发数据更新并推送到组态

**前置**：
- 已创建 CustomEventDefinition（key=`device.sensor.update`）
- 已创建 OutboundConnector 绑定该事件
- 组态元素绑定了对应数据点

**步骤**：
1. Android Agent 触发自定义事件：
```json
{
  "event_key": "device.sensor.update",
  "data": {"pump1.speed": 75.5, "tank1.level": 42.0}
}
```
2. 观察 STOMP `/topic/scada/point-data/{scada_code}` 消息

**期望结果**：
- 组态画面元素数值更新为 75.5 / 42.0
- OutboundDelivery 记录状态为 `success`

---

## TC-CONN-002 外部 Webhook 接入

**目标**：外部系统通过 Webhook 推送数据到组态

**前置**：已创建 OutboundWebhook（auth_method=token_header）

**步骤**：
```bash
curl -s -X POST http://localhost:18080/api/open/v1/ingress/webhook/<webhook_id> \
  -H "X-Webhook-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"pump1.speed": 88.0, "tank1.level": 55.0}'
```

**期望结果**：
- HTTP 200
- 绑定该 Webhook 的 Dataset 收到数据
- 如配置了 STOMP 广播，组态画面实时更新

---

## TC-CONN-003 HTTP 接口轮询（设计态）

**目标**：设计模式下元素通过 HTTP DataInterface 轮询数据

**前置**：
- 已创建 DataInterface（code=`sensor-data`，kind=query）
- 元素 `pointBinding.dataMode` = `"http"`

**步骤**：
1. 打开组态预览页面
2. 打开浏览器 DevTools → Network
3. 过滤 `/api/open/v1/data/sensor-data`

**期望结果**：
- 每 N 秒发起一次 HTTP GET/POST 请求
- 响应数据正确映射到元素属性
- 无 WebSocket 连接（纯 HTTP 模式）

---

## TC-CONN-004 STOMP 推送（发布态）

**目标**：发布模式下元素通过 STOMP 接收实时数据

**前置**：
- 组态已发布
- 元素 `pointBinding.dataMode` = `"stomp"`
- 已创建模拟点位

**步骤**：
1. 打开发布预览 URL：`http://localhost:18080/preview/<scada_code>`
2. 打开 DevTools → Network → WS
3. 观察 `/ws/stomp` 连接

**期望结果**：
- WebSocket 连接建立
- STOMP CONNECT 帧发送
- 订阅 `/topic/scada/point-data/<scada_code>`
- 每秒收到数据帧，元素数值更新

---

## TC-CONN-005 MQTT 数据接入

**目标**：外部 MQTT 消息触发组态数据更新

**前置**：
- `config.yaml` 中 `mqtt.enabled=true`，broker 已配置
- 已创建 CustomEventGroup（mqtt_enabled=true，mqtt_topic=`scada/data`）

**步骤**：
```bash
# 使用 mosquitto_pub 发布消息
mosquitto_pub -h localhost -t "scada/data" \
  -m '{"event_key":"sensor.update","device_id":1,"data":{"pump1.speed":60}}'
```

**期望结果**：
- 服务器收到 MQTT 消息
- 触发对应 CustomEventDefinition
- STOMP 广播到订阅的组态画面

---

## TC-CONN-006 数据模式切换（STOMP ↔ HTTP）

**目标**：同一组态在设计态和发布态使用不同数据模式

**步骤**：
1. 设计态（编辑器）：元素数据模式 = HTTP 轮询
2. 发布态（预览页）：元素数据模式 = STOMP 推送
3. 分别打开两个页面，观察 Network

**期望结果**：
- 编辑器页面：只有 HTTP 请求，无 WS 连接
- 预览页面：有 WS 连接，无轮询请求
- 两种模式数据值一致

---

## TC-CONN-007 权限过期跳转

**目标**：访问权限过期后跳转到提醒页面

**前置**：已创建 ScadaAccessPolicy（expire_at=过去时间，expire_url=/expired.html）

**步骤**：
1. 访问 `http://localhost:18080/preview/<scada_code>?token=<share_token>`
2. 等待权限检查

**期望结果**：
- 页面跳转到 `expire_url` 指定的地址
- 显示权限过期提醒界面
- 不展示组态内容

---

## TC-CONN-008 设备权限限制

**目标**：只有授权设备才能访问组态

**前置**：已创建 ScadaAccessPolicy（target_type=device，target_id=1）

**步骤**：
1. 设备 ID=1 访问组态 → 正常显示
2. 设备 ID=2 访问同一组态 → 拒绝访问

**期望结果**：
- 授权设备：正常加载组态
- 未授权设备：返回 403 或跳转提醒页
