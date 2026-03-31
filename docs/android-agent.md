# Android Agent App 技术文档

## 概述

Android Agent 是安装在被管理 Android 设备上的后台服务 App，提供超出 ADB 能力范围的增强管理功能。
无 Agent 时退化为纯 ADB 模式，安装 Agent 后解锁完整功能。

---

## 功能对比

| 功能 | 纯 ADB 模式 | 安装 Agent |
|------|------------|-----------|
| 设备基础信息 | ✅ | ✅ |
| 应用列表 | ✅ | ✅ |
| APK 安装/卸载 | ✅ | ✅ |
| ADB Shell | ✅ | ✅ |
| 屏幕截图 | ✅ (慢) | ✅ (快) |
| 实时屏幕流 | ⚠️ (帧率低) | ✅ (流畅) |
| 实时硬件监控 | ❌ | ✅ |
| 无线自动重连 | ❌ | ✅ |
| 后台保活 | ❌ | ✅ |

---

## 技术栈

```
语言：Kotlin
最低 SDK：API 21 (Android 5.0)
目标 SDK：API 34 (Android 14)

核心依赖：
├── OkHttp 4.x          # WebSocket 客户端
├── Gson                # JSON 序列化
├── Coroutines          # 异步处理
└── MediaProjection API # 屏幕采集（系统级）
```

---

## 模块架构

```
┌─────────────────────────────────────────────────────┐
│                   MainActivity                       │
│  首次启动：申请屏幕录制权限，配置 Server 地址         │
└──────────────────────┬──────────────────────────────┘
                       │ 启动
┌──────────────────────▼──────────────────────────────┐
│                   AgentService                       │
│  前台 Service，统一管理所有子模块生命周期             │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Heartbeat  │  │  DeviceInfo  │  │   Screen   │ │
│  │  Service    │  │  Service     │  │  Capture   │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                │        │
│  ┌──────▼────────────────▼────────────────▼──────┐ │
│  │              AgentWebSocket                   │ │
│  │   连接管理 | 消息收发 | 自动重连               │ │
│  └──────────────────────┬────────────────────────┘ │
│                         │                          │
│  ┌──────────────────────▼────────────────────────┐ │
│  │            CommandDispatcher                  │ │
│  │   解析 Server 指令，分发到对应处理器           │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                       │ WSS
              ┌────────▼────────┐
              │   Server 后端   │
              └─────────────────┘
```

---

## 目录结构

```
agent/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── res/
│       │   ├── drawable/ic_notification.xml
│       │   └── values/strings.xml
│       └── java/com/appmanager/agent/
│           ├── App.kt                      # Application，初始化配置
│           ├── MainActivity.kt             # 权限申请、Server 配置 UI
│           ├── config/
│           │   └── AgentConfig.kt          # SharedPreferences 配置管理
│           ├── service/
│           │   ├── AgentService.kt         # 主前台 Service
│           │   ├── HeartbeatManager.kt     # 心跳定时器
│           │   ├── ScreenCaptureManager.kt # MediaProjection 屏幕采集
│           │   └── DeviceInfoCollector.kt  # 硬件信息采集
│           ├── ws/
│           │   ├── AgentWebSocket.kt       # WebSocket 连接封装
│           │   ├── MessageHandler.kt       # 消息路由
│           │   └── Protocol.kt             # 消息类型定义
│           ├── command/
│           │   ├── CommandDispatcher.kt    # 指令分发器
│           │   ├── AppCommandHandler.kt    # 应用操作
│           │   └── SystemCommandHandler.kt # 系统操作
│           └── util/
│               ├── DeviceInfoUtil.kt       # 设备信息工具
│               └── ImageUtil.kt           # 图像压缩工具
├── build.gradle
└── settings.gradle
```

---

## 核心模块详解

### 1. AgentService

前台 Service，系统级保活，管理所有子模块。

```kotlin
class AgentService : Service() {

    private lateinit var webSocket: AgentWebSocket
    private lateinit var heartbeatManager: HeartbeatManager
    private lateinit var deviceInfoCollector: DeviceInfoCollector
    private var screenCaptureManager: ScreenCaptureManager? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        val config = AgentConfig.get(this)
        webSocket = AgentWebSocket(config.serverUrl, config.deviceToken) { msg ->
            CommandDispatcher.dispatch(msg, this)
        }
        webSocket.connect()

        heartbeatManager = HeartbeatManager(webSocket)
        heartbeatManager.start()

        deviceInfoCollector = DeviceInfoCollector(this, webSocket)
        deviceInfoCollector.start()

        return START_STICKY  // 被杀死后自动重启
    }

    fun startScreenCapture(resultCode: Int, data: Intent) {
        screenCaptureManager = ScreenCaptureManager(this, webSocket)
        screenCaptureManager?.start(resultCode, data)
    }

    fun stopScreenCapture() {
        screenCaptureManager?.stop()
        screenCaptureManager = null
    }
}
```

### 2. AgentWebSocket

OkHttp WebSocket 封装，支持自动重连。

```kotlin
class AgentWebSocket(
    private val serverUrl: String,
    private val deviceToken: String,
    private val onMessage: (Message) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private var ws: WebSocket? = null
    private var reconnectJob: Job? = null

    fun connect() {
        val request = Request.Builder()
            .url("$serverUrl/ws/agent")
            .header("X-Device-Token", deviceToken)
            .build()

        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                reconnectJob?.cancel()
                sendDeviceRegister()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = Gson().fromJson(text, Message::class.java)
                onMessage(msg)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (code != 1000) scheduleReconnect()
            }
        })
    }

    fun send(msg: Message) {
        ws?.send(Gson().toJson(msg))
    }

    private fun scheduleReconnect() {
        reconnectJob = CoroutineScope(Dispatchers.IO).launch {
            delay(5000)
            connect()
        }
    }
}
```

### 3. ScreenCaptureManager

基于 MediaProjection API 采集屏幕，JPEG 压缩后通过 WebSocket 推流。

```kotlin
class ScreenCaptureManager(
    private val service: AgentService,
    private val webSocket: AgentWebSocket
) {
    private var mediaProjection: MediaProjection? = null
    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var captureJob: Job? = null

    fun start(resultCode: Int, data: Intent) {
        val manager = service.getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = manager.getMediaProjection(resultCode, data)

        val metrics = service.resources.displayMetrics
        val width = metrics.widthPixels / 2   // 降低分辨率减少带宽
        val height = metrics.heightPixels / 2
        val dpi = metrics.densityDpi / 2

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "AgentCapture", width, height, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, null
        )

        captureJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                captureFrame(width, height)
                delay(100)  // ~10fps，可配置
            }
        }
    }

    private fun captureFrame(width: Int, height: Int) {
        val image = imageReader?.acquireLatestImage() ?: return
        try {
            val plane = image.planes[0]
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.copyPixelsFromBuffer(plane.buffer)

            val baos = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 60, baos)
            val base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)

            webSocket.send(Message(
                type = "screen_frame",
                data = mapOf("format" to "jpeg", "width" to width,
                             "height" to height, "data" to base64)
            ))
        } finally {
            image.close()
        }
    }

    fun stop() {
        captureJob?.cancel()
        virtualDisplay?.release()
        mediaProjection?.stop()
        imageReader?.close()
    }
}
```

### 4. DeviceInfoCollector

定时采集硬件信息上报。

```kotlin
class DeviceInfoCollector(
    private val context: Context,
    private val webSocket: AgentWebSocket
) {
    private var job: Job? = null

    fun start() {
        job = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                val info = collectInfo()
                webSocket.send(Message(type = "device_info", data = info))
                delay(10_000)  // 每 10 秒上报一次
            }
        }
    }

    private fun collectInfo(): Map<String, Any> {
        val activityManager = context.getSystemService(ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)

        val batteryIntent = context.registerReceiver(null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val battery = if (scale > 0) (level * 100 / scale) else -1

        return mapOf(
            "battery" to battery,
            "memory_used" to (memInfo.totalMem - memInfo.availMem) / 1024 / 1024,
            "memory_total" to memInfo.totalMem / 1024 / 1024,
            "cpu_usage" to getCpuUsage(),
            "network_type" to getNetworkType()
        )
    }

    fun stop() { job?.cancel() }
}
```

### 5. CommandDispatcher

接收 Server 下发指令并分发执行。

```kotlin
object CommandDispatcher {
    fun dispatch(msg: Message, service: AgentService) {
        when (msg.action) {
            "start_screen"  -> {
                // 需要 Activity 级别权限，发送广播触发 MainActivity
                val intent = Intent("com.appmanager.START_SCREEN")
                service.sendBroadcast(intent)
            }
            "stop_screen"   -> service.stopScreenCapture()
            "install_app"   -> AppCommandHandler.install(msg.payload, service)
            "uninstall_app" -> AppCommandHandler.uninstall(msg.payload, service)
            "start_app"     -> AppCommandHandler.start(msg.payload, service)
            "stop_app"      -> AppCommandHandler.stop(msg.payload, service)
            "reboot"        -> SystemCommandHandler.reboot(service)
        }
    }
}
```

---

## 通信协议

所有消息均为 JSON 格式，通过 WebSocket 传输。

### 上行消息（Agent → Server）

```json
// 设备注册
{
  "type": "register",
  "deviceId": "emulator-5554",
  "token": "device-token-xxx",
  "agentVersion": "1.0.0"
}

// 心跳
{
  "type": "heartbeat",
  "deviceId": "emulator-5554",
  "timestamp": 1741651200000
}

// 设备信息上报
{
  "type": "device_info",
  "deviceId": "emulator-5554",
  "data": {
    "battery": 85,
    "cpu_usage": 23.5,
    "memory_used": 2048,
    "memory_total": 6144,
    "network_type": "WiFi",
    "ip": "192.168.1.100"
  }
}

// 屏幕帧
{
  "type": "screen_frame",
  "deviceId": "emulator-5554",
  "data": {
    "format": "jpeg",
    "width": 540,
    "height": 960,
    "data": "<base64 encoded jpeg>"
  }
}

// 指令执行结果
{
  "type": "command_result",
  "commandId": "cmd-uuid",
  "success": true,
  "output": "Success"
}
```

### 下行消息（Server → Agent）

```json
// 开始推流
{ "type": "command", "commandId": "cmd-uuid", "action": "start_screen" }

// 停止推流
{ "type": "command", "commandId": "cmd-uuid", "action": "stop_screen" }

// 安装应用
{
  "type": "command",
  "commandId": "cmd-uuid",
  "action": "install_app",
  "payload": { "url": "https://server/uploads/app.apk", "packageName": "com.example.app" }
}

// 启动应用
{
  "type": "command",
  "commandId": "cmd-uuid",
  "action": "start_app",
  "payload": { "packageName": "com.example.app" }
}
```

---

## AndroidManifest 权限

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.BATTERY_STATS" />

<!-- 开机自启 -->
<receiver android:name=".BootReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

---

## 配置管理

Agent 首次启动需配置 Server 地址和设备 Token，存储在 SharedPreferences。

```kotlin
data class AgentConfig(
    val serverUrl: String,      // wss://192.168.1.x:8080
    val deviceToken: String,    // 从 Server 注册获取
    val screenFps: Int = 10,    // 屏幕推流帧率
    val screenQuality: Int = 60 // JPEG 质量 0-100
)
```

---

## 构建配置

```gradle
// app/build.gradle
android {
    compileSdk 34
    defaultConfig {
        applicationId "com.appmanager.agent"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }
}

dependencies {
    implementation "com.squareup.okhttp3:okhttp:4.12.0"
    implementation "com.google.code.gson:gson:2.10.1"
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"
}
```

---

## 注意事项

1. 屏幕录制权限需要用户在 MainActivity 手动授权一次，之后 Service 可持续使用
2. Android 10+ 前台 Service 需要声明 `foregroundServiceType`
3. Android 14 安装 APK 需要 `REQUEST_INSTALL_PACKAGES` 权限且需用户确认
4. 部分厂商（华为、小米）有额外的后台限制，需引导用户开启自启权限
5. 屏幕帧率和质量需根据网络带宽动态调整，避免卡顿
