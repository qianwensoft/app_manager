# 前台应用包名过滤功能 - 完整实现总结

## 功能概述

实现了设备事件连接器的前台应用包名过滤功能，并在系统监控中显示设备当前运行的前台应用。

## 实现清单

### ✅ 后端实现

#### 1. 数据库模型 (已完成)
- **Device 模型** (`server/models/models.go`)
  - 新增字段：`ForegroundPackage string` (varchar(200))
  - 用于存储设备当前的前台应用包名

- **TriggerConfig 结构** (`server/outbound/trigger_config.go`)
  - 新增字段：`ForegroundPackages []string`
  - 前台应用包名白名单配置

#### 2. Agent 心跳处理 (已完成)
- **文件**: `server/agent/sync.go`
- **功能**: `HandleHeartbeat` 函数处理 Agent 上报的 `foreground_package` 字段
- **更新**: 实时将前台应用包名写入数据库

#### 3. 连接器触发过滤 (已完成)
- **文件**: 
  - `server/outbound/dispatch.go` - 触发流程增加过滤调用
  - `server/outbound/foreground_filter.go` - 过滤逻辑实现（新文件）
  - `server/outbound/foreground_filter_test.go` - 单元测试（新文件）

- **过滤规则**:
  - ✅ 仅对 `device_event` 触发器生效
  - ✅ 未配置白名单：全局生效
  - ✅ 配置白名单：只有前台应用在列表中时才触发
  - ✅ 设备未上报前台应用：阻止触发

- **测试结果**: 5个测试用例全部通过 ✅

#### 4. 系统监控 API (已完成)
- **文件**: `server/api/system_monitor.go`
- **接口**: `GET /api/system/monitor/agents`
- **返回字段**:
  - `foreground_package`: 当前前台应用包名
  - `foreground_app_name`: 应用名称（如果在 APK 管理中存在）

- **实现**: 预加载所有 APK 包名-名称映射，避免 N+1 查询

### ✅ 前端实现

#### 1. TypeScript Schema (已完成)
- **文件**: `schema/api/device.ts`
- **更新**: Device 接口增加 `foreground_package: string` 字段

#### 2. 连接器编辑界面 (已完成)
- **文件**: `web/src/views/OutboundConnectorEdit.vue`
- **位置**: "事件定义"表单项后
- **UI 组件**:
  ```vue
  <el-form-item label="前台应用包名过滤" v-if="form.trigger_type === 'device_event'">
    <el-select
      v-model="form.trigger_config.foreground_packages"
      multiple
      filterable
      allow-create
      clearable
      placeholder="留空表示全局生效，任何前台应用都触发"
    />
    <div class="hint">
      配置后，只有当设备前台应用在此列表中时才触发连接器
    </div>
  </el-form-item>
  ```

- **初始化**: 
  - `resetFormNew()` 中初始化为空数组
  - `applyRowToForm()` 中确保是数组类型

#### 3. 系统监控界面 (已完成)
- **文件**: `web/src/views/Settings.vue`
- **位置**: "运行监控" → "Agent 在线连接"表格
- **新增列**: "前台应用"
  - 显示应用名称（加粗）
  - 显示包名（灰色小字）
  - 未上报时显示 "-"

## 使用示例

### API 配置
```json
{
  "name": "扫码事件连接器",
  "trigger_type": "device_event",
  "trigger_config": {
    "foreground_packages": [
      "com.example.scanner",
      "com.example.reader"
    ]
  },
  "definition_ids": [1, 2]
}
```

### Agent 心跳上报
```json
{
  "type": "heartbeat",
  "data": {
    "battery": 80,
    "cpu_usage": 25.5,
    "foreground_package": "com.example.scanner",
    ...
  }
}
```

### 系统监控 API 响应
```json
{
  "online_count": 5,
  "agents": [
    {
      "device_id": 1,
      "name": "Device-001",
      "foreground_package": "com.example.scanner",
      "foreground_app_name": "扫码应用",
      ...
    }
  ]
}
```

## 测试验证

### 后端测试
```bash
# 单元测试
go test -v ./outbound -run TestCheckForegroundPackageFilter
# 结果: PASS (5/5)

# 编译测试
go build -o /tmp/app-manager-test
# 结果: SUCCESS
```

### 前端测试
```bash
# 构建测试
npm run build
# 结果: SUCCESS
```

## 数据库迁移

GORM AutoMigrate 会自动处理新字段的添加，无需手动执行 SQL。

首次启动时会自动添加：
- `devices.foreground_package` varchar(200)

## 文件清单

### 后端新增/修改文件
1. ✅ `server/models/models.go` - Device 模型增加字段
2. ✅ `server/outbound/trigger_config.go` - TriggerConfig 增加配置
3. ✅ `server/agent/sync.go` - 心跳处理前台应用
4. ✅ `server/outbound/dispatch.go` - 触发流程增加过滤
5. ✅ `server/outbound/foreground_filter.go` - 过滤逻辑（新）
6. ✅ `server/outbound/foreground_filter_test.go` - 单元测试（新）
7. ✅ `server/api/system_monitor.go` - 监控 API 增加前台应用

### 前端新增/修改文件
1. ✅ `schema/api/device.ts` - TypeScript 类型定义
2. ✅ `web/src/views/OutboundConnectorEdit.vue` - 连接器编辑界面
3. ✅ `web/src/views/Settings.vue` - 系统监控界面

### 文档文件
1. ✅ `docs/foreground-package-filter.md` - 功能说明文档

## 使用场景

1. **扫码应用场景**
   - 只有当扫码 App 在前台时才处理扫码事件
   - 避免后台误触发

2. **特定应用事件监听**
   - 只监听特定应用的操作事件
   - 提高事件处理的准确性

3. **多应用环境**
   - 不同连接器监听不同应用的事件
   - 实现细粒度的事件路由

## 注意事项

1. **Agent 版本要求**
   - Android Agent 需要支持上报 `foreground_package` 字段
   - 旧版本 Agent 不上报时字段为空，会被过滤器阻止（如果配置了白名单）

2. **性能考虑**
   - 过滤在内存中进行，每个事件仅查询一次设备字段
   - 系统监控 API 使用批量查询和映射，避免 N+1 问题

3. **向后兼容**
   - 未配置 `foreground_packages` 的连接器不受影响
   - 现有连接器行为保持不变

## 下一步工作

需要 Android Agent 端配合实现：

1. **获取前台应用包名**
   - 使用 `UsageStatsManager` 获取当前前台应用
   - 需要 `PACKAGE_USAGE_STATS` 权限

2. **心跳上报**
   - 在心跳消息中增加 `foreground_package` 字段
   - 实时上报当前前台应用变化

3. **代码示例**
   ```kotlin
   private fun getForegroundPackage(): String? {
       val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
       val time = System.currentTimeMillis()
       val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, time - 1000, time)
       return stats?.maxByOrNull { it.lastTimeUsed }?.packageName
   }
   ```

---

**状态**: ✅ 后端和前端功能已全部实现并测试通过，等待 Android Agent 端集成。
