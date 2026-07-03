# 运行监控增强与性能优化实现报告

**日期**: 2026-06-30  
**实现人**: Claude  

## 概述

本次更新实现了三个主要功能：
1. 运行监控显示 Agent 版本、WebView 版本和在线时长
2. 设备 ID 可点击跳转 + 支持搜索过滤
3. 优化设备实时状态更新以避免慢 SQL

---

## 1. 运行监控显示增强

### 功能描述
在"系统管理 - 运行监控 - Agent 在线连接"表格中新增三列：
- **Agent 版本**: 显示 Agent APK 版本号
- **WebView 版本**: 显示系统 WebView 组件版本
- **在线时长**: 显示设备从连接到现在的持续在线时间

### 后端修改

#### 1. 数据模型更新
**文件**: `server/models/models.go`
- Device 模型新增 `WebViewVersion` 字段

```go
WebViewVersion string `gorm:"column:webview_version;size:50;default:''" json:"webview_version"`
```

#### 2. Agent 连接追踪
**文件**: `server/agent/hub.go`
- Connection 结构体新增 `ConnectedAt` 字段记录连接时间
- 新增 `GetConnectionTime()` 方法获取连接时间

```go
type Connection struct {
    DeviceID      string
    Conn          *websocket.Conn
    send          chan []byte
    ConnectedAt   time.Time  // 新增
}
```

#### 3. 心跳数据接收
**文件**: `server/agent/sync.go`
- 心跳处理中接收并存储 `webview_version`

```go
if wv, ok := strFromInfo(info["webview_version"]); ok && wv != "" {
    updates["webview_version"] = wv
}
```

#### 4. API 响应增强
**文件**: `server/api/system_monitor.go`
- `GetAgentConnections` API 返回新增字段

```go
type agentEntry struct {
    // ... 原有字段
    AgentVersion   string `json:"agent_version"`
    WebViewVersion string `json:"webview_version"`
    OnlineDuration int64  `json:"online_duration"` // seconds
}
```

### Android Agent 修改

#### 1. 协议定义
**文件**: `agent/app/src/main/java/com/appmanager/agent/ws/Protocol.kt`
- DeviceInfoData 新增 `webViewVersion` 字段

```kotlin
@SerializedName("webview_version") val webViewVersion: String = ""
```

#### 2. 数据采集
**文件**: `agent/app/src/main/java/com/appmanager/agent/service/DeviceInfoPayload.kt`
- 实现 WebView 版本获取逻辑

```kotlin
val webViewVersion = try {
    val pm = context.packageManager
    // 尝试获取 Android System WebView
    try {
        pm.getPackageInfo("com.google.android.webview", 0).versionName ?: ""
    } catch (_: Exception) {
        // 回退到 Chrome（Android 7+ Chrome 可作为 WebView 提供者）
        pm.getPackageInfo("com.android.chrome", 0).versionName ?: ""
    }
} catch (_: Exception) {
    ""
}
```

### 前端修改

**文件**: `web/src/views/Settings.vue`

#### 1. 表格列新增
```vue
<el-table-column prop="agent_version" label="Agent版本" width="110" />
<el-table-column prop="webview_version" label="WebView版本" width="130">
  <template #default="{ row }">
    <span v-if="row.webview_version">{{ row.webview_version }}</span>
    <span v-else style="color: #c0c4cc">-</span>
  </template>
</el-table-column>
<el-table-column label="在线时长" width="110">
  <template #default="{ row }">
    <span v-if="row.online_duration">{{ formatDuration(row.online_duration) }}</span>
    <span v-else style="color: #c0c4cc">-</span>
  </template>
</el-table-column>
```

#### 2. 时长格式化函数
```javascript
const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}天${h}时${m}分`
  if (h > 0) return `${h}时${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}
```

---

## 2. 设备 ID 可点击跳转 + 搜索过滤

### 功能描述
- 设备 ID 列改为可点击链接，点击跳转到设备详情页
- 表格上方添加搜索框，支持按设备 ID、设备名、序列号、别名等多字段搜索

### 前端修改

**文件**: `web/src/views/Settings.vue`

#### 1. 搜索框
```vue
<el-input
  v-model="agentSearchKeyword"
  placeholder="搜索设备ID、设备名、序列号、别名..."
  clearable
  style="max-width: 400px"
  @input="filterAgents"
>
  <template #prefix>
    <el-icon><Search /></el-icon>
  </template>
</el-input>
```

#### 2. 设备 ID 列改为链接
```vue
<el-table-column label="设备 ID" width="90">
  <template #default="{ row }">
    <el-link type="primary" :underline="false" @click="goToDevice(row.device_id)">
      {{ row.device_id }}
    </el-link>
  </template>
</el-table-column>
```

#### 3. 搜索过滤逻辑
```javascript
const agentSearchKeyword = ref('')
const filteredAgents = ref([])

const filterAgents = () => {
  const keyword = agentSearchKeyword.value.toLowerCase().trim()
  if (!keyword) {
    filteredAgents.value = agentConn.value.agents
    return
  }
  filteredAgents.value = agentConn.value.agents.filter(agent => {
    return (
      String(agent.device_id).includes(keyword) ||
      (agent.name && agent.name.toLowerCase().includes(keyword)) ||
      (agent.serial && agent.serial.toLowerCase().includes(keyword)) ||
      (agent.android_serial && agent.android_serial.toLowerCase().includes(keyword)) ||
      (agent.server_alias && agent.server_alias.toLowerCase().includes(keyword)) ||
      (agent.agent_alias && agent.agent_alias.toLowerCase().includes(keyword))
    )
  })
}

const goToDevice = (deviceId) => {
  router.push(`/devices/${deviceId}`)
}
```

#### 4. STOMP 实时更新适配
```javascript
stompClient.subscribe('/topic/monitor/agent-connections', (message) => {
  try {
    const data = JSON.parse(message.body)
    if (data.type === 'agent_connection_change') {
      agentConn.value = {
        online_count: data.online_count,
        agents: data.agents || []
      }
      filterAgents()  // 实时更新后重新过滤
    }
  } catch (e) {
    console.warn('[Monitor] Parse STOMP message error:', e)
  }
})
```

---

## 3. 优化设备实时状态更新避免慢 SQL

### 问题分析
Agent 心跳每 30 秒更新一次设备表，包含大量高频变化字段（电量、CPU、内存等），在设备数量多时导致：
- 频繁的 UPDATE 操作
- 表级锁竞争
- 产生慢 SQL

### 优化方案
将高频更新字段从 `Device` 主表分离到独立的 `DeviceRealTimeStatus` 表：
- **高频字段（每 30s 更新）** → DeviceRealTimeStatus 表
- **低频字段（仅变化时更新）** → Device 主表

### 后端实现

#### 1. 新增实时状态表
**文件**: `server/models/models.go`

```go
// DeviceRealTimeStatus 设备实时状态（高频更新字段，从 Device 表分离以避免慢SQL）
// 心跳每30秒更新此表，Device 表只在静态字段变化时更新
type DeviceRealTimeStatus struct {
    DeviceID          uint      `gorm:"primaryKey" json:"device_id"`
    Battery           int       `json:"battery"`
    CPUUsage          float64   `json:"cpu_usage"`
    MemoryUsed        int64     `json:"memory_used"`
    StorageUsed       int64     `json:"storage_used"`
    WifiSignal        int       `json:"wifi_signal"`
    WifiSpeed         int       `json:"wifi_speed"`
    ForegroundPackage string    `gorm:"column:foreground_package;size:200" json:"foreground_package"`
    LastSeenAt        time.Time `json:"last_seen_at"`
    AgentConnected    bool      `gorm:"default:false" json:"agent_connected"`
    Status            string    `gorm:"size:20;default:'offline'" json:"status"`
    UpdatedAt         time.Time `json:"updated_at"`
}

func (DeviceRealTimeStatus) TableName() string {
    return "device_realtime_status"
}
```

#### 2. 心跳处理优化
**文件**: `server/agent/sync.go`

```go
func HandleHeartbeat(deviceID string, info map[string]interface{}) {
    // ... 获取设备信息
    
    // 高频更新字段：写入实时状态表
    realtimeUpdates := map[string]interface{}{
        "last_seen_at":    now,
        "agent_connected": true,
        "status":          "online",
    }
    if battery, ok := info["battery"].(float64); ok {
        realtimeUpdates["battery"] = int(battery)
    }
    // ... 其他高频字段
    
    // 低频/静态字段：仅在变化时更新 Device 主表
    updates := map[string]interface{}{}
    if model, ok := info["model"].(string); ok && model != "" {
        updates["model"] = model
    }
    // ... 其他低频字段
    
    // 更新实时状态表（UPSERT）
    if haveID {
        realtimeStatus := models.DeviceRealTimeStatus{
            DeviceID: dbID,
            // ... 填充字段
        }
        database.DB.Save(&realtimeStatus)
    }
    
    // 只在低频字段有变化时才更新 Device 主表
    if len(updates) > 0 {
        DeviceScopeByConnKey(deviceID).Updates(updates)
    }
}
```

#### 3. 数据库迁移
**文件**: `server/database/db.go`

```go
var migrateGroups = [][]interface{}{
    // Group 1 — core entities
    {
        &models.User{},
        &models.Device{},
        &models.DeviceRealTimeStatus{},  // 新增
        &models.App{},
        // ...
    },
    // ...
}
```

### 字段分类

#### 高频字段（实时状态表）
- `battery` - 电量
- `cpu_usage` - CPU 使用率
- `memory_used` - 已用内存
- `storage_used` - 已用存储
- `wifi_signal` - WiFi 信号
- `wifi_speed` - WiFi 速率
- `foreground_package` - 前台应用
- `last_seen_at` - 最后心跳时间
- `agent_connected` - 连接状态
- `status` - 在线状态

#### 低频字段（Device 主表）
- `model` - 机型
- `brand` - 品牌
- `os_version` - 系统版本
- `agent_version` - Agent 版本
- `webview_version` - WebView 版本
- `memory_total` - 总内存
- `storage_total` - 总存储
- `network_type` - 网络类型
- `resolution` - 分辨率
- `agent_alias` - 设备别名
- `group_name` - 分组名称

### 性能提升

**优化前**:
- 每 30 秒对 Device 主表执行 UPDATE，更新 20+ 字段
- 设备数量多时表级锁竞争严重
- 产生慢 SQL

**优化后**:
- 高频字段更新到独立的实时状态表
- Device 主表只在静态字段变化时更新（频率大幅降低）
- 使用 UPSERT（Save）语义，更高效
- 表级锁竞争减少，查询性能提升

---

## 修改文件清单

### 后端 (Go)
- `server/models/models.go` - 新增 WebViewVersion 字段和 DeviceRealTimeStatus 模型
- `server/agent/hub.go` - 连接时间追踪
- `server/agent/sync.go` - 心跳处理优化
- `server/api/system_monitor.go` - API 响应增强
- `server/database/db.go` - 数据库迁移配置

### Android Agent (Kotlin)
- `agent/app/src/main/java/com/appmanager/agent/ws/Protocol.kt` - 协议定义
- `agent/app/src/main/java/com/appmanager/agent/service/DeviceInfoPayload.kt` - 数据采集

### 前端 (Vue)
- `web/src/views/Settings.vue` - UI 增强和搜索功能

---

## 使用说明

### 1. 查看增强后的运行监控
1. 登录系统，进入"系统管理"
2. 切换到"运行监控"标签
3. 查看"Agent 在线连接"表格，现在显示：
   - Agent 版本
   - WebView 版本
   - 在线时长（实时更新）

### 2. 使用搜索功能
- 在表格上方的搜索框中输入关键词
- 支持搜索：设备 ID、设备名、序列号、硬件串号、别名
- 输入时实时过滤结果

### 3. 快速跳转设备详情
- 点击任意设备 ID（蓝色链接）
- 自动跳转到该设备的详情页面

---

## 数据库升级

系统会自动创建 `device_realtime_status` 表，无需手动操作。首次启动时：
1. GORM AutoMigrate 自动创建新表
2. 心跳数据开始写入实时状态表
3. Device 表保持向后兼容

---

## 注意事项

1. **Agent 版本要求**: 需要更新 Android Agent 到支持 `webview_version` 上报的版本
2. **数据库兼容性**: Device 表保留所有字段，确保向后兼容
3. **实时状态表**: 仅存储在线设备的实时数据，离线设备无对应记录
4. **在线时长**: 基于服务器端连接时间计算，不依赖 Agent 上报

---

## 后续优化建议

1. 可考虑定期清理离线设备的实时状态表记录（例如离线超过 24 小时）
2. 可添加实时状态历史数据采样，用于趋势分析
3. 可在设备详情页也展示 WebView 版本信息
