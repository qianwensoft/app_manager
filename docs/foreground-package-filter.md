# 设备事件连接器前台应用包名过滤功能

## 功能概述

在设备事件触发连接器时，支持按当前前台应用包名进行过滤。只有当设备的前台应用在配置的白名单中时，连接器才会被触发。

## 实现细节

### 1. 数据库模型更新

#### Device 模型
- 新增字段：`foreground_package` (varchar(200))
- 用途：存储设备当前的前台应用包名
- 数据来源：Agent 心跳上报

#### OutboundConnector 触发器配置
- 在 `trigger_config_json` 中新增 `foreground_packages` 字段
- 类型：字符串数组
- 说明：
  - 为空数组或未配置：全局生效，任何前台应用都触发
  - 非空数组：仅当前台应用在列表中时触发

### 2. Agent 心跳上报

Agent 在心跳消息中上报 `foreground_package` 字段：

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

服务端在 `HandleHeartbeat` 函数中接收并更新到数据库。

### 3. 连接器触发过滤

在 `processDeviceEvent` 函数中，增加了 `checkForegroundPackageFilter` 检查：

```go
// 检查前台应用包名过滤
if !checkForegroundPackageFilter(db, c, rec.DeviceID) {
    continue
}
```

#### 过滤逻辑

1. **仅对 `device_event` 类型触发器生效**
   - 其他类型（http_webhook、cron 等）不受影响

2. **未配置白名单**
   - `foreground_packages` 为空或未配置：全局生效

3. **配置了白名单**
   - 查询设备当前的 `foreground_package` 字段
   - 如果设备未上报前台应用（字段为空）：阻止触发
   - 如果前台应用在白名单中：允许触发
   - 如果前台应用不在白名单中：阻止触发

### 4. 系统监控显示

在系统监控的运行监控 API (`/api/system/monitor/agents`) 中：

- 返回设备的 `foreground_package` 字段
- 如果包名存在于 APK 管理中，同时返回 `foreground_app_name` 字段

响应示例：

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

### 5. API 使用示例

#### 创建/更新连接器时配置前台应用过滤

```json
{
  "name": "扫码上报连接器",
  "trigger_type": "device_event",
  "trigger_config": {
    "foreground_packages": [
      "com.example.scanner",
      "com.example.reader"
    ]
  },
  "definition_ids": [1, 2],
  ...
}
```

## 测试用例

已实现完整的单元测试 (`foreground_filter_test.go`)：

1. ✅ 未配置白名单：全局生效
2. ✅ 前台应用在白名单中：允许触发
3. ✅ 前台应用不在白名单中：阻止触发
4. ✅ 设备未上报前台应用：阻止触发（配置白名单时）
5. ✅ 非 device_event 触发器：忽略过滤

## 前端集成

### TypeScript 类型定义

Device 接口已更新 (`schema/api/device.ts`)：

```typescript
export interface Device {
  ...
  /** Current foreground app package name reported by Agent heartbeat */
  foreground_package: string
  ...
}
```

### 连接器配置界面

在连接器配置表单中，需要增加前台应用包名列表的编辑字段：

```vue
<el-form-item label="前台应用包名过滤">
  <el-select
    v-model="form.trigger_config.foreground_packages"
    multiple
    filterable
    allow-create
    placeholder="留空表示全局生效，任何前台应用都触发"
  />
  <div class="tip">
    仅 device_event 触发器生效。配置后，只有当设备前台应用在此列表中时才触发连接器。
  </div>
</el-form-item>
```

## 使用场景

1. **扫码应用场景**
   - 只有当扫码 App 在前台时，才处理扫码事件
   - 避免后台误触发

2. **特定应用事件监听**
   - 只监听特定应用的操作事件
   - 提高事件处理的准确性

3. **多应用环境**
   - 不同连接器监听不同应用的事件
   - 实现细粒度的事件路由

## 注意事项

1. **Agent 版本要求**
   - Agent 需要支持上报 `foreground_package` 字段
   - 旧版本 Agent 不上报时，字段为空，会被过滤器阻止（如果配置了白名单）

2. **性能考虑**
   - 过滤在内存中进行，不增加额外数据库查询负担
   - 每个事件仅查询一次设备的 `foreground_package` 字段

3. **向后兼容**
   - 未配置 `foreground_packages` 的连接器不受影响
   - 现有连接器行为保持不变
