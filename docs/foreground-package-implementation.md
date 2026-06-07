# 前台应用实时推送功能实现

## 问题描述

Android Agent 没有实时检测和推送当前前台应用（foreground_package）到服务器，导致服务器端无法获取设备当前正在运行的应用包名。

## 实现方案

### 1. 前台应用检测工具类

**文件**: `agent/app/src/main/java/com/appmanager/agent/util/ForegroundAppDetector.kt`

**功能**:
- 使用 `UsageStatsManager` 获取前台应用包名（Android 5.0+）
- 降级方案：使用 `ActivityManager.getRunningTasks`（Android 5.0 以下）
- 检测是否已授予 `PACKAGE_USAGE_STATS` 权限

**核心方法**:
```kotlin
fun getForegroundPackageName(context: Context): String
fun hasUsageStatsPermission(context: Context): Boolean
```

### 2. 数据模型更新

**文件**: `agent/app/src/main/java/com/appmanager/agent/ws/Protocol.kt`

在 `DeviceInfoData` 中添加字段：
```kotlin
@SerializedName("foreground_package") val foregroundPackage: String = ""
```

### 3. 数据采集集成

**文件**: `agent/app/src/main/java/com/appmanager/agent/service/DeviceInfoPayload.kt`

在 `collectDeviceInfoData()` 函数中添加前台应用检测：
```kotlin
val foregroundPackage = ForegroundAppDetector.getForegroundPackageName(context)
```

并在返回的 `DeviceInfoData` 中包含此字段。

### 4. 权限配置

**文件**: `agent/app/src/main/AndroidManifest.xml`

添加权限声明：
```xml
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
    tools:ignore="ProtectedPermissions" />
```

### 5. 权限引导界面

**文件**: 
- `agent/app/src/main/res/layout/fragment_permission.xml`
- `agent/app/src/main/java/com/appmanager/agent/ui/PermissionFragment.kt`

在权限管理页面中添加"使用情况访问权限"卡片，引导用户前往系统设置授权。

## 工作流程

1. **心跳周期上报**（每30秒）
   - Agent 调用 `ForegroundAppDetector.getForegroundPackageName()` 获取当前前台应用
   - 将包名包含在 `DeviceInfoData` 中
   - 通过 WebSocket 发送 `device_info` 消息到服务器

2. **服务器端接收**
   - `server/agent/sync.go` 中的 `HandleHeartbeat` 函数处理
   - 从 `info["foreground_package"]` 读取包名
   - 更新 `devices` 表的 `foreground_package` 字段

3. **触发器过滤**
   - 出站连接器可配置 `foreground_packages` 过滤条件
   - `server/outbound/foreground_filter.go` 中检查前台应用是否匹配
   - 仅当前台应用在白名单中时才触发连接器

## 权限说明

### PACKAGE_USAGE_STATS 权限

- **权限类型**: 特殊权限（需用户在系统设置中手动授权）
- **用途**: 允许应用查询应用使用统计信息，包括当前前台应用
- **授权路径**: 设置 → 应用 → 特殊应用访问权限 → 使用情况访问权限

### 权限检测

Agent 在采集设备信息时会自动检测权限状态：
- 有权限：返回实际的前台应用包名
- 无权限：返回空字符串

服务器端兼容处理空字符串的情况。

## 服务器端处理

### 数据库字段

`devices` 表中的 `foreground_package` 字段（VARCHAR(200)）存储当前前台应用包名。

### API 接口

- **系统监控 API**: `GET /api/system/monitor`
  - 返回设备状态时包含 `foreground_package`
  - 可根据应用包名查询应用名称

### 触发器过滤

在 `server/outbound/foreground_filter.go` 中实现：
```go
func checkForegroundPackageFilter(db *gorm.DB, connector models.OutboundConnector, deviceID uint) bool
```

**逻辑**:
1. 如果连接器未配置 `foreground_packages`，则不过滤（通过）
2. 查询设备当前的 `foreground_package`
3. 检查是否在白名单中
4. 支持通配符匹配（如 `com.example.*`）

## 测试验证

### 手动测试步骤

1. **安装并启动 Agent**
   ```bash
   make agent
   make install-agent
   ```

2. **授予使用情况访问权限**
   - 打开 Agent App
   - 进入"管理后台" → "权限"
   - 点击"使用情况访问权限" → "去授权"
   - 在系统设置中启用该应用的使用情况访问权限

3. **验证数据推送**
   - 切换到不同的应用（如浏览器、设置等）
   - 等待 30 秒（心跳周期）
   - 在 Web 管理平台查看设备详情
   - 确认 `foreground_package` 字段更新为当前应用包名

4. **验证触发器过滤**
   - 配置出站连接器，设置 `foreground_packages` 过滤条件
   - 切换到白名单中的应用，验证触发器执行
   - 切换到白名单外的应用，验证触发器不执行

## 已知限制

1. **权限要求**: 需要用户手动授予 PACKAGE_USAGE_STATS 权限
2. **更新频率**: 随心跳周期（30秒）更新，非实时
3. **Android 版本**: Android 5.0+ 支持 UsageStatsManager；5.0 以下使用 getRunningTasks（可能受限）
4. **权限撤销**: 用户可随时在系统设置中撤销权限，Agent 会静默降级（返回空字符串）

## 构建状态

- ✅ Android Agent 编译成功
- ✅ 服务器端已支持接收和存储
- ✅ 触发器过滤功能已实现
- ✅ 权限引导界面已添加

## 相关文件

### Android Agent
- `agent/app/src/main/java/com/appmanager/agent/util/ForegroundAppDetector.kt`
- `agent/app/src/main/java/com/appmanager/agent/ws/Protocol.kt`
- `agent/app/src/main/java/com/appmanager/agent/service/DeviceInfoPayload.kt`
- `agent/app/src/main/java/com/appmanager/agent/ui/PermissionFragment.kt`
- `agent/app/src/main/res/layout/fragment_permission.xml`
- `agent/app/src/main/AndroidManifest.xml`

### 服务器端
- `server/agent/sync.go` - 心跳处理
- `server/models/models.go` - 数据模型
- `server/outbound/foreground_filter.go` - 触发器过滤
- `server/outbound/dispatch.go` - 触发器调度
- `server/api/system_monitor.go` - 系统监控 API
