# X5 内核手动控制功能 - 使用说明

**完成日期**: 2026-06-29  
**功能**: 用户可在设置页面手动控制 X5 内核的启用/禁用和更新

---

## 🎯 新增功能

### 1. X5 内核管理区域（设置页面）

在 Agent 设置页面新增了完整的 X5 内核控制区域：

- ✅ **状态显示** - 实时显示内核状态和版本号
- ✅ **启用开关** - 用户可选择启用或禁用 X5 内核
- ✅ **自动更新开关** - 控制是否自动检查更新
- ✅ **手动检查更新按钮** - 立即触发更新检查

### 2. 状态指示

| 状态 | 颜色 | 说明 |
|------|------|------|
| 已安装 | 🟢 绿色 | X5 内核已成功安装 |
| 下载中... | 🟠 橙色 | 正在从服务器下载内核 |
| 安装中... | 🟠 橙色 | 正在安装下载的内核 |
| 未安装 | ⚪ 灰色 | 内核尚未安装 |
| 安装失败 | 🔴 红色 | 安装失败（已降级到系统 WebView）|
| 使用系统 WebView | ⚪ 灰色 | Android < 9 或用户禁用 |

---

## 📱 使用方法

### 查看 X5 状态

1. 打开 Agent 应用
2. 进入"设置"页面
3. 滚动到"X5 内核"区域
4. 查看当前状态和版本信息

### 启用/禁用 X5 内核

1. 在设置页面找到"启用 X5 内核"开关
2. 打开开关 = 启用 X5（默认）
3. 关闭开关 = 禁用 X5，强制使用系统 WebView
4. **重启 App 生效**（会显示提示）

**使用场景**：
- 调试问题时临时切换到系统 WebView
- X5 内核有兼容性问题时快速降级
- 对比 X5 和系统 WebView 的性能差异

### 控制自动更新

1. 找到"自动检查更新"开关
2. 打开（默认）= 心跳时每 5 分钟自动检查
3. 关闭 = 禁用自动更新，仅手动触发

**使用场景**：
- 流量受限时关闭自动更新
- 仅在需要时手动更新

### 手动检查更新

1. 点击"手动检查更新"按钮
2. 按钮显示"检查中..."
3. 等待检查完成（1-3 秒）
4. 根据提示操作：
   - **已是最新版本** - 无需操作
   - **正在下载/安装** - 等待完成（观察状态变化）
   - **检查失败** - 检查网络和服务器配置

---

## 🔧 技术实现

### 1. X5Preferences.kt（偏好设置）

```kotlin
// 检查用户是否启用 X5
val enabled = X5Preferences.isX5Enabled(context)

// 设置启用状态
X5Preferences.setX5Enabled(context, true/false)

// 检查是否自动更新
val autoUpdate = X5Preferences.isAutoUpdateEnabled(context)

// 设置自动更新
X5Preferences.setAutoUpdateEnabled(context, true/false)
```

### 2. X5WebViewFactory 修改

现在会检查用户偏好：

```kotlin
fun createWebView(context: Context): WebViewWrapper {
    // 1. 检查用户是否启用
    val x5Enabled = X5Preferences.isX5Enabled(context)
    if (!x5Enabled) {
        return SystemWebViewWrapper(context)
    }
    
    // 2. 检查内核状态
    val state = X5KernelManager.getState()
    if (state == INSTALLED) {
        return X5WebViewWrapper(context)
    }
    
    // 3. 降级到系统 WebView
    return SystemWebViewWrapper(context)
}
```

### 3. HeartbeatManager 修改

自动更新现在会检查用户偏好：

```kotlin
if (heartbeatCount % 10 == 0) {
    val autoUpdate = X5Preferences.isAutoUpdateEnabled(context)
    if (autoUpdate) {
        X5KernelManager.checkAndUpdate(...)
    }
}
```

---

## 🎨 UI 布局

### 设置页面新增区域

```xml
<!-- X5 内核管理 -->
<MaterialCardView>
    <LinearLayout>
        <TextView>X5 内核</TextView>
        <TextView>提升 Android 9+ 设备的 WebView 兼容性</TextView>
        
        <!-- 状态显示 -->
        <TextView id="tvX5State">已安装</TextView>
        <TextView id="tvX5Version">版本: 48445 (4.8.445)</TextView>
        
        <!-- 控制开关 -->
        <SwitchCompat id="switchX5Enabled">启用 X5 内核</SwitchCompat>
        <SwitchCompat id="switchX5AutoUpdate">自动检查更新</SwitchCompat>
        
        <!-- 手动更新按钮 -->
        <Button id="btnX5CheckUpdate">手动检查更新</Button>
    </LinearLayout>
</MaterialCardView>
```

---

## 📊 用户偏好存储

偏好设置保存在 SharedPreferences：

```
文件: x5_preferences.xml
位置: /data/data/com.appmanager.agent/shared_prefs/

内容:
{
    "x5_enabled": true,          // 是否启用 X5
    "x5_auto_update": true       // 是否自动更新
}
```

---

## 🔄 完整工作流程

### 场景 1：启用 X5（默认）

```
1. 用户打开 App
   └─> AgentService.onCreate()
       └─> X5KernelManager.init()
           └─> 检查本地版本

2. 心跳运行（自动更新开启）
   └─> 每 5 分钟检查更新
       └─> 发现新版本 → 下载安装

3. 用户打开 FormApp
   └─> X5WebViewFactory.createWebView()
       ├─> 用户启用 X5？✅
       ├─> 内核已安装？✅
       └─> 返回 X5WebViewWrapper
```

### 场景 2：用户禁用 X5

```
1. 用户在设置页面关闭"启用 X5 内核"
   └─> X5Preferences.setX5Enabled(false)
   └─> 提示"重启 App 生效"

2. 用户重启 App

3. 用户打开 FormApp
   └─> X5WebViewFactory.createWebView()
       ├─> 用户启用 X5？❌
       └─> 返回 SystemWebViewWrapper（强制使用系统）
```

### 场景 3：关闭自动更新 + 手动更新

```
1. 用户关闭"自动检查更新"
   └─> X5Preferences.setAutoUpdateEnabled(false)

2. 心跳运行
   └─> 检测到自动更新关闭
       └─> 跳过更新检查

3. 用户点击"手动检查更新"
   └─> X5KernelManager.checkAndUpdate()
       ├─> 请求 /api/x5-kernel/latest
       ├─> 比对版本
       └─> 需要更新 → 下载安装

4. 状态实时更新
   └─> 下载中... → 安装中... → 已安装
```

---

## 🧪 测试清单

### 基础功能测试

- [ ] 设置页面显示 X5 状态和版本
- [ ] "启用 X5 内核"开关可切换
- [ ] "自动检查更新"开关可切换
- [ ] "手动检查更新"按钮可点击
- [ ] 状态颜色正确显示（绿/橙/灰/红）

### 开关功能测试

- [ ] 关闭 X5 开关 → 重启 App → FormApp 使用系统 WebView
- [ ] 打开 X5 开关 → 重启 App → FormApp 使用 X5（如已安装）
- [ ] 关闭自动更新 → 心跳不再检查更新
- [ ] 打开自动更新 → 心跳恢复检查更新

### 手动更新测试

- [ ] 点击"手动检查更新" → 按钮显示"检查中..."
- [ ] 已是最新版本 → 提示"内核已是最新版本"
- [ ] 有新版本 → 提示"正在下载/安装"
- [ ] 状态实时更新（未安装 → 下载中 → 安装中 → 已安装）
- [ ] 检查失败 → 显示错误信息

### 边界情况测试

- [ ] 未配置服务器 → 提示"请先配置服务器地址"
- [ ] 设备未注册 → 提示"设备未注册"
- [ ] 网络断开 → 提示"检查失败"
- [ ] Android < 9 → 状态显示"使用系统 WebView"

---

## 📝 开发说明

### 添加更多控制功能

如果需要添加更多控制，可参考以下模式：

```kotlin
// 1. 在 X5Preferences 添加新偏好
fun isFeatureXEnabled(context: Context): Boolean {
    return getPrefs(context).getBoolean("feature_x", true)
}

// 2. 在 layout 添加控件
<SwitchCompat id="switchFeatureX" />

// 3. 在 SettingsActivity 绑定
switchFeatureX.setOnCheckedChangeListener { _, isChecked ->
    X5Preferences.setFeatureXEnabled(this, isChecked)
}

// 4. 在相应逻辑处检查偏好
if (X5Preferences.isFeatureXEnabled(context)) {
    // 执行功能 X
}
```

---

## 🎊 完成总结

✅ **UI 实现** - 设置页面新增完整的 X5 管理区域  
✅ **偏好存储** - SharedPreferences 持久化用户选择  
✅ **开关控制** - 启用/禁用 X5，自动更新开关  
✅ **手动更新** - 立即触发更新检查  
✅ **状态同步** - 实时显示内核状态和版本  
✅ **降级策略** - 用户可快速切换到系统 WebView  
✅ **编译通过** - APK 成功构建

---

**实施完成**: 2026-06-29 23:30  
**新增代码**: X5Preferences.kt (40 行) + UI 布局 (100 行) + SettingsActivity 逻辑 (80 行)  
**总计**: ~220 行代码
