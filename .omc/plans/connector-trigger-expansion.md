# Connector Trigger Expansion — Architectural Plan

## 1. Executive Summary

当前出站连接器系统仅支持设备自定义事件触发（`trigger_type = "event"`）。本次扩展新增五种触发类型——Webhook 入站、HTTP 轮询、WebSocket 订阅、DataInterface 数据轮询、外部通道（MQTT/Kafka）——同时保持现有事件触发流程完全不变。所有触发类型最终都汇聚到同一入口 `RunConnectorOutbound`（`server/outbound/phased_runner.go`）。

---

## 2. 现有架构理解

### 数据流（当前，事件触发）

```
Device event via WS → event.go → NotifyDeviceEvent (dispatch.go)
  → processDeviceEvent: 查找连接器绑定，应用防抖
    → RunConnectorOutbound (phased_runner.go)
      → RunPhasedConnector: 遍历 phase → runOneLoadedStep → ExecuteHTTPWebhook / AgentStep / ...
        → 持久化 OutboundDelivery 记录
```

### 关键观察

- `OutboundConnector`（`models/outbound.go`）目前无触发类型字段，唯一触发路径是 `dispatch.go` 的 `processDeviceEvent`
- `OutboundDelivery` 使用 `device_event_id` 作为来源引用——非事件触发须合成一条 `DeviceEvent`
- `RunConnectorOutbound(connector, rec, dev, def)` 接收 `models.DeviceEvent` 作为上下文载体；`render.go` 中已有 `dev == nil` 和 `def == nil` 的判空保护
- `datastack.StartBufferPollers` 是现有后台轮询的参考模式

---

## 3. 模型变更 — `OutboundConnector`

### 3.1 新增字段

```go
// In models/outbound.go — OutboundConnector struct
TriggerType   string `gorm:"column:trigger_type;size:40;not null;default:event" json:"trigger_type"`
// Values: event | webhook | http_poll | websocket | data_poll | channel
TriggerConfig string `gorm:"column:trigger_config;type:text" json:"trigger_config,omitempty"`
// JSON blob；schema 依 trigger_type 而定（见第 4 节）
```

**向后兼容：** GORM AutoMigrate 以 `DEFAULT 'event'` 添加列，所有旧行自动获得 `trigger_type = 'event'`，无数据迁移。

### 3.2 `OutboundDelivery` 策略

**推荐 Option A：合成 DeviceEvent 行**

在触发连接器管道之前，插入一条最小化 `DeviceEvent`：
- `device_id = 0`（哨兵设备）
- `event_type = "_trigger.<type>.<connectorID>"`
- `event_data = <触发 payload JSON>`

优点：`device_event_id NOT NULL` 保持不变，现有 delivery 列表/过滤 API 无需修改，零 schema 变更。

```go
// In server/outbound/trigger_event.go (新文件)
func SyntheticTriggerEvent(db *gorm.DB, connectorID uint, triggerType string, payload []byte) (models.DeviceEvent, error)
```

### 3.3 `definition_ids` 校验调整

`validateConnectorIn` 当前强要求 `definition_ids` 非空。需将此校验限定于 `trigger_type == "event"`；其他触发类型 `definition_ids` 可为空。

---

## 4. 各触发类型详细规格

### 4.1 `webhook` — 外部应用调入 HTTP 端点

**`trigger_config` JSON：**
```json
{
  "auth_method": "none | hmac_sha256 | bearer_token | basic_auth",
  "secret": "...",
  "token": "...",
  "username": "...",
  "password": "...",
  "max_body_bytes": 1048576
}
```

**实现：**
新增 Gin 路由（开放端点，无 JWT 验证，由 webhook 自身 auth 保护）：
```
POST /api/open/v1/connectors/:id/webhook
```

处理器（`api/outbound_trigger_webhook.go`）：
1. 加载连接器，校验 `trigger_type == "webhook"` 且 `enabled == true`
2. 读取 body（上限 `max_body_bytes`，默认 1 MB）
3. 调用 `verifyTriggerWebhookAuth(c, config, body)` 验证签名/令牌
4. 调用 `SyntheticTriggerEvent(db, connector.ID, "webhook", body)`
5. `go RunConnectorOutbound(connector, triggerEvent, nil, nil)`
6. 返回 `{"ok": true, "trigger_event_id": N}`

**生命周期：** 无后台 goroutine，路由常驻，`enabled` 标志控制执行。

---

### 4.2 `http_poll` — 服务器轮询外部 HTTP API

**`trigger_config` JSON：**
```json
{
  "url": "https://external.api/data",
  "method": "GET",
  "headers": {"Authorization": "Bearer xxx"},
  "body": "",
  "interval_sec": 60,
  "timeout_ms": 15000,
  "condition_jq": ".data | length > 0",
  "dedupe_field": ".checksum"
}
```

**Go struct：**
```go
type HTTPPollTriggerConfig struct {
    URL         string            `json:"url"`
    Method      string            `json:"method"`
    Headers     map[string]string `json:"headers"`
    Body        string            `json:"body"`
    IntervalSec int               `json:"interval_sec"`
    TimeoutMS   int               `json:"timeout_ms"`
    ConditionJQ string            `json:"condition_jq"`
    DedupeField string            `json:"dedupe_field"`
}
```

**goroutine 骨架：**
```go
func runHTTPPollTrigger(ctx context.Context, db *gorm.DB, connector models.OutboundConnector, cfg HTTPPollTriggerConfig) {
    ticker := time.NewTicker(time.Duration(cfg.IntervalSec) * time.Second)
    defer ticker.Stop()
    lastDedupeVal := ""
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            body, err := doHTTPPoll(ctx, cfg)
            if err != nil { log.Printf(...); continue }
            if cfg.DedupeField != "" {
                val := extractJSONField(body, cfg.DedupeField)
                if val == lastDedupeVal { continue }
                lastDedupeVal = val
            }
            trigEv, _ := SyntheticTriggerEvent(db, connector.ID, "http_poll", body)
            RunConnectorOutbound(connector, trigEv, nil, nil)
        }
    }
}
```

---

### 4.3 `websocket` — 服务器订阅外部 WebSocket

**`trigger_config` JSON：**
```json
{
  "url": "wss://external.service/stream",
  "headers": {"Authorization": "Bearer xxx"},
  "subscribe_message": "{\"action\":\"subscribe\",\"channel\":\"events\"}",
  "reconnect_delay_sec": 5,
  "max_message_bytes": 1048576,
  "ping_interval_sec": 30
}
```

**goroutine 骨架（带自动重连）：**
```go
func runWebSocketTrigger(ctx context.Context, db *gorm.DB, connector models.OutboundConnector, cfg WebSocketTriggerConfig) {
    for {
        select {
        case <-ctx.Done(): return
        default:
        }
        err := connectAndReadWS(ctx, db, connector, cfg)
        if err != nil && ctx.Err() == nil {
            select {
            case <-ctx.Done(): return
            case <-time.After(time.Duration(cfg.ReconnectDelaySec) * time.Second):
            }
        }
    }
}
```

---

### 4.4 `data_poll` — 轮询 DataInterface 查询结果

**`trigger_config` JSON：**
```json
{
  "interface_id": 12,
  "params": {"status": "pending"},
  "interval_sec": 30,
  "fire_if_empty": false,
  "mark_processed_sql": "UPDATE items SET processed=1 WHERE id IN (?)",
  "dedupe_hash_fields": ["id", "updated_at"]
}
```

**关键集成点：** 需从 `api/` 层提取一个可复用的 `datastack.ExecDataInterface(db, interfaceID, params)` 函数（返回 `[]map[string]interface{}`），避免通过 Gin context 调用。

---

### 4.5 `channel` — 订阅 MQTT / Kafka

**`trigger_config` JSON：**
```json
{
  "kind": "mqtt | kafka",
  "mqtt": {
    "broker": "tcp://localhost:1883",
    "client_id": "connector-42",
    "topic": "devices/+/events",
    "qos": 1,
    "username": "",
    "password": ""
  },
  "kafka": {
    "brokers": ["localhost:9092"],
    "topic": "device-events",
    "group_id": "connector-42",
    "rest_proxy_url": ""
  },
  "max_message_bytes": 1048576
}
```

**注意：** 每个连接器独立创建 MQTT/Kafka 客户端，与全局单例分离（全局客户端仅用于发布）。

---

## 5. TriggerManager — 统一生命周期控制器

**文件：** `server/outbound/trigger_manager.go`

```go
type triggerHandle struct {
    cancel context.CancelFunc
    done   chan struct{}
}

var (
    tmMu      sync.Mutex
    tmHandles = map[uint]*triggerHandle{}
)

// StartTrigger 启动连接器的后台触发 goroutine（若已有则先停止旧的）
func StartTrigger(db *gorm.DB, connector models.OutboundConnector)

// StopTrigger 取消并等待连接器 goroutine 退出
func StopTrigger(connectorID uint)

// InitTriggerManager 服务启动时恢复所有活跃非事件连接器
func InitTriggerManager(db *gorm.DB)

func dispatchTrigger(ctx context.Context, db *gorm.DB, connector models.OutboundConnector)
```

### 钩子点

| 位置 | 操作 |
|---|---|
| `main.go` 启动时（`database.Init` 之后） | `outbound.InitTriggerManager(database.DB)` |
| `CreateOutboundConnector` 事务提交后 | `outbound.StartTrigger(database.DB, co)` |
| `UpdateOutboundConnector` 事务提交后 | `outbound.StartTrigger(database.DB, co)` |
| `DeleteOutboundConnector` 删除前/后 | `outbound.StopTrigger(id)` |

---

## 6. API 变更

### 6.1 请求结构体

```go
type outboundConnectorIn struct {
    // ... 现有字段 ...
    TriggerType   string          `json:"trigger_type"`
    TriggerConfig json.RawMessage `json:"trigger_config"`
}
```

### 6.2 校验逻辑

- `trigger_type` 为空时默认 `"event"`
- `trigger_type == "event"` 时：`definition_ids` 必填（现有逻辑不变）
- 其他类型：`phases` 必填，`definition_ids` 可选；`trigger_config` 必须通过类型专属校验

### 6.3 响应

`connectorDetail()` 响应增加 `trigger_type` 和 `trigger_config`（敏感字段脱敏：`password`、`secret`、`token`）。

### 6.4 新路由

```go
// router.go — 开放端点
r.POST("/api/open/v1/connectors/:id/webhook", TriggerConnectorWebhook)
```

---

## 7. DB 迁移策略

### 幂等 ALTER TABLE（兼容 SQLite & MySQL）

```go
// database/migrate_outbound_trigger.go
func MigrateOutboundConnectorTrigger(db *gorm.DB) {
    if !db.Migrator().HasColumn(&models.OutboundConnector{}, "trigger_type") {
        db.Exec("ALTER TABLE outbound_connectors ADD COLUMN trigger_type VARCHAR(40) NOT NULL DEFAULT 'event'")
    }
    if !db.Migrator().HasColumn(&models.OutboundConnector{}, "trigger_config") {
        db.Exec("ALTER TABLE outbound_connectors ADD COLUMN trigger_config TEXT")
    }
}
```

从 `database.Init` 调用此函数。`outbound_deliveries` 表**无需变更**（使用 SyntheticTriggerEvent 策略）。

---

## 8. 模板变量扩展

非事件触发时在 `render.go` 中额外填充：
```go
if strings.HasPrefix(rec.EventType, "_trigger.") {
    v["{{trigger.type}}"]        = strings.SplitN(rec.EventType, ".", 3)[1]
    v["{{trigger.connector_id}}"] = fmt.Sprintf("%d", connector.ID)
    v["{{trigger.payload}}"]     = rec.EventData
}
```

---

## 9. 新增文件结构

```
server/outbound/
  trigger_manager.go          # TriggerManager: StartTrigger, StopTrigger, InitTriggerManager
  trigger_event.go            # SyntheticTriggerEvent helper
  trigger_http_poll.go        # HTTPPollTriggerConfig + runHTTPPollTrigger
  trigger_websocket.go        # WebSocketTriggerConfig + runWebSocketTrigger
  trigger_data_poll.go        # DataPollTriggerConfig + runDataPollTrigger
  trigger_channel.go          # ChannelTriggerConfig + runChannelTrigger (MQTT + Kafka)

server/api/
  outbound_trigger_webhook.go # TriggerConnectorWebhook Gin handler

server/database/
  migrate_outbound_trigger.go # 幂等 ALTER TABLE helper
```

---

## 10. 前端影响

1. **触发类型选择器**：`event`（默认）| `webhook` | `http_poll` | `websocket` | `data_poll` | `channel`
2. **条件表单区块**：
   - `event`：现有 definition_ids 多选（不变）
   - `webhook`：认证方式 + 密钥/令牌字段
   - `http_poll`：URL、method、headers K/V 编辑器、interval_sec
   - `websocket`：URL、headers、subscribe_message、reconnect_delay_sec
   - `data_poll`：DataInterface 下拉选择、params K/V 编辑器、interval_sec
   - `channel`：MQTT/Kafka 切换 + 各自子表单
3. **连接器列表/详情**：显示触发类型 badge；`webhook` 类型显示可复制的接收 URL
4. **投递日志**：非事件投递显示"触发 Payload"标签替代设备事件上下文

---

## 11. 建议追加的触发类型

| 类型 | 说明 | 典型场景 |
|---|---|---|
| `cron` | Cron 表达式定时触发（如 `0 9 * * MON-FRI`） | 日报、定时同步 |
| `file_watch` | 监听目录新文件（`fsnotify`） | 处理本地导入文件 |
| `db_cdc` | 数据库变化捕获（带水位线，比 `data_poll` 更高效） | 高频订单/状态变化 |
| `system_event` | 订阅内部事件总线（device.online/offline/install.completed） | 设备生命周期 |
| `email_inbound` | 邮件 Webhook（SendGrid/Mailgun Inbound Parse） | 邮件驱动工作流 |

---

## 12. 实施顺序（最低耦合优先）

| 步骤 | 任务 | 估时 |
|---|---|---|
| 1 | 模型 + migration | 1天 |
| 2 | API 校验 + 响应变更 | 1天 |
| 3 | `SyntheticTriggerEvent` helper | 0.5天 |
| 4 | `TriggerManager` 骨架 + startup hook | 1天 |
| 5 | `webhook` 触发器 | 1天 |
| 6 | `http_poll` | 1.5天 |
| 7 | `websocket` | 2天 |
| 8 | `data_poll` | 2天 |
| 9 | `channel` MQTT | 1.5天 |
| 10 | `channel` Kafka | 2天 |
| 11 | 前端表单（可并行） | 3-5天 |

---

## 13. 关键文件

- `server/models/outbound.go`
- `server/outbound/phased_runner.go`
- `server/outbound/dispatch.go`
- `server/api/outbound.go`
- `server/database/db.go`
- `server/main.go`
