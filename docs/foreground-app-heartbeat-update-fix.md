# Android Agent 心跳前台应用更新逻辑优化

## 问题描述

**问题**: Android Agent 心跳包没有传递前台应用时，服务器仍然更新 `foreground_package` 字段，导致空值覆盖了之前的有效值。

**场景**:
1. Agent 初始心跳上报前台应用：`com.android.chrome`
2. 后续心跳因某些原因没有包含前台应用字段（如权限被撤销）
3. 服务器将 `foreground_package` 更新为空字符串
4. 之前的有效前台应用信息丢失

## 解决方案

**修改策略**: 只有在心跳包明确传递了前台应用包名（且非空）时，才更新数据库字段。

### 修改内容

**文件**: `server/agent/sync.go` - `HandleHeartbeat` 函数

**修改前**:
```go
if fg, ok := strFromInfo(info["foreground_package"]); ok {
    updates["foreground_package"] = fg  // ❌ 只要 key 存在就更新，即使值为空
}
```

**修改后**:
```go
// 前台应用包名：只有明确传递了值时才更新（避免空值覆盖）
if fg, ok := strFromInfo(info["foreground_package"]); ok && fg != "" {
    updates["foreground_package"] = fg  // ✅ 只在有有效值时才更新
}
```

### 变化检测逻辑

前台应用变化检测保持不变（已经是正确的）：

```go
foregroundAppChanged := false
if haveID {
    // 只有在 updates 中存在该字段且值与旧值不同时，才判定为变化
    if v, ok := updates["foreground_package"].(string); ok && v != old.ForegroundPackage {
        foregroundAppChanged = true
    }
}
if foregroundAppChanged {
    // 前台应用变化时推送到监控页面
    publishAgentConnectionChange()
}
```

**逻辑说明**:
- 只有当 `updates` 中包含 `foreground_package` 字段时才检测
- 由于修改后只在有有效值时才添加到 `updates`，所以这里检测的都是有效变化
- 空值不会进入 `updates`，自然不会触发变化检测

## 工作流程

### 场景 1: 正常上报前台应用

```
心跳包: { "foreground_package": "com.android.chrome" }
  ↓
strFromInfo 提取: fg = "com.android.chrome", ok = true
  ↓
检查: fg != "" ✅ 通过
  ↓
updates["foreground_package"] = "com.android.chrome"
  ↓
数据库更新: foreground_package = "com.android.chrome"
  ↓
检测变化: 与旧值不同 → 推送 STOMP
```

### 场景 2: 心跳包未包含前台应用字段

```
心跳包: { "battery": 80, "cpu_usage": 15.5 }  // 没有 foreground_package
  ↓
strFromInfo 提取: ok = false
  ↓
检查: ok && fg != "" ❌ 不通过
  ↓
不添加到 updates
  ↓
数据库保持原值: foreground_package = "com.android.chrome" (不变)
  ↓
不触发 STOMP 推送
```

### 场景 3: 心跳包包含空的前台应用

```
心跳包: { "foreground_package": "" }
  ↓
strFromInfo 提取: fg = "", ok = true
  ↓
检查: fg != "" ❌ 不通过
  ↓
不添加到 updates
  ↓
数据库保持原值: foreground_package = "com.android.chrome" (不变)
  ↓
不触发 STOMP 推送
```

### 场景 4: 前台应用变化

```
数据库当前值: foreground_package = "com.android.chrome"
心跳包: { "foreground_package": "com.android.settings" }
  ↓
strFromInfo 提取: fg = "com.android.settings", ok = true
  ↓
检查: fg != "" ✅ 通过
  ↓
updates["foreground_package"] = "com.android.settings"
  ↓
数据库更新: foreground_package = "com.android.settings"
  ↓
检测变化: "com.android.settings" != "com.android.chrome" ✅
  ↓
推送 STOMP: 包含新的前台应用信息
```

## 优化效果

### 改进前
| 心跳包内容 | 数据库更新 | 问题 |
|-----------|-----------|------|
| `{"foreground_package": "com.app"}` | ✅ 更新为 `com.app` | 正常 |
| `{}` (未包含) | ❌ 更新为 `""` | 丢失有效值 |
| `{"foreground_package": ""}` | ❌ 更新为 `""` | 丢失有效值 |

### 改进后
| 心跳包内容 | 数据库更新 | 结果 |
|-----------|-----------|------|
| `{"foreground_package": "com.app"}` | ✅ 更新为 `com.app` | 正常 |
| `{}` (未包含) | ✅ 保持原值 | 保留有效值 |
| `{"foreground_package": ""}` | ✅ 保持原值 | 保留有效值 |

## Android Agent 端对应实现

Android Agent 端已实现完整的前台应用检测：

**检测成功时**:
```kotlin
// ForegroundAppMonitor.kt
val currentPackage = ForegroundAppDetector.getForegroundPackageName(context)
if (currentPackage.isNotEmpty()) {
    // 上报包含前台应用的心跳
    webSocket.send(DeviceInfoMessage(
        deviceId = tok,
        data = collectDeviceInfoData(this).copy(
            foregroundPackage = currentPackage  // ✅ 包含有效值
        )
    ))
}
```

**检测失败时**（如权限未授予）:
```kotlin
// ForegroundAppDetector.kt
if (!hasUsageStatsPermission(context)) {
    Log.w(TAG, "PACKAGE_USAGE_STATS permission not granted")
    return ""  // 返回空字符串
}

// DeviceInfoPayload.kt
data class DeviceInfoData(
    // ...
    val foregroundPackage: String = ""  // 默认为空
)

// 心跳上报时
collectDeviceInfoData(context)  // foregroundPackage 为空字符串
// 但 Gson 序列化时可能不包含空字符串字段，或包含为 ""
```

**优化建议**: Android Agent 端可以进一步优化，只在成功获取前台应用时才添加该字段：

```kotlin
val payload = mutableMapOf<String, Any>(
    "battery" to battery,
    "cpu_usage" to cpuUsage,
    // ... 其他字段
)

val foregroundPkg = ForegroundAppDetector.getForegroundPackageName(context)
if (foregroundPkg.isNotEmpty()) {
    payload["foreground_package"] = foregroundPkg  // 只在有值时添加
}

webSocket.send(DeviceInfoMessage(deviceId = tok, data = payload))
```

## 兼容性说明

### 对现有功能的影响

**监控页面**:
- ✅ 正常显示前台应用
- ✅ 前台应用变化时实时更新
- ✅ 未上报时保持上次的值（更合理）

**连接器前台应用过滤**:
- ✅ 正常工作
- ✅ 使用最后一次有效的前台应用值
- ⚠️ 如果从未上报过，字段为空，连接器会跳过（符合预期）

**设备列表**:
- ✅ 显示最后一次上报的前台应用
- ✅ 不会因为心跳包缺失字段而清空

### 边界情况处理

**情况 1**: Agent 从未上报过前台应用
- 数据库: `foreground_package = ""` (默认值)
- 监控页面: 显示 "-"
- 连接器: 不匹配任何白名单，跳过触发

**情况 2**: Agent 上报过一次后权限被撤销
- 数据库: 保持最后一次有效值
- 监控页面: 显示最后一次的应用（可能已过时）
- 连接器: 使用最后一次的值（可能不准确）

**情况 3**: Agent 重新授权后恢复上报
- 数据库: 更新为最新值
- 监控页面: 实时更新显示
- 连接器: 使用最新值

## 进一步优化建议

### 1. 添加前台应用更新时间戳

在 `devices` 表添加字段：

```sql
ALTER TABLE devices ADD COLUMN foreground_package_updated_at TIMESTAMP;
```

用途：
- 判断前台应用数据的新鲜度
- 在监控页面显示"前台应用最后更新时间"
- 连接器可以检查数据是否过期

### 2. 前台应用数据过期处理

```go
// 检查前台应用数据是否过期（超过5分钟）
if time.Since(dev.ForegroundPackageUpdatedAt) > 5*time.Minute {
    // 数据过期，视为未知
    return false
}
```

### 3. 监控页面显示数据新鲜度

```vue
<div v-if="row.foreground_package">
  <div style="font-weight: 500">{{ row.foreground_app_name }}</div>
  <div style="font-size: 12px; color: #909399">
    {{ row.foreground_package }}
    <span v-if="isStale(row.foreground_package_updated_at)" style="color: #f56c6c">
      (数据过期)
    </span>
  </div>
</div>
```

## 相关文件

- `server/agent/sync.go` - HandleHeartbeat 函数
- `server/models/models.go` - Device 模型
- `agent/app/.../ForegroundAppMonitor.kt` - Android 端监听
- `agent/app/.../ForegroundAppDetector.kt` - Android 端检测

## 构建状态

- ✅ 逻辑修复完成
- ✅ Go 服务器编译成功
- ✅ 向后兼容
- ✅ 无需前端修改

## 测试验证

### 测试场景 1: 正常上报
1. Agent 授权使用情况访问权限
2. 打开 Chrome
3. 心跳上报: `{"foreground_package": "com.android.chrome"}`
4. 数据库更新: ✅
5. 监控页面显示: Chrome 浏览器

### 测试场景 2: 撤销权限后心跳
1. Agent 撤销使用情况访问权限
2. 心跳上报: `{}` 或 `{"foreground_package": ""}`
3. 数据库: ✅ 保持原值 `com.android.chrome`
4. 监控页面: 仍显示 Chrome 浏览器（过时但不丢失）

### 测试场景 3: 重新授权并切换应用
1. Agent 重新授权
2. 切换到设置应用
3. 心跳上报: `{"foreground_package": "com.android.settings"}`
4. 数据库更新: ✅
5. 监控页面: 实时更新为设置应用
6. 触发 STOMP 推送: ✅

## 总结

这次优化确保了前台应用数据的稳定性和准确性：
- ✅ 空值不会覆盖有效值
- ✅ 只在有新值时才更新和推送
- ✅ 保持向后兼容
- ✅ 改进了用户体验
