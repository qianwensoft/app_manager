package com.appmanager.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import com.appmanager.agent.MainActivity
import com.appmanager.agent.R
import com.appmanager.agent.command.CommandDispatcher
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.DisplayUtil
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.util.ServerUrlUtil
import com.appmanager.agent.util.EventReporter
import com.appmanager.agent.ws.AgentWebSocket
import com.appmanager.agent.ws.CommandAction
import com.appmanager.agent.ws.DeviceInfoMessage
import com.appmanager.agent.ws.Message
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.min
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class AgentService : LifecycleService() {

    companion object {
        const val ACTION_START_SCREEN = "START_SCREEN_CAPTURE"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_DATA = "data"
        @Volatile
        private var installCallbackRef: java.lang.ref.WeakReference<AgentService>? = null

        fun attachInstallCallback(service: AgentService) {
            installCallbackRef = java.lang.ref.WeakReference(service)
        }

        fun detachInstallCallback(service: AgentService) {
            if (installCallbackRef?.get() === service) installCallbackRef = null
        }

        /** 供 [InstallStatusReceiver] 与安装失败路径上报 install_task_result。 */
        fun sendInstallTaskResult(commandId: String, success: Boolean, output: String, error: String) {
            val s = installCallbackRef?.get() ?: run {
                Log.w("AgentService", "sendInstallTaskResult: service gone, commandId=$commandId")
                return
            }
            if (!s::webSocket.isInitialized) return
            val errField = if (success) "" else (error.ifEmpty { "安装失败" })
            s.webSocket.send(
                mapOf(
                    "type" to "install_task_result",
                    "command_id" to commandId,
                    "success" to success,
                    "output" to output,
                    "error" to errField
                )
            )
        }
    }

    private val TAG = "AgentService"
    /** 新 channel id：IMPORTANCE_DEFAULT，避免旧 LOW 通道无法弹出可操作通知 */
    private val CHANNEL_ID = "agent_fgs"
    private val NOTIF_ID = 1001

    lateinit var webSocket: AgentWebSocket
        private set

    private lateinit var heartbeatManager: HeartbeatManager
    private lateinit var deviceInfoCollector: DeviceInfoCollector
    private var screenCaptureManager: ScreenCaptureManager? = null
    private var shellManager: ShellManager? = null
    private var logcatManager: LogcatManager? = null
    private var deviceToken: String = ""

    /** 当前 WebSocket 建立时使用的地址与 Token；与 SharedPreferences 不一致时需重连 */
    private var activeWsServerUrl: String = ""
    private var activeWsDeviceToken: String = ""

    /** 息屏后减轻 CPU 立即休眠，利于 WebSocket/心跳；须配合系统「忽略电池优化」与厂商后台白名单 */
    private var cpuWakeLock: PowerManager.WakeLock? = null

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(serviceJob + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        // 处理屏幕录制授权回调
        if (intent?.action == ACTION_START_SCREEN) {
            val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
            val data = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(EXTRA_DATA)
            }
            Log.i(TAG, "ACTION_START_SCREEN: resultCode=$resultCode, data=$data, wsInit=${::webSocket.isInitialized}")
            if (resultCode == android.app.Activity.RESULT_OK && data != null && ::webSocket.isInitialized) {
                startScreenCapture(resultCode, data, deviceToken)
            } else {
                Log.e(TAG, "ACTION_START_SCREEN: skipped — resultCode=$resultCode data=${data != null} wsInit=${::webSocket.isInitialized}")
            }
            return START_STICKY
        }

        startForeground(NOTIF_ID, buildNotification("连接中..."))

        val config = AgentConfig.get(this)
        val url = config.serverUrl.trim()
        val tok = config.deviceToken.trim()
        if (url.isEmpty()) {
            Log.w(TAG, "Server URL not configured, stopping service")
            releaseCpuWakeLock()
            stopSelf()
            return START_NOT_STICKY
        }
        deviceToken = tok

        // 已连接且地址/Token 未变：忽略重复 startForegroundService（避免双连接）
        if (::webSocket.isInitialized) {
            if (activeWsServerUrl == url && activeWsDeviceToken == tok) {
                return START_STICKY
            }
            Log.i(TAG, "Server or token changed, reconnecting ($activeWsServerUrl -> $url)")
            reconnectForNewEndpoint()
        }

        webSocket = AgentWebSocket(
            serverUrl = url,
            deviceToken = tok,
            onMessage = { msg -> CommandDispatcher.dispatch(msg, this) },
            onConnected = {
                updateNotification("已连接")
                heartbeatManager.start()
                deviceInfoCollector.start()
                EventReporter.init(webSocket, tok)
            },
            onDisconnected = {
                updateNotification("重连中...")
                heartbeatManager.stop()
                deviceInfoCollector.stop()
            }
        )

        heartbeatManager = HeartbeatManager(webSocket, tok)
        deviceInfoCollector = DeviceInfoCollector(this, webSocket, tok)

        activeWsServerUrl = url
        activeWsDeviceToken = tok

        acquireCpuWakeLock()
        attachInstallCallback(this)
        webSocket.connect()

        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onDestroy() {
        detachInstallCallback(this)
        super.onDestroy()
        serviceJob.cancel()
        // stopSelf() 若在初始化前触发（如未配置 serverUrl），lateinit 未赋值会崩溃
        if (::heartbeatManager.isInitialized) heartbeatManager.stop()
        if (::deviceInfoCollector.isInitialized) deviceInfoCollector.stop()
        screenCaptureManager?.stop()
        shellManager?.stop()
        logcatManager?.stop()
        if (::webSocket.isInitialized) webSocket.disconnect()
        activeWsServerUrl = ""
        activeWsDeviceToken = ""
        releaseCpuWakeLock()
    }

    private fun acquireCpuWakeLock() {
        try {
            releaseCpuWakeLock()
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            cpuWakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "AppManagerAgent:AgentService"
            ).apply {
                setReferenceCounted(false)
                acquire()
            }
            Log.d(TAG, "PARTIAL_WAKE_LOCK acquired")
        } catch (e: Exception) {
            Log.w(TAG, "acquireCpuWakeLock failed", e)
        }
    }

    private fun releaseCpuWakeLock() {
        try {
            cpuWakeLock?.let { wl ->
                if (wl.isHeld) wl.release()
            }
        } catch (_: Exception) {
        }
        cpuWakeLock = null
    }

    /** 切换服务器或 Token：停子模块、断旧 WebSocket，便于下面重新 new AgentWebSocket */
    private fun reconnectForNewEndpoint() {
        if (::heartbeatManager.isInitialized) heartbeatManager.stop()
        if (::deviceInfoCollector.isInitialized) deviceInfoCollector.stop()
        stopScreenCapture()
        stopShell()
        stopLogcat()
        if (::webSocket.isInitialized) {
            webSocket.disconnect()
        }
        activeWsServerUrl = ""
        activeWsDeviceToken = ""
    }

    // ─── 屏幕采集 ────────────────────────────────────────────────────────────
    fun startScreenCapture(resultCode: Int, data: Intent, deviceToken: String) {
        screenCaptureManager = ScreenCaptureManager(this, webSocket, deviceToken)
        screenCaptureManager?.start(resultCode, data)
    }

    fun stopScreenCapture() {
        screenCaptureManager?.stop()
        screenCaptureManager = null
    }

    fun handleWebRTCSignal(data: Map<String, Any>) {
        screenCaptureManager?.handleSignal(data)
            ?: Log.w(TAG, "handleWebRTCSignal: screenCaptureManager is null")
    }

    fun handleScreenTouchRelay(json: String) {
        screenCaptureManager?.handleRelayTouch(json)
            ?: Log.w(TAG, "handleScreenTouchRelay: screenCaptureManager is null")
    }

    /** Web 请求即时刷新：上报 device_info（含 Wi‑Fi SSID 等），并带 push_request_id 唤醒服务端 HTTP。 */
    fun pushDeviceInfoNow(pushRequestId: String) {
        serviceScope.launch(Dispatchers.IO) {
            try {
                if (!::webSocket.isInitialized) return@launch
                val data = collectDeviceInfoData(this@AgentService)
                webSocket.send(
                    DeviceInfoMessage(
                        deviceId = deviceToken,
                        data = data,
                        pushRequestId = pushRequestId
                    )
                )
            } catch (e: Exception) {
                Log.e(TAG, "pushDeviceInfoNow", e)
            }
        }
    }

    /** 服务端 HTTP 截图：经 WS 下发 capture_screenshot，需当前已开启投屏并持有 MediaProjection。 */
    fun captureScreenshot(requestId: String) {
        serviceScope.launch {
            try {
                val png = try {
                    screenCaptureManager?.captureScreenshotPng()
                } catch (e: Exception) {
                    Log.e(TAG, "captureScreenshotPng", e)
                    null
                }
                val payload: Map<String, Any?> = if (png != null && png.isNotEmpty()) {
                    mapOf(
                        "type" to "screenshot_result",
                        "request_id" to requestId,
                        "success" to true,
                        "data" to Base64.encodeToString(png, Base64.NO_WRAP)
                    )
                } else {
                    mapOf(
                        "type" to "screenshot_result",
                        "request_id" to requestId,
                        "success" to false,
                        "error" to "无法截图：请先在 Web 端打开「屏幕查看」并完成录屏授权（保持投屏中）。"
                    )
                }
                withContext(Dispatchers.Main) {
                    if (::webSocket.isInitialized) {
                        webSocket.send(payload)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "captureScreenshot", e)
                withContext(Dispatchers.Main) {
                    if (::webSocket.isInitialized) {
                        webSocket.send(
                            mapOf(
                                "type" to "screenshot_result",
                                "request_id" to requestId,
                                "success" to false,
                                "error" to (e.message ?: "截图异常")
                            )
                        )
                    }
                }
            }
        }
    }

    fun speedTestPing(requestId: String) {
        try {
            webSocket.send(
                mapOf(
                    "type" to "speed_test_result",
                    "request_id" to requestId,
                    "phase" to "ping",
                    "success" to true
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "speedTestPing", e)
            try {
                webSocket.send(
                    mapOf(
                        "type" to "speed_test_result",
                        "request_id" to requestId,
                        "phase" to "ping",
                        "success" to false,
                        "error" to (e.message ?: "ping failed")
                    )
                )
            } catch (_: Exception) { /* noop */ }
        }
    }

    fun speedTestThroughput(requestId: String, downloadPath: String, uploadPath: String, payloadBytes: Int) {
        serviceScope.launch(Dispatchers.IO) {
            try {
                val config = AgentConfig.get(this@AgentService)
                val base = ServerUrlUtil.httpBaseFromWs(config.serverUrl).trimEnd('/')
                val token = config.deviceToken
                if (token.isEmpty() || base.isBlank()) {
                    sendSpeedTestFail(requestId, "未配置服务器或 Token")
                    return@launch
                }
                val client = OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(120, TimeUnit.SECONDS)
                    .writeTimeout(120, TimeUnit.SECONDS)
                    .build()

                val downUrl = if (downloadPath.startsWith("http", ignoreCase = true)) downloadPath else base + downloadPath
                val upUrl = if (uploadPath.startsWith("http", ignoreCase = true)) uploadPath else base + uploadPath

                val getReq = Request.Builder()
                    .url(downUrl)
                    .header("X-Device-Token", token)
                    .get()
                    .build()
                val tDown0 = System.nanoTime()
                val downBody = client.newCall(getReq).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        throw IOException("下载 HTTP ${resp.code}")
                    }
                    resp.body?.bytes() ?: byteArrayOf()
                }
                val downMs = (System.nanoTime() - tDown0) / 1_000_000
                val downBytes = downBody.size.toLong()

                val size = min(payloadBytes.coerceAtLeast(1024), 2 * 1024 * 1024)
                val buf = ByteArray(size) { (it % 251).toByte() }
                val mediaType = "application/octet-stream".toMediaType()
                val postBody = buf.toRequestBody(mediaType)
                val postReq = Request.Builder()
                    .url(upUrl)
                    .header("X-Device-Token", token)
                    .post(postBody)
                    .build()
                val tUp0 = System.nanoTime()
                client.newCall(postReq).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        throw IOException("上传 HTTP ${resp.code}")
                    }
                    resp.body?.close()
                }
                val upMs = (System.nanoTime() - tUp0) / 1_000_000
                val upBytes = size.toLong()

                withContext(Dispatchers.Main) {
                    if (::webSocket.isInitialized) {
                        webSocket.send(
                            mapOf(
                                "type" to "speed_test_result",
                                "request_id" to requestId,
                                "phase" to "throughput",
                                "success" to true,
                                "download_ms" to downMs,
                                "download_bytes" to downBytes,
                                "upload_ms" to upMs,
                                "upload_bytes" to upBytes
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "speedTestThroughput", e)
                sendSpeedTestFail(requestId, e.message ?: "吞吐测速失败")
            }
        }
    }

    private fun sendSpeedTestFail(requestId: String, err: String) {
        serviceScope.launch(Dispatchers.Main) {
            if (::webSocket.isInitialized) {
                webSocket.send(
                    mapOf(
                        "type" to "speed_test_result",
                        "request_id" to requestId,
                        "phase" to "throughput",
                        "success" to false,
                        "error" to err
                    )
                )
            }
        }
    }

    // ─── Shell ────────────────────────────────────────────────────────────────
    fun startShell() {
        stopShell()
        shellManager = ShellManager(webSocket, deviceToken, applicationContext)
        shellManager?.start()
    }

    fun stopShell() {
        shellManager?.stop()
        shellManager = null
    }

    fun executeShellCommand(command: String) {
        shellManager?.writeInput(command)
    }

    // ─── Logcat ───────────────────────────────────────────────────────────────
    fun startLogcat(filter: String = "") {
        logcatManager = LogcatManager(webSocket, deviceToken)
        logcatManager?.start(filter)
    }

    fun stopLogcat() {
        logcatManager?.stop()
        logcatManager = null
    }

    // ─── 录屏 ─────────────────────────────────────────────────────────────────
    /** 录屏在服务器侧完成（JPEG 帧 + ffmpeg），Agent 不再本地上传 MP4。 */
    fun startRecording() {
        Log.i(TAG, "startRecording ignored (server-side recording)")
    }

    fun stopRecording() {
        Log.i(TAG, "stopRecording ignored (server-side recording)")
    }

    // ─── 通知 ─────────────────────────────────────────────────────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Agent 服务",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            channel.description = "连接状态与投屏授权"
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun notificationBuilder(status: String, includeScreenAction: Boolean): NotificationCompat.Builder {
        val openApp = Intent(this, MainActivity::class.java)
        val contentPi = PendingIntent.getActivity(
            this, 0, openApp,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val b = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(status)
            .setSubText(getString(R.string.agent_version_label, AppVersions.displayLabel(this)))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(contentPi)
            .setOngoing(true)
        if (includeScreenAction) {
            val screenIntent = Intent(this, MainActivity::class.java).apply {
                action = MainActivity.ACTION_REQUEST_SCREEN
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val screenPi = PendingIntent.getActivity(
                this, 2, screenIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            b.addAction(R.drawable.ic_notification, getString(R.string.notify_action_grant_screen), screenPi)
        }
        return b
    }

    private fun buildNotification(status: String): Notification =
        notificationBuilder(status, false).build()

    private fun updateNotification(status: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIF_ID, buildNotification(status))
    }

    /**
     * Web 端打开「屏幕查看」时由 [CommandDispatcher] 调用。
     * 必须在主线程启动 Activity；并从后台拉起时需通知栏备用入口（BAL 限制）。
     */
    fun promptScreenCapturePermission() {
        Handler(Looper.getMainLooper()).post {
            val cfg = AgentConfig.get(this)
            if (!cfg.allowRemoteScreen) {
                if (::webSocket.isInitialized) {
                    webSocket.send(
                        mapOf(
                            "type" to "user_notice",
                            "code" to "remote_screen_disabled",
                            "message" to "请在 Agent 主界面勾选「允许远程查看屏幕」并保存"
                        )
                    )
                }
                Toast.makeText(
                    applicationContext,
                    "未开启「允许远程查看屏幕」，请在 Agent 设置中勾选",
                    Toast.LENGTH_LONG
                ).show()
                return@post
            }
            val launch = Intent(this, MainActivity::class.java).apply {
                action = MainActivity.ACTION_REQUEST_SCREEN
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
            }
            try {
                startActivity(launch)
            } catch (e: Exception) {
                Log.e(TAG, "promptScreenCapturePermission startActivity", e)
            }
            Toast.makeText(
                applicationContext,
                getString(R.string.toast_screen_capture_prompt),
                Toast.LENGTH_LONG
            ).show()
            val nm = getSystemService(NotificationManager::class.java)
            nm.notify(
                NOTIF_ID,
                notificationBuilder(getString(R.string.notify_waiting_screen_auth), true).build()
            )
        }
    }

    /** Web 刷新已安装应用：枚举本机全部包（含系统应用），含应用名与是否系统包。 */
    fun sendInstalledAppsList(requestId: String) {
        serviceScope.launch(Dispatchers.Default) {
            try {
                val pm = packageManager
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                    .asSequence()
                    .mapNotNull { app ->
                        try {
                            val pi = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                pm.getPackageInfo(
                                    app.packageName,
                                    PackageManager.PackageInfoFlags.of(0L)
                                )
                            } else {
                                @Suppress("DEPRECATION")
                                pm.getPackageInfo(app.packageName, 0)
                            }
                            val vc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                pi.longVersionCode.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
                            } else {
                                @Suppress("DEPRECATION")
                                pi.versionCode
                            }
                            val label = try {
                                pm.getApplicationLabel(app).toString()
                            } catch (_: Exception) {
                                app.packageName
                            }
                            val isSystem = (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                            mapOf(
                                "package_name" to app.packageName,
                                "version_name" to (pi.versionName ?: ""),
                                "version_code" to vc,
                                "app_label" to label,
                                "is_system" to isSystem
                            )
                        } catch (_: Exception) {
                            null
                        }
                    }
                    .sortedBy { it["package_name"] as String }
                    .toList()
                withContext(Dispatchers.Main) {
                    if (::webSocket.isInitialized) {
                        webSocket.send(
                            mapOf(
                                "type" to "installed_apps_result",
                                "request_id" to requestId,
                                "success" to true,
                                "apps" to apps
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "sendInstalledAppsList", e)
                withContext(Dispatchers.Main) {
                    if (::webSocket.isInitialized) {
                        webSocket.send(
                            mapOf(
                                "type" to "installed_apps_result",
                                "request_id" to requestId,
                                "success" to false,
                                "error" to (e.message ?: "获取已安装应用失败")
                            )
                        )
                    }
                }
            }
        }
    }

}
