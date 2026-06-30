# X5 内核集成技术方案

## 1. 目标与背景

### 1.1 目标
- **最终支持范围**: Android 9+ (API 28+)
- **核心目标**: 通过腾讯 x5 内核解决低版本 Android WebView 对现代前端特性支持不足的问题
- **部署方式**: 内核文件由平台动态下发，不打包在 APK 内

### 1.2 背景问题
- Android 9 系统 WebView 基于 Chrome 66-69，对现代 ES 特性支持不完整
- form-app 使用 Vite + React，即使经过 legacy plugin 转译，部分特性仍可能在低版本 WebView 中不稳定
- x5 内核基于较新的 Chromium，可提供更稳定的 Web 运行环境

---

## 2. 整体架构设计

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Server 端                             │
├─────────────────────────────────────────────────────────────┤
│  • X5 内核文件存储 (storage/x5-kernel/)                      │
│  • 版本管理 (models.X5KernelVersion)                         │
│  • 下载 API (/api/x5-kernel/*)                               │
│  • 管理界面 (web: 系统设置 > X5 内核管理)                     │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTPS Download
┌─────────────────────────────────────────────────────────────┐
│                        Agent 端                              │
├─────────────────────────────────────────────────────────────┤
│  X5KernelManager (Kotlin)                                    │
│  ├─ 版本检查 (心跳上报本地版本，server 返回最新版本)          │
│  ├─ 下载管理 (断点续传，MD5 校验)                             │
│  ├─ 安装管理 (TBS 内核安装，状态监听)                         │
│  └─ 降级策略 (失败 3 次自动降级回系统 WebView)                │
│                                                              │
│  X5WebViewFactory                                            │
│  ├─ createWebView() → 根据内核状态返回 X5WebView 或 WebView  │
│  └─ 统一 WebView 创建入口                                    │
│                                                              │
│  改造点:                                                     │
│  ├─ FormAppActivity: 使用 X5WebViewFactory                   │
│  ├─ InAppWebActivity: 使用 X5WebViewFactory                  │
│  └─ ScadaWebViewActivity: 使用 X5WebViewFactory              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 内核加载策略

```kotlin
优先级:
1. X5 内核可用 → 使用 X5WebView
2. X5 内核未安装/损坏/版本过低 → 后台下载+安装，当前使用系统 WebView
3. X5 内核安装失败 3 次 → 降级为系统 WebView（本次会话不再尝试）
4. Android 版本 < 9 → 直接使用系统 WebView（不下载 x5）
```

---

## 3. Server 端实现

### 3.1 数据库模型

```go
// server/models/x5_kernel.go
type X5KernelVersion struct {
    ID          uint      `json:"id" gorm:"primaryKey"`
    Version     string    `json:"version" gorm:"uniqueIndex;not null"` // 如 "4.5.0.236"
    VersionCode int       `json:"version_code" gorm:"not null"`        // 数值版本号，便于比较
    CoreType    string    `json:"core_type" gorm:"not null"`           // "TBS" (固定)
    MinAndroid  int       `json:"min_android" gorm:"not null"`         // 最低支持 Android API Level (28)
    FilePath    string    `json:"file_path" gorm:"not null"`           // storage/x5-kernel/tbs_core_046500236_20241201.tbs
    FileSize    int64     `json:"file_size" gorm:"not null"`           // 字节数
    FileMD5     string    `json:"file_md5" gorm:"not null"`            // 校验和
    IsActive    bool      `json:"is_active" gorm:"default:false"`      // 是否为当前激活版本
    UploadedBy  uint      `json:"uploaded_by"`
    UploadedAt  time.Time `json:"uploaded_at" gorm:"autoCreateTime"`
    Remark      string    `json:"remark" gorm:"type:text"`             // 版本说明
}
```

### 3.2 API 接口

```go
// server/api/x5_kernel.go

// 管理端 API (需要 admin 权限)
GET    /api/x5-kernel/versions              // 列出所有版本
POST   /api/x5-kernel/versions              // 上传新版本 (multipart/form-data)
PUT    /api/x5-kernel/versions/:id/activate // 激活某个版本
DELETE /api/x5-kernel/versions/:id          // 删除版本 (非激活版本)

// Agent 端 API (需要 device token 认证)
GET    /api/x5-kernel/latest                // 获取最新激活版本信息
       返回: { version, version_code, file_size, file_md5, download_url }
GET    /api/x5-kernel/download/:version     // 下载内核文件
       支持 Range 请求（断点续传）
       返回: application/octet-stream
```

### 3.3 存储结构

```
storage/
└── x5-kernel/
    ├── tbs_core_046500236_20241201.tbs    # 内核文件 (约 40-50MB)
    ├── tbs_core_046600245_20250115.tbs
    └── ...
```

### 3.4 管理界面 (web)

路径: **系统设置 > X5 内核管理**

功能:
- 版本列表展示 (版本号、文件大小、上传时间、激活状态)
- 上传新版本 (文件选择 + 版本信息填写)
- 激活/停用版本
- 删除旧版本
- 查看各设备内核使用情况统计

---

## 4. Agent 端实现

### 4.1 依赖集成

```gradle
// agent/app/build.gradle

dependencies {
    // 腾讯 X5 内核 SDK (动态加载版本)
    implementation 'com.tencent.tbs:tbssdk:44286'  // 最新版本号以官方为准
    
    // 现有依赖保持不变
    // ...
}
```

**关键点**: 使用 `tbssdk` 而非 `tbs-core-share`，前者支持动态下载内核。

### 4.2 核心类设计

#### 4.2.1 X5KernelManager (内核管理器)

```kotlin
// agent/app/src/main/java/com/appmanager/agent/x5/X5KernelManager.kt

object X5KernelManager {
    private const val TAG = "X5KernelManager"
    private const val MAX_RETRY = 3
    private const val KERNEL_DIR = "x5_kernel"
    
    enum class KernelState {
        NOT_INSTALLED,      // 未安装
        DOWNLOADING,        // 下载中
        INSTALLING,         // 安装中
        INSTALLED,          // 已安装
        FAILED,             // 失败（超过重试次数）
        SYSTEM_WEBVIEW      // 降级使用系统 WebView
    }
    
    private var currentState = KernelState.NOT_INSTALLED
    private var retryCount = 0
    private var localVersion = 0  // 本地已安装的版本号
    
    /**
     * 初始化 X5 内核（在 AgentService.onCreate 中调用）
     */
    fun init(context: Context) {
        // 仅 Android 9+ 使用 x5
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            currentState = KernelState.SYSTEM_WEBVIEW
            return
        }
        
        // 配置 X5 内核参数
        val settings = HashMap<String, Any>().apply {
            put(TbsCoreSettings.TBS_SETTINGS_USE_SPEEDY_CLASSLOADER, true)
            put(TbsCoreSettings.TBS_SETTINGS_USE_DEXLOADER_SERVICE, true)
        }
        QbSdk.initTbsSettings(settings)
        
        // 设置下载监听
        QbSdk.setDownloadWithoutWifi(true)  // 允许非 WiFi 下载
        QbSdk.setTbsListener(object : TbsListener {
            override fun onDownloadFinish(code: Int) {
                Log.d(TAG, "X5 kernel download finished: code=$code")
                if (code == 100) {
                    currentState = KernelState.INSTALLING
                }
            }
            
            override fun onInstallFinish(code: Int) {
                Log.d(TAG, "X5 kernel install finished: code=$code")
                if (code == 200) {
                    currentState = KernelState.INSTALLED
                    localVersion = QbSdk.getTbsVersion(context)
                    retryCount = 0
                } else {
                    handleInstallFailed()
                }
            }
            
            override fun onDownloadProgress(progress: Int) {
                Log.d(TAG, "X5 kernel downloading: $progress%")
            }
        })
        
        // 预初始化 X5 内核
        QbSdk.preInit(context, object : PreInitCallback {
            override fun onCoreInitFinished() {
                localVersion = QbSdk.getTbsVersion(context)
                currentState = if (localVersion > 0) {
                    KernelState.INSTALLED
                } else {
                    KernelState.NOT_INSTALLED
                }
                Log.d(TAG, "X5 kernel init finished, version=$localVersion, state=$currentState")
            }
            
            override fun onViewInitFinished(success: Boolean) {
                Log.d(TAG, "X5 WebView init: success=$success")
            }
        })
    }
    
    /**
     * 检查并更新内核（心跳时调用）
     */
    suspend fun checkAndUpdate(context: Context, serverUrl: String, token: String) {
        if (currentState == KernelState.SYSTEM_WEBVIEW || currentState == KernelState.FAILED) {
            return  // 已降级或失败，不再尝试
        }
        
        try {
            val latest = fetchLatestVersion(serverUrl, token)
            if (latest.versionCode > localVersion) {
                Log.d(TAG, "New kernel version available: ${latest.version}")
                downloadAndInstall(context, serverUrl, token, latest)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check kernel update", e)
        }
    }
    
    /**
     * 获取当前状态（供 WebView 创建时判断）
     */
    fun getState(): KernelState = currentState
    
    fun getLocalVersion(): Int = localVersion
    
    private fun handleInstallFailed() {
        retryCount++
        if (retryCount >= MAX_RETRY) {
            Log.w(TAG, "X5 kernel install failed $MAX_RETRY times, fallback to system WebView")
            currentState = KernelState.FAILED
        } else {
            currentState = KernelState.NOT_INSTALLED
        }
    }
    
    private suspend fun fetchLatestVersion(serverUrl: String, token: String): KernelVersionInfo {
        // HTTP GET $serverUrl/api/x5-kernel/latest
        // ...
    }
    
    private suspend fun downloadAndInstall(
        context: Context, 
        serverUrl: String, 
        token: String, 
        version: KernelVersionInfo
    ) {
        currentState = KernelState.DOWNLOADING
        val kernelDir = File(context.filesDir, KERNEL_DIR)
        kernelDir.mkdirs()
        
        val localFile = File(kernelDir, "tbs_core_${version.versionCode}.tbs")
        
        // 下载内核文件（支持断点续传）
        downloadWithResume(
            url = "$serverUrl/api/x5-kernel/download/${version.version}",
            token = token,
            localFile = localFile,
            expectedMD5 = version.fileMD5
        )
        
        // 安装内核
        QbSdk.installLocalTbsCore(context, localFile.absolutePath)
    }
    
    private suspend fun downloadWithResume(
        url: String, 
        token: String, 
        localFile: File,
        expectedMD5: String
    ) {
        // OkHttp 实现断点续传下载 + MD5 校验
        // ...
    }
}

data class KernelVersionInfo(
    val version: String,
    val versionCode: Int,
    val fileSize: Long,
    val fileMD5: String
)
```

#### 4.2.2 X5WebViewFactory (WebView 工厂)

```kotlin
// agent/app/src/main/java/com/appmanager/agent/x5/X5WebViewFactory.kt

object X5WebViewFactory {
    
    /**
     * 创建 WebView（统一入口）
     */
    fun createWebView(context: Context): BaseWebView {
        return when (X5KernelManager.getState()) {
            X5KernelManager.KernelState.INSTALLED -> {
                Log.d("X5Factory", "Using X5WebView")
                X5WebViewWrapper(context)
            }
            else -> {
                Log.d("X5Factory", "Using system WebView")
                SystemWebViewWrapper(context)
            }
        }
    }
}

/**
 * WebView 统一接口
 */
interface BaseWebView {
    fun getView(): View
    fun loadUrl(url: String)
    fun canGoBack(): Boolean
    fun goBack()
    fun destroy()
    fun addJavascriptInterface(obj: Any, name: String)
    fun evaluateJavascript(script: String, callback: ((String?) -> Unit)?)
    // ... 其他常用方法
}

/**
 * X5 WebView 包装器
 */
class X5WebViewWrapper(context: Context) : BaseWebView {
    private val webView = com.tencent.smtt.sdk.WebView(context)
    
    override fun getView(): View = webView
    override fun loadUrl(url: String) = webView.loadUrl(url)
    override fun canGoBack() = webView.canGoBack()
    override fun goBack() = webView.goBack()
    override fun destroy() = webView.destroy()
    override fun addJavascriptInterface(obj: Any, name: String) = 
        webView.addJavascriptInterface(obj, name)
    override fun evaluateJavascript(script: String, callback: ((String?) -> Unit)?) = 
        webView.evaluateJavascript(script) { callback?.invoke(it) }
    
    fun getSettings(): com.tencent.smtt.sdk.WebSettings = webView.settings
    fun setWebViewClient(client: com.tencent.smtt.sdk.WebViewClient) {
        webView.webViewClient = client
    }
    fun setWebChromeClient(client: com.tencent.smtt.sdk.WebChromeClient) {
        webView.webChromeClient = client
    }
}

/**
 * 系统 WebView 包装器
 */
class SystemWebViewWrapper(context: Context) : BaseWebView {
    private val webView = android.webkit.WebView(context)
    
    override fun getView(): View = webView
    override fun loadUrl(url: String) = webView.loadUrl(url)
    override fun canGoBack() = webView.canGoBack()
    override fun goBack() = webView.goBack()
    override fun destroy() = webView.destroy()
    override fun addJavascriptInterface(obj: Any, name: String) = 
        webView.addJavascriptInterface(obj, name)
    override fun evaluateJavascript(script: String, callback: ((String?) -> Unit)?) = 
        webView.evaluateJavascript(script, callback)
    
    fun getSettings(): android.webkit.WebSettings = webView.settings
    fun setWebViewClient(client: android.webkit.WebViewClient) {
        webView.webViewClient = client
    }
    fun setWebChromeClient(client: android.webkit.WebChromeClient) {
        webView.webChromeClient = client
    }
}
```

### 4.3 Activity 改造

#### FormAppActivity 改造示例

```kotlin
// agent/app/src/main/java/com/appmanager/agent/FormAppActivity.kt

class FormAppActivity : AppCompatActivity() {
    private lateinit var webViewWrapper: BaseWebView
    private lateinit var bridge: FormAppBridge
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 使用工厂创建 WebView
        webViewWrapper = X5WebViewFactory.createWebView(this)
        setContentView(webViewWrapper.getView())
        
        // 配置 WebView（兼容 X5 和系统 WebView）
        when (webViewWrapper) {
            is X5WebViewWrapper -> configureX5WebView(webViewWrapper)
            is SystemWebViewWrapper -> configureSystemWebView(webViewWrapper)
        }
        
        // 注册 Bridge
        bridge = FormAppBridge(this, this, webViewWrapper, formAppCode)
        webViewWrapper.addJavascriptInterface(bridge, "AndroidBridge")
        
        // 加载 URL
        val url = "$base/form-app/runtime/$formAppCode?page=$pageKey"
        webViewWrapper.loadUrl(url)
    }
    
    private fun configureX5WebView(wrapper: X5WebViewWrapper) {
        wrapper.getSettings().apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mixedContentMode = com.tencent.smtt.sdk.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            // ... 其他配置
        }
        
        wrapper.setWebViewClient(object : com.tencent.smtt.sdk.WebViewClient() {
            override fun onReceivedError(view: com.tencent.smtt.sdk.WebView?, 
                                        request: WebResourceRequest?, 
                                        error: WebResourceError?) {
                Log.e(TAG, "X5 WebView error: ${error?.errorCode}")
            }
        })
        
        wrapper.setWebChromeClient(object : com.tencent.smtt.sdk.WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage?): Boolean {
                Log.d(TAG, "JS Console: ${message?.message()}")
                return true
            }
        })
    }
    
    private fun configureSystemWebView(wrapper: SystemWebViewWrapper) {
        // 系统 WebView 配置（与原代码相同）
        wrapper.getSettings().apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // ...
        }
        
        wrapper.setWebViewClient(object : android.webkit.WebViewClient() {
            // ...
        })
        
        wrapper.setWebChromeClient(object : android.webkit.WebChromeClient() {
            // ...
        })
    }
    
    override fun onDestroy() {
        webViewWrapper.destroy()
        super.onDestroy()
    }
}
```

### 4.4 心跳上报内核版本

```kotlin
// agent/app/src/main/java/com/appmanager/agent/HeartbeatManager.kt

class HeartbeatManager(private val context: Context) {
    
    fun collectDeviceInfo(): DeviceInfo {
        return DeviceInfo(
            // ... 现有字段
            x5KernelVersion = X5KernelManager.getLocalVersion(),
            x5KernelState = X5KernelManager.getState().name,
            // ...
        )
    }
}

// server/models/device.go
type Device struct {
    // ... 现有字段
    X5KernelVersion int    `json:"x5_kernel_version"`
    X5KernelState   string `json:"x5_kernel_state"`
    // ...
}
```

---

## 5. 内核文件获取

### 5.1 官方渠道

腾讯 X5 内核文件获取方式:
1. **官方 SDK 集成**: 通过 `tbssdk` 依赖，首次运行时自动从腾讯服务器下载
2. **手动下载**: 访问 https://x5.tencent.com/docs/access.html 获取离线内核包

### 5.2 内核包格式

```
tbs_core_046500236_20241201.tbs
    ├─ 文件大小: 约 40-50MB
    ├─ 版本号: 4.5.0.236
    └─ 格式: 专有二进制格式 (.tbs)
```

### 5.3 首次部署建议

1. 开发环境下载测试内核包
2. 通过管理界面上传至平台
3. 激活该版本作为默认内核
4. agent 设备首次连接时自动下载安装

---

## 6. 实施步骤

### 阶段 1: Server 端基础设施 (Week 1)

- [ ] 创建数据库模型 `X5KernelVersion`
- [ ] 实现 API 路由 `/api/x5-kernel/*`
- [ ] 实现文件上传、存储、下载逻辑
- [ ] 添加 Range 请求支持（断点续传）
- [ ] 迁移脚本和初始化代码

### 阶段 2: Web 管理界面 (Week 1)

- [ ] 新增"X5 内核管理"页面
- [ ] 实现版本列表、上传、激活、删除功能
- [ ] 添加设备内核使用情况统计

### 阶段 3: Agent 端集成 (Week 2)

- [ ] 添加 `tbssdk` 依赖
- [ ] 实现 `X5KernelManager` 核心逻辑
- [ ] 实现 `X5WebViewFactory` 和包装器
- [ ] 改造 `FormAppActivity`
- [ ] 改造 `InAppWebActivity`
- [ ] 改造 `ScadaWebViewActivity`
- [ ] 心跳上报内核版本

### 阶段 4: 测试验证 (Week 2)

- [ ] Android 9 设备兼容性测试
- [ ] 内核下载/安装流程测试
- [ ] 断点续传测试
- [ ] 降级策略测试
- [ ] form-app 功能完整性测试

### 阶段 5: 文档与部署 (Week 3)

- [ ] 编写管理员操作手册
- [ ] 更新 CLAUDE.md 文档
- [ ] 准备首个内核包版本
- [ ] 灰度发布测试
- [ ] 全量发布

---

## 7. 风险与应对

### 7.1 技术风险

| 风险 | 影响 | 应对措施 |
|-----|------|---------|
| X5 内核安装失败 | 设备无法使用 form-app | 自动降级系统 WebView + 重试机制 |
| 内核文件损坏 | 下载浪费流量 | MD5 校验 + 断点续传 |
| 内核体积大 (40-50MB) | 首次下载耗时长 | 后台静默下载 + WiFi 提示 |
| X5 API 与系统 WebView 不完全兼容 | 代码需要分支处理 | 统一接口封装 (BaseWebView) |

### 7.2 运维风险

| 风险 | 影响 | 应对措施 |
|-----|------|---------|
| 存储空间消耗 | 每个版本 50MB | 只保留最近 3 个版本 |
| 带宽消耗 | 大量设备同时下载 | 分批推送 + CDN 加速 |
| 内核版本管理混乱 | 升级回退困难 | 版本激活机制 + 回滚功能 |

---

## 8. 性能与监控

### 8.1 关键指标

- **内核安装成功率**: 目标 > 95%
- **内核下载完成率**: 目标 > 90%
- **form-app 白屏率**: 目标 < 1%
- **WebView 崩溃率**: 目标 < 0.5%

### 8.2 监控点

1. 心跳数据中增加内核状态字段
2. 设备详情页显示内核版本和状态
3. 内核下载失败日志上报
4. WebView 错误上报（JS Console Error）

---

## 9. 后续优化

### Phase 2 (可选)

- [ ] 内核文件 CDN 加速
- [ ] 增量更新支持（差分包）
- [ ] 多版本并存支持（A/B Testing）
- [ ] 内核性能对比报表
- [ ] 自动回退机制（检测崩溃率自动切换版本）

---

## 10. 相关文档

- [腾讯 X5 内核官方文档](https://x5.tencent.com/docs/access.html)
- [TBS SDK 接入指南](https://x5.tencent.com/docs/index.html)
- [WebView 优化最佳实践](https://developer.android.com/guide/webapps/webview)

---

## 附录: 核心代码文件清单

### Server 端
```
server/
├── models/x5_kernel.go                 # 数据模型
├── api/x5_kernel.go                    # API 路由
├── migrations/2026_06_29_x5_kernel.go  # 迁移脚本
└── storage/x5-kernel/                  # 内核文件存储

web/
└── src/views/X5KernelManagement.vue    # 管理界面
```

### Agent 端
```
agent/app/src/main/java/com/appmanager/agent/
├── x5/
│   ├── X5KernelManager.kt              # 内核管理器
│   ├── X5WebViewFactory.kt             # WebView 工厂
│   ├── X5WebViewWrapper.kt             # X5 包装器
│   └── SystemWebViewWrapper.kt         # 系统 WebView 包装器
├── FormAppActivity.kt                  # 改造: 使用工厂创建 WebView
├── ui/InAppWebActivity.kt              # 改造: 使用工厂创建 WebView
└── ui/ScadaWebViewActivity.kt          # 改造: 使用工厂创建 WebView

agent/app/build.gradle                  # 添加 tbssdk 依赖
```

---

**方案版本**: v1.0  
**创建日期**: 2026-06-29  
**维护者**: 平台团队
