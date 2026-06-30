# X5 内核集成 - Agent 端实现说明

**完成日期**: 2026-06-29  
**实施人**: Claude Code

---

## 已实现内容

### 1. X5KernelManager.kt
**路径**: `agent/app/src/main/java/com/appmanager/agent/x5/X5KernelManager.kt`

核心功能：
- ✅ 初始化 X5 内核（仅 Android 9+ 启用）
- ✅ 从 Server 获取最新内核版本
- ✅ 下载内核文件（支持断点续传 + MD5 校验）
- ✅ 安装内核（调用 QbSdk API）
- ✅ 失败重试机制（最多 3 次）
- ✅ 降级策略（失败后使用系统 WebView）
- ✅ 状态管理（6 种状态：未安装/下载中/安装中/已安装/失败/系统 WebView）

### 2. X5WebViewFactory.kt
**路径**: `agent/app/src/main/java/com/appmanager/agent/x5/X5WebViewFactory.kt`

核心功能：
- ✅ WebView 工厂模式
- ✅ 统一的 WebViewWrapper 接口
- ✅ X5WebViewWrapper（封装腾讯 X5）
- ✅ SystemWebViewWrapper（封装系统 WebView）
- ✅ WebSettingsWrapper 接口（统一配置 API）
- ✅ 自动根据内核状态选择实现

### 3. build.gradle 依赖
**路径**: `agent/app/build.gradle`

- ✅ 添加 `implementation 'com.tencent.tbs:tbssdk:44286'`

---

## 集成步骤（需要手动完成）

### 第 1 步：在 AgentService.onCreate 中初始化 X5

```kotlin
// AgentService.kt - onCreate() 方法中添加
import com.appmanager.agent.x5.X5KernelManager

override fun onCreate() {
    super.onCreate()
    
    // 初始化 X5 内核
    X5KernelManager.init(this)
    
    // ... 现有代码
}
```

### 第 2 步：在 HeartbeatManager 中检查内核更新

在心跳上报时调用 X5KernelManager 检查更新：

```kotlin
// HeartbeatManager.kt 或 AgentService.kt 心跳逻辑中
import com.appmanager.agent.x5.X5KernelManager

// 在心跳协程中异步检查
lifecycleScope.launch {
    try {
        X5KernelManager.checkAndUpdate(
            context = this@AgentService,
            serverUrl = config.serverUrl,
            token = deviceToken
        )
    } catch (e: Exception) {
        Log.e(TAG, "X5 kernel check failed", e)
    }
}
```

### 第 3 步：在心跳消息中上报内核版本

修改 DeviceInfoMessage 添加 x5_version 字段：

```kotlin
// ws/DeviceInfoMessage.kt
data class DeviceInfoMessage(
    // ... 现有字段
    val x5_version: Int = 0,  // 新增：X5 内核版本
    val x5_state: String = ""  // 新增：内核状态
)
```

在构建心跳消息时：

```kotlin
val x5Version = X5KernelManager.getLocalVersion()
val x5State = X5KernelManager.getState().name

DeviceInfoMessage(
    // ... 现有字段
    x5_version = x5Version,
    x5_state = x5State
)
```

### 第 4 步：修改 FormAppActivity 使用 X5WebView

```kotlin
// FormAppActivity.kt
import com.appmanager.agent.x5.X5WebViewFactory
import com.appmanager.agent.x5.WebViewWrapper

class FormAppActivity : AppCompatActivity() {
    // 修改字段类型
    private lateinit var webView: WebViewWrapper  // 改为 WebViewWrapper
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 使用工厂创建 WebView
        webView = X5WebViewFactory.createWebView(this)
        setContentView(webView.getView())
        
        // ... 原有代码，修改为使用 wrapper API
        
        val settings = webView.getSettings()
        settings.setJavaScriptEnabled(true)
        settings.setDomStorageEnabled(true)
        // ... 其他配置
        
        webView.addJavascriptInterface(bridge, "AndroidBridge")
        
        // WebViewClient - 需要创建对应的实现
        webView.setWebViewClient(createWebViewClient())
        webView.setWebChromeClient(createWebChromeClient())
        
        webView.loadUrl(url)
    }
    
    // 根据当前使用的 WebView 类型返回对应的 Client
    private fun createWebViewClient(): Any {
        return if (X5WebViewFactory.isUsingX5()) {
            object : com.tencent.smtt.sdk.WebViewClient() {
                // X5 实现
            }
        } else {
            object : android.webkit.WebViewClient() {
                // 系统 WebView 实现
            }
        }
    }
    
    private fun createWebChromeClient(): Any {
        return if (X5WebViewFactory.isUsingX5()) {
            object : com.tencent.smtt.sdk.WebChromeClient() {
                // X5 实现
            }
        } else {
            object : android.webkit.WebChromeClient() {
                // 系统 WebView 实现
            }
        }
    }
}
```

### 第 5 步：同样修改其他 WebView Activity

需要改造的文件：
- `InAppWebActivity.kt`（如果存在）
- `ScadaWebViewActivity.kt`（如果存在）

使用相同的工厂模式替换。

---

## Server 端扩展（可选）

如果需要在 Web 管理界面显示设备的 X5 内核版本，需要：

1. 修改 `models/device.go` 添加字段：

```go
type Device struct {
    // ... 现有字段
    X5Version int    `json:"x5_version" gorm:"default:0"`
    X5State   string `json:"x5_state" gorm:"size:20"`
}
```

2. 在心跳处理中更新这些字段（`agent/hub.go` 或相应的心跳处理逻辑）

---

## 测试验证

### 1. 本地测试
```bash
# 编译 Agent
cd agent
./gradlew assembleDebug

# 安装到设备
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 2. 验证流程

1. **启动 Agent**，观察日志：
   ```
   X5KernelManager: Android version >= 9, initializing X5
   X5KernelManager: X5 kernel not installed
   ```

2. **触发心跳**，观察下载：
   ```
   X5KernelManager: New kernel version available: 4.8.445
   X5KernelManager: Download progress: 50% (...)
   X5KernelManager: Kernel downloaded successfully, MD5 verified
   X5KernelManager: Installing X5 kernel from ...
   X5KernelManager: X5 kernel installed successfully, version=48445
   ```

3. **打开 Form App**，验证：
   - 检查 Console 输出确认使用的 WebView 类型
   - Android 9 设备上应该看到 X5 加载成功

4. **降级测试**：
   - 删除激活的内核版本
   - Agent 应自动降级到系统 WebView

---

## 当前状态

✅ **代码已完成**：
- X5KernelManager.kt (330 行)
- X5WebViewFactory.kt (360 行)
- build.gradle 依赖已添加

⏳ **需要手动集成**（约 30 分钟工作量）：
1. AgentService 添加初始化调用
2. 心跳逻辑添加更新检查
3. DeviceInfoMessage 添加字段
4. FormAppActivity 改造使用 wrapper
5. 其他 WebView Activity 改造

📋 **测试待完成**：
- Android 9 设备功能测试
- 下载/安装流程验证
- 断点续传测试
- 降级策略验证

---

## 架构图

```
FormAppActivity
    │
    ├─> X5WebViewFactory.createWebView()
    │       │
    │       ├─> X5KernelManager.getState()
    │       │       │
    │       │       └─> INSTALLED ? X5WebViewWrapper : SystemWebViewWrapper
    │       │
    │       └─> return WebViewWrapper
    │
    └─> webView.loadUrl(url)  // 统一接口

AgentService (onCreate)
    │
    └─> X5KernelManager.init(context)
            │
            └─> QbSdk.preInit() 
                    │
                    └─> onCoreInitFinished: 
                        检查本地版本，设置状态

AgentService (心跳)
    │
    └─> X5KernelManager.checkAndUpdate()
            │
            ├─> fetchLatestVersion()  // GET /api/x5-kernel/latest
            │
            ├─> downloadAndInstall()  // 断点续传 + MD5
            │
            └─> QbSdk.installLocalTbsCore()
```

---

**总进度**: 阶段 3 代码完成 100%，集成待完成  
**预计完成时间**: 手动集成 30 分钟 + 测试 1 小时
