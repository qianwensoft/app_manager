# Android Agent 前台应用检测故障排查指南

## 问题现象

Android Agent 没有获取到前台正在运行的应用，`foreground_package` 字段为空或不更新。

## 排查步骤

### 1. 检查权限是否授予 ⭐️ 最常见原因

前台应用检测需要"使用情况访问权限"（PACKAGE_USAGE_STATS），这是一个特殊权限，必须用户在系统设置中手动授权。

**授权步骤**:
1. 打开 Agent App
2. 进入"管理后台" → "权限"页面
3. 找到"使用情况访问权限"卡片
4. 点击"去授权"按钮
5. 在系统设置中找到 Agent 应用并启用权限
6. 返回 Agent 查看权限状态显示为"已授权"

**验证方法**:
```
在权限页面查看"使用情况访问权限"卡片状态：
- 绿色 "已授权" ✅ → 权限正常
- 灰色 "未授权" ❌ → 需要授权
```

### 2. 检查 Android 版本

**支持的 Android 版本**:
- Android 5.0 (API 21) 及以上 ✅ 使用 UsageStatsManager（推荐）
- Android 5.0 以下 ⚠️ 使用 ActivityManager.getRunningTasks（已废弃，可能不工作）

**查看设备 Android 版本**:
- 在设备详情页面查看"Android"字段
- 或在 Agent "关于"页面查看"系统版本"

### 3. 查看日志输出

Agent 已添加详细日志，可通过 Logcat 查看：

**通过 Web 管理平台查看**:
1. 进入设备详情页
2. 切换到"Logcat"标签
3. 搜索 `ForegroundAppDetector`
4. 查看相关日志

**可能的日志**:
```
# 权限未授予
W/ForegroundAppDetector: PACKAGE_USAGE_STATS permission not granted

# 没有使用统计数据
D/ForegroundAppDetector: No usage stats available

# 成功获取
D/ForegroundAppDetector: Foreground app: com.example.app (lastTimeUsed: 1234567890)

# 错误
E/ForegroundAppDetector: Error getting foreground app
```

### 4. 检查系统限制

某些厂商（如小米、华为、OPPO 等）可能有额外的权限限制：

**小米 MIUI**:
- 设置 → 应用设置 → 应用管理 → Agent → 权限管理
- 确保"读取使用情况"权限已开启

**华为 EMUI**:
- 设置 → 应用 → 应用管理 → Agent → 权限
- 确保"使用统计数据"权限已开启

**OPPO ColorOS**:
- 设置 → 应用管理 → 应用列表 → Agent → 权限管理
- 确保"应用使用记录"权限已开启

### 5. 检查数据推送

即使获取成功，数据也需要通过心跳推送到服务器。

**心跳周期**: 30 秒

**验证方法**:
1. 在设备详情页面
2. 查看"前台应用"字段（如果有显示）
3. 切换到不同的应用
4. 等待 30 秒后刷新页面
5. 观察"前台应用"字段是否更新

### 6. 重启 Agent 服务

权限授予后，可能需要重启 Agent：

**方法 1**: 强制停止并重启
1. 系统设置 → 应用管理 → Agent
2. 点击"强制停止"
3. 重新打开 Agent

**方法 2**: 重启设备
- 简单粗暴，确保所有服务重新初始化

## 代码改进

### v2 改进内容

1. **扩大时间窗口**: 从 1 秒扩大到 10 秒
   ```kotlin
   // 查询最近 10 秒内的使用统计（扩大时间窗口）
   val stats = usageStatsManager.queryUsageStats(
       UsageStatsManager.INTERVAL_BEST,
       currentTime - 10000,  // 改进：从 1000 增加到 10000
       currentTime
   )
   ```

2. **添加详细日志**: 帮助诊断问题
   ```kotlin
   Log.w(TAG, "PACKAGE_USAGE_STATS permission not granted")
   Log.d(TAG, "No usage stats available")
   Log.d(TAG, "Foreground app: $packageName")
   Log.e(TAG, "Error getting foreground app", e)
   ```

3. **更好的错误处理**: 捕获所有异常并记录

## 常见问题 FAQ

### Q1: 权限已授予但仍获取不到前台应用？

**A**: 
1. 检查日志确认是否真的授予（可能只是界面显示问题）
2. 重启 Agent 服务
3. 确认系统版本 ≥ Android 5.0
4. 检查厂商是否有额外限制

### Q2: 为什么有时能获取，有时获取不到？

**A**: 
1. 系统可能延迟更新使用统计数据
2. 某些系统应用可能不在统计中
3. 设备处于锁屏或休眠状态时可能无法获取

### Q3: Agent 应用自己会不会被识别为前台应用？

**A**: 
会的。当 Agent 在前台时，会检测到自己的包名。这是正常行为。

### Q4: 如何在服务器端查看前台应用数据？

**A**: 
1. 设备详情页面查看 `foreground_package` 字段
2. 出站连接器可配置 `foreground_packages` 过滤
3. 数据库 `devices` 表的 `foreground_package` 列

### Q5: 权限授予后多久生效？

**A**: 
立即生效，但需要等待下一次心跳周期（最多 30 秒）才会推送到服务器。

## 测试验证

### 测试场景

1. **切换应用测试**
   - 打开浏览器（com.android.chrome）
   - 等待 30 秒
   - 在管理平台刷新查看是否显示 `com.android.chrome`
   - 切换到设置（com.android.settings）
   - 再次验证

2. **权限测试**
   - 撤销权限
   - 查看字段变为空
   - 重新授予权限
   - 等待更新

3. **日志测试**
   - 打开 Logcat
   - 过滤 `ForegroundAppDetector`
   - 切换应用观察日志输出

## 技术原理

### UsageStatsManager 工作原理

1. Android 系统持续跟踪应用使用情况
2. 记录每个应用的 `lastTimeUsed` 时间戳
3. 通过查询最近时间窗口内的统计数据
4. 找到 `lastTimeUsed` 最新的应用即为前台应用

### 为什么需要特殊权限？

`PACKAGE_USAGE_STATS` 是敏感权限，可以追踪用户的应用使用习惯。为了保护用户隐私，Android 要求：
- 无法通过普通权限请求获取
- 必须用户在系统设置中手动授权
- 应用需要明确告知用户用途

## 相关文件

- `agent/app/src/main/java/com/appmanager/agent/util/ForegroundAppDetector.kt`
- `agent/app/src/main/java/com/appmanager/agent/service/DeviceInfoPayload.kt`
- `agent/app/src/main/java/com/appmanager/agent/ui/PermissionFragment.kt`
- `agent/app/src/main/AndroidManifest.xml`

## 编译状态

- ✅ v2 改进已实现
- ✅ 添加详细日志
- ✅ 扩大时间窗口到 10 秒
- ✅ Android Agent 编译成功
