# 水平扩展设计（E5）

> 多实例部署时，Agent WebSocket 与浏览器 STOMP 订阅可能落在不同进程。本设计用 **Redis Pub/Sub** 做跨实例事件总线，Agent 命令按设备路由到持有连接的节点。

## 1. 现状（单机）

```
Browser ──STOMP──► stomp.DefaultHub (进程内 map)
Agent   ──WS────► agent.AgentHub   (进程内 map)
                      │
                      ├──► screen.ScreenHub (同进程 Viewer)
                      └──► stomp 推送（设备事件、组态点位等）
```

所有 Hub 均为**进程内内存**，第二台 Server 无法收到第一台上的 Agent 连接或 STOMP 订阅。

## 2. 目标拓扑

```
                    ┌─────────────┐
                    │   Nginx /   │
                    │   LB        │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │ Node A  │    │ Node B  │    │ Node C  │
      │ :8080   │    │ :8080   │    │ :8080   │
      └────┬────┘    └────┬────┘    └────┬────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                    ┌─────────────┐
                    │   Redis     │
                    │  Pub/Sub    │
                    │  + 注册表   │
                    └─────────────┘
           ┌───────────────┴───────────────┐
           ▼                               ▼
      Agent WS (粘性)                  Browser STOMP (任意节点)
      固定连某一 Node                   订阅通过 Redis 收到全集群发布
```

## 3. 已实现

| 能力 | 通道 / 键 | 说明 |
|------|-----------|------|
| STOMP 镜像 | Pub/Sub `app-manager:cluster` | 本节点 `PublishJSON` 同时广播；对端节点投递本地订阅者 |
| Agent 命令转发 | envelope `kind=agent_cmd` | `AgentHub.Send` 本地无连接时查 Redis 并转发 |
| Agent 在线注册 | Key `am:agent:{deviceID}` → `node_id` TTL 120s | Register/Unregister 时写入/删除 |
| 屏幕二进制中继 | Pub/Sub `app-manager:screen:{deviceID}` | Agent 节点发布 MJPEG；其他节点 `PSUBSCRIBE` 后本地 `BroadcastBinary` |
| 屏幕 JSON 中继 | envelope `kind=screen_text` | `screen_meta` / `screen_pong` / 旧版 `screen_frame` |
| Shell 中继 | envelope `kind=shell_out` | body 为 base64 二进制输出 |
| Logcat 中继 | envelope `kind=logcat_out` | body 为文本行 |
| WebRTC 摄像头 | Pub/Sub `app-manager:webrtc-rtp:{id}\|{camera}` + 信封 | Agent 节点 SFU 收 RTP → Redis 中继 → 远端节点写本地 Viewer track；`webrtc_track_ready` / `webrtc_camera_error` / `webrtc_stop_camera` |
| 摄像头观众计数 | Key `am:viewers:camera:{id}:{camera}` | 全集群首连 `start_camera`、末连 `stop_camera` |
| 摄像头 track 状态 | Key `am:webrtc:track:{id}:{camera}` | 晚加入 Viewer 可立即拿到 codec 并收 offer |
| 跨节点观众计数 | Key `am:viewers:screen:{deviceID}` | 任意节点首连触发 `start_screen`（经 Agent 转发） |
| Agent 路由 API | `GET /api/settings/cluster/agent-route/:deviceKey` | 返回 `node_id` / `online`（admin） |
| Prometheus | `GET /metrics` | `cluster_redis_publish_total`、`agent_forward_total`、`screen_relay_publish_total` 等 |

配置（`config.yaml`）：

```yaml
cluster:
  enabled: false
  node_id: ""          # 空则 hostname
  redis_url: "redis://127.0.0.1:6379/0"
```

代码入口：`server/cluster/`，`main.go` 中 `cluster.Init()`。

Nginx 示例：`docs/deploy/nginx/cluster-upstream.conf.example`。

## 4. 负载均衡建议

### 4.1 Agent WebSocket（必须粘性）

```
/ws/agent/:deviceToken  →  ip_hash 或 cookie 粘性会话
```

Agent 长连接不宜在实例间迁移；换节点需 Agent 重连。

### 4.2 浏览器 STOMP / REST

任意节点均可；STOMP 已通过 Redis 镜像。REST 无状态（JWT/API Key + 共享 DB）。

### 4.3 屏幕 MJPEG

**已实现 Redis 中继**：Viewer 可连任意节点；Agent 所在节点将二进制帧发布到 `app-manager:screen:{id}`。

仍可选 **粘性** 方案（不经 Redis、延迟更低）：Viewer 与 Agent 路由到同一 `node_id`（查 `am:agent:{id}` 或 agent-route API）。

### 4.4 Shell / Logcat / Camera WebRTC

Shell / Logcat 已通过 Redis envelope 中继（Viewer 可任意节点）。

Camera WebRTC：**已实现 RTP 中继**。Agent 与 Publisher PC 仍在 Agent 所在节点；浏览器 `/ws/camera/:id` 可连任意节点，信令在本地完成，RTP 经 Redis 扇出。晚加入 Viewer 读 `am:webrtc:track:*` 获取 codec。

## 5. 消息信封

```json
{
  "origin_node": "host-a",
  "kind": "stomp",
  "topic": "/topic/devices",
  "body": "{...}"
}
```

```json
{
  "origin_node": "host-b",
  "kind": "agent_cmd",
  "device_id": "42",
  "body": "{\"type\":\"command\",...}"
}
```

```json
{
  "origin_node": "host-a",
  "kind": "shell_out",
  "device_id": "42",
  "body": "<base64>"
}
```

屏幕二进制帧使用独立 Redis 频道（非 JSON），载荷前缀 `origin_node\0` + 原始 MJPEG 头与 JPEG，订阅方忽略本节点 origin 以防回环。

接收方忽略 `origin_node == 本节点` 的 JSON 信封，防止回环。

## 6. 部署示例（docker-compose 片段）

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  app-manager-1:
    image: app-manager:latest
    environment:
      - JWT_SECRET=shared-secret
    volumes:
      - ./config.cluster.yaml:/app/config.yaml
    depends_on: [redis, mysql]

  app-manager-2:
    image: app-manager:latest
    volumes:
      - ./config.cluster.yaml:/app/config.yaml
    depends_on: [redis, mysql]
```

`config.cluster.yaml` 要点：`cluster.enabled: true`、同一 `redis_url`、**共享 MySQL**（SQLite 仅适合单实例）。

## 7. 后续（可选）

- [ ] OpenResty 动态 upstream（调用 agent-route API 选后端）
- [ ] Redis Stream 持久化（Pub/Sub 无持久化）

## 8. 验证

```bash
# 单节点（cluster 关闭）行为不变
cd server && go test ./cluster -count=1

# 双节点手验（需 Redis）：
# 1. 两实例 cluster.enabled=true，共用 Redis + MySQL
# 2. Agent 连 node-1，浏览器 STOMP 连 node-2
# 3. 触发设备事件 → node-2 浏览器应收到 STOMP MESSAGE
# 4. 浏览器经 node-2 下发 Agent 命令 → node-1 Agent 应执行
# 5. 浏览器经 node-2 打开 /ws/screen/:id → 应收到 node-1 Agent 画面
# 6. curl /metrics 应见 cluster_redis_publish_total
# 7. 浏览器经 node-2 打开 /ws/camera/:id?camera=back → 应收到 node-1 Agent 画面
```
