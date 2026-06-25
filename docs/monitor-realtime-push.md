# 运行监控实时推送功能实现

## 功能说明

在设置页面的"运行监控"标签中，通过 STOMP WebSocket 实时推送监控数据变化，无需手动刷新页面。

## 实现内容

### 1. 服务器端推送 (Go)

**文件**: `server/agent/sync.go`

**推送时机**:
- Agent 连接时推送
- Agent 断开连接时推送

**推送函数**:
```go
func publishAgentConnectionChange() {
    // 查询当前在线设备数量
    var onlineCount int64
    database.DB.Model(&models.Device{}).
        Where("agent_connected = ?", true).
        Count(&onlineCount)

    // 查询在线设备列表（最多100个）
    var devices []models.Device
    database.DB.Where("agent_connected = ?", true).
        Order("last_seen_at DESC").
        Limit(100).
        Find(&devices)

    // 构建简化的设备信息列表
    agents := make([]map[string]interface{}, 0, len(devices))
    for _, d := range devices {
        agents = append(agents, map[string]interface{}{
            "id":         d.ID,
            "name":       d.Name,
            "serial":     d.Serial,
            "last_seen":  d.LastSeenAt,
        })
    }

    payload := map[string]interface{}{
        "type":         "agent_connection_change",
        "online_count": onlineCount,
        "agents":       agents,
        "timestamp":    time.Now().UTC().Format(time.RFC3339),
    }

    if data, err := json.Marshal(payload); err == nil {
        stomp.DefaultHub.PublishJSON("/topic/monitor/agent-connections", string(data))
    }
}
```

**集成位置**:
```go
func SyncDeviceStatus(deviceID string, connected bool) {
    // ... 更新设备状态 ...
    
    // 推送 Agent 连接状态变化到 STOMP
    publishAgentConnectionChange()
}
```

### 2. 前端订阅 (Vue 3)

**文件**: `web/src/views/Settings.vue`

**STOMP 连接**:
```javascript
const connectMonitorStomp = () => {
  const token = localStorage.getItem('token')
  
  stompClient = new Client({
    brokerURL: `${WS_BASE}/ws/stomp?token=${encodeURIComponent(token)}`,
    reconnectDelay: 5000,
    onConnect: () => {
      // 订阅 Agent 连接变化
      stompClient.subscribe('/topic/monitor/agent-connections', (message) => {
        const data = JSON.parse(message.body)
        if (data.type === 'agent_connection_change') {
          // 实时更新 Agent 连接数据
          agentConn.value = {
            online_count: data.online_count,
            agents: data.agents || []
          }
        }
      })
    }
  })
  
  stompClient.activate()
}
```

**生命周期管理**:
```javascript
// 切换到监控标签时启动
watch(activeTab, (tab) => {
  if (tab === 'monitor' && !monitorLoaded) {
    loadMonitor()
    connectMonitorStomp()
  } else if (tab !== 'monitor') {
    disconnectMonitorStomp() // 离开时断开
  }
})

// 页面加载时如果在监控标签
onMounted(() => {
  if (activeTab.value === 'monitor') {
    loadMonitor()
    connectMonitorStomp()
  }
})

// 组件卸载时清理
onBeforeUnmount(() => {
  disconnectMonitorStomp()
})
```

## STOMP Topic 规范

### `/topic/monitor/agent-connections`

Agent 连接状态变化事件

**消息格式**:
```json
{
  "type": "agent_connection_change",
  "online_count": 5,
  "agents": [
    {
      "id": 1,
      "name": "设备1",
      "serial": "agent-abc123",
      "last_seen": "2026-06-08T12:34:56Z"
    }
  ],
  "timestamp": "2026-06-08T12:34:56Z"
}
```

**字段说明**:
- `type`: 事件类型，固定为 `"agent_connection_change"`
- `online_count`: 当前在线设备总数
- `agents`: 在线设备列表（最多100个，按最后在线时间倒序）
- `timestamp`: 事件发生时间戳（UTC）

## 工作流程

### Agent 上线流程
```
Agent 连接到服务器
  ↓
SyncDeviceStatus(deviceID, true)
  ↓
更新数据库: agent_connected = true, status = online
  ↓
publishAgentConnectionChange()
  ↓
查询当前在线设备数和列表
  ↓
STOMP 推送到 /topic/monitor/agent-connections
  ↓
所有订阅的前端页面实时收到通知
  ↓
agentConn.value 自动更新
  ↓
监控页面实时刷新显示
```

### Agent 下线流程
```
Agent 断开连接
  ↓
SyncDeviceStatus(deviceID, false)
  ↓
更新数据库: agent_connected = false, status = offline
  ↓
publishAgentConnectionChange()
  ↓
STOMP 推送最新在线设备列表
  ↓
前端页面实时更新
```

## 使用体验

### 改进前
1. 打开监控页面，看到 5 个在线设备
2. 一个设备下线
3. **需要手动点击"刷新"按钮**
4. 才能看到更新后的 4 个在线设备

### 改进后
1. 打开监控页面，看到 5 个在线设备
2. 一个设备下线
3. **页面自动实时更新**显示 4 个在线设备
4. 无需任何操作

## 性能优化

### 服务器端
- **防抖优化**: 避免短时间内多次推送（未来可添加）
- **数据精简**: 只推送必要的字段（id, name, serial, last_seen）
- **数量限制**: 在线设备列表最多 100 个
- **异步推送**: STOMP 推送不阻塞主流程

### 前端
- **按需连接**: 只在监控标签页连接 STOMP
- **自动断开**: 切换到其他标签自动断开，节省资源
- **自动重连**: 配置 `reconnectDelay: 5000`，断线自动重连

## 扩展性

### 未来可添加的 Topic

**1. API 调用趋势实时更新**
```
Topic: /topic/monitor/api-calls
触发: 每分钟或每次 API 调用后
数据: 最新的 API 调用统计
```

**2. Agent 在线趋势实时更新**
```
Topic: /topic/monitor/agent-trend
触发: 每分钟采样一次
数据: 最新的在线数趋势点
```

**3. 系统资源监控**
```
Topic: /topic/monitor/system-resources
触发: CPU/内存/磁盘变化超过阈值
数据: 服务器资源使用情况
```

## 测试场景

### 场景 1: 实时监控 Agent 上线
1. 打开监控页面
2. 启动一个 Agent 应用
3. **立即**看到在线数量 +1
4. 在线设备列表自动刷新

### 场景 2: 实时监控 Agent 下线
1. 打开监控页面
2. 强制停止一个 Agent
3. **立即**看到在线数量 -1
4. 该设备从列表中消失

### 场景 3: 多标签页同步
1. 打开两个浏览器标签，都在监控页面
2. 一个 Agent 上线/下线
3. **两个标签页同时实时更新**

### 场景 4: 切换标签优化
1. 打开监控页面（STOMP 连接）
2. 切换到"系统信息"标签
3. STOMP 自动断开（节省资源）
4. 切换回监控页面
5. STOMP 自动重新连接

## 相关文件

### 服务器端
- `server/agent/sync.go` - Agent 状态同步和 STOMP 推送
- `server/stomp/hub.go` - STOMP Hub 实现

### 前端
- `web/src/views/Settings.vue` - 监控页面和 STOMP 订阅
- `web/src/utils/ws.js` - WebSocket 基础 URL

## 构建状态

- ✅ 服务器端推送实现完成
- ✅ 前端 STOMP 订阅完成
- ✅ 生命周期管理完成
- ✅ Go 服务器编译成功

## 技术栈

- **前端**: Vue 3, @stomp/stompjs
- **后端**: Go, Gin, GORM, gorilla/websocket
- **协议**: STOMP over WebSocket
- **认证**: JWT token (query parameter)

## 未来优化建议

1. **批量推送**: 短时间内多个设备变化合并一次推送
2. **增量更新**: 只推送变化的设备，不推送完整列表
3. **推送其他监控数据**: API 趋势、在线趋势等
4. **心跳监控**: 监控 STOMP 连接健康状态
5. **错误重试**: 推送失败时的重试机制
6. **日志记录**: 记录推送事件用于调试
