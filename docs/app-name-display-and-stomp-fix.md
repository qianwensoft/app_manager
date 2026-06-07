# APK 应用名称显示与 STOMP 订阅修复

## 修复内容

### 1. APK 管理列表显示应用名称 ✅

**问题**: APK 管理列表显示的是文件名（如 `app-debug.apk`），不够友好。

**解决方案**: 
- 修改列表列标题从"文件名"改为"应用名称"
- 显示 `name` 字段（应用名称）
- 如果未设置应用名称，显示"未命名应用"

**修改文件**: `web/src/views/Apps.vue`

```vue
<el-table-column label="应用名称" min-width="140" show-overflow-tooltip>
  <template #default="{ row }">
    <span :title="row.name">{{ row.name || '未命名应用' }}</span>
  </template>
</el-table-column>
```

**使用效果**:
- 用户上传 APK 后，可以通过"编辑"按钮设置应用名称
- 列表中直接显示易读的应用名称
- 鼠标悬停显示完整名称

### 2. 运行监控前台应用显示应用名称 ✅

**问题**: 监控页面显示的前台应用只有包名（如 `com.android.chrome`），不够直观。

**解决方案**: 
- 服务器端在查询在线设备时，自动匹配前台应用包名与 APK 管理中的应用
- 如果匹配成功，返回 `foreground_app_name` 字段
- 前端优先显示应用名称，包名作为辅助信息

**已实现**: `server/api/system_monitor.go` 的 `GetAgentConnections` 函数

```go
// 预加载所有 APK 应用的包名-名称映射
var apps []models.App
database.DB.Select("package_name, name").Find(&apps)
appNameMap := make(map[string]string, len(apps))
for _, app := range apps {
    if app.PackageName != "" {
        appNameMap[app.PackageName] = app.Name
    }
}

// 为每个在线设备填充前台应用名称
for _, k := range keys {
    // ... 查询设备信息 ...
    e.ForegroundPackage = d.ForegroundPackage
    // 如果前台应用包名在 APK 管理中存在，填充应用名称
    if d.ForegroundPackage != "" {
        if appName, ok := appNameMap[d.ForegroundPackage]; ok {
            e.ForegroundAppName = appName
        }
    }
}
```

**前端显示**: `web/src/views/Settings.vue`

```vue
<el-table-column label="前台应用" min-width="180" show-overflow-tooltip>
  <template #default="{ row }">
    <div v-if="row.foreground_package">
      <div v-if="row.foreground_app_name" style="font-weight: 500">
        {{ row.foreground_app_name }}
      </div>
      <div style="font-size: 12px; color: #909399">
        {{ row.foreground_package }}
      </div>
    </div>
    <span v-else style="color: #c0c4cc">-</span>
  </template>
</el-table-column>
```

**显示效果**:
- **有应用名称**: 
  ```
  Chrome 浏览器
  com.android.chrome
  ```
- **无应用名称**: 
  ```
  com.android.chrome
  ```

### 3. STOMP 订阅错误修复 ✅

**问题**: 前端订阅 `/topic/monitor/agent-connections` 时报错 "invalid destination"

**原因**: 服务器端 STOMP 路由没有注册这个 topic

**解决方案**: 在 `server/api/stomp_ws.go` 中添加监控 topic 的支持

**修改内容**:

1. **添加正则表达式定义**:
```go
var stompDestMonitorAgentConnections = regexp.MustCompile(`^/topic/monitor/agent-connections$`)
```

2. **在 SUBSCRIBE 处理中添加匹配**:
```go
default:
    if mMon := stompDestMonitorAgentConnections.FindStringSubmatch(dest); mMon != nil {
        unsubs[subID] = stomp.DefaultHub.Subscribe(dest, subID, send)
        log.Printf("STOMP SUBSCRIBE user=%d dest=%s sub=%s", c.GetUint("user_id"), dest, subID)
        continue
    }
    // ... 其他 topic 匹配 ...
```

**修复后的 STOMP 流程**:
```
前端: SUBSCRIBE /topic/monitor/agent-connections
  ↓
服务器: 匹配成功，注册订阅
  ↓
服务器: 返回 CONNECTED
  ↓
Agent 上线/下线
  ↓
服务器: 推送消息到 topic
  ↓
前端: 收到实时更新
```

## 完整工作流程

### 流程 1: APK 上传与命名
```
1. 用户上传 APK 文件
2. 服务器解析 APK，提取包名、版本等信息
3. 用户点击"编辑"，设置应用名称为"Chrome 浏览器"
4. APK 管理列表显示"Chrome 浏览器"
```

### 流程 2: 前台应用检测与显示
```
1. Android Agent 检测到用户打开 Chrome
2. 上报前台应用包名: com.android.chrome
3. 服务器更新 devices.foreground_package
4. 推送 STOMP 消息到前端
5. 前端查询 GetAgentConnections API
6. 服务器匹配包名 → 应用名称: "Chrome 浏览器"
7. 前端显示:
   Chrome 浏览器
   com.android.chrome
```

### 流程 3: 实时监控更新
```
1. 用户打开监控页面
2. 前端订阅 /topic/monitor/agent-connections
3. 服务器注册订阅（已修复）
4. Agent 连接/断开时推送更新
5. 前端实时显示在线设备和前台应用
```

## 数据流转

```
APK 管理表 (apps)
├── package_name: "com.android.chrome"
└── name: "Chrome 浏览器"
         ↓
    包名-名称映射
         ↓
设备表 (devices)
├── foreground_package: "com.android.chrome"
└── (动态填充) foreground_app_name: "Chrome 浏览器"
         ↓
    API 响应
         ↓
    前端显示
```

## 性能优化

### 服务器端
- **预加载映射**: 一次查询所有 APK，构建 map，O(1) 查询
- **避免 N+1**: 不是为每个设备单独查询 APK
- **只查必要字段**: `SELECT package_name, name`

```go
// 高效实现
var apps []models.App
database.DB.Select("package_name, name").Find(&apps)
appNameMap := make(map[string]string, len(apps))
for _, app := range apps {
    if app.PackageName != "" {
        appNameMap[app.PackageName] = app.Name
    }
}
```

### 前端
- **条件渲染**: 有应用名称才显示额外行
- **工具提示**: overflow-tooltip 避免长名称换行
- **颜色区分**: 应用名称粗体，包名灰色

## 测试场景

### 场景 1: APK 上传与命名
1. 上传一个 APK
2. 点击"编辑"，设置应用名称为"测试应用"
3. 列表显示"测试应用"而不是文件名

### 场景 2: 前台应用显示（已命名）
1. 在 APK 管理中添加并命名 Chrome
2. Agent 设备打开 Chrome
3. 监控页面显示:
   ```
   Chrome 浏览器
   com.android.chrome
   ```

### 场景 3: 前台应用显示（未命名）
1. Agent 设备打开一个未在 APK 管理中的应用
2. 监控页面只显示包名:
   ```
   com.unknown.app
   ```

### 场景 4: STOMP 订阅
1. 打开监控页面
2. 浏览器控制台显示: `[Monitor] STOMP connected`
3. 不再显示 "invalid destination" 错误
4. Agent 上下线实时更新

## 相关文件

### 前端
- `web/src/views/Apps.vue` - APK 管理列表
- `web/src/views/Settings.vue` - 运行监控页面（已有前台应用显示）

### 后端
- `server/api/system_monitor.go` - GetAgentConnections API（已有应用名称匹配）
- `server/api/stomp_ws.go` - STOMP 订阅路由（新增监控 topic）
- `server/agent/sync.go` - STOMP 推送逻辑

## 构建状态

- ✅ APK 列表显示应用名称
- ✅ 监控页面前台应用显示应用名称（服务器端已实现）
- ✅ STOMP 订阅路由修复
- ✅ Go 服务器编译成功

## 用户体验改进

### 改进前
- APK 列表: `app-debug-v1.2.3.apk` ❌ 不直观
- 前台应用: `com.android.chrome` ❌ 技术性强
- STOMP 订阅: 报错 ❌ 功能不可用

### 改进后
- APK 列表: `Chrome 浏览器` ✅ 一目了然
- 前台应用: `Chrome 浏览器 / com.android.chrome` ✅ 友好且准确
- STOMP 订阅: 成功连接并实时更新 ✅ 功能正常
