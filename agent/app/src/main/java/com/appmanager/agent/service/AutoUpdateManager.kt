package com.appmanager.agent.service

import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.util.ServerUrlUtil
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * 后台自动更新：每 10 分钟向服务端 `GET /api/agent/update/check` 校验一次，
 * 服务端返回的 versionCode 严格大于本机时，静默下载 APK 到缓存目录并拉起系统安装器。
 *
 * 与 [SystemUpdateActivity][com.appmanager.agent.ui.SystemUpdateActivity] 的手动入口共用同一接口，
 * 但走无界面路径：下载完成后直接 startActivity(ACTION_VIEW)，安装路径与 [AppCommandHandler] 一致
 * （FileProvider + application/vnd.android.package-archive）。
 *
 * 防抖：同一 versionCode 在本进程内只尝试一次（[attemptedVersionCode]），避免每 10 分钟重复
 * 下载、重复弹安装框；进程重启后会重新尝试一次（内存态，不持久化）。
 */
class AutoUpdateManager(private val service: AgentService) {

    private val TAG = "AutoUpdateManager"

    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    /** 本进程内已尝试安装过的服务端 versionCode，避免重复触发。 */
    @Volatile
    private var attemptedVersionCode = -1

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            // 服务刚起来时先让连接/初始化稳定，再做首次校验
            delay(FIRST_CHECK_DELAY_MS)
            while (isActive) {
                try {
                    checkAndUpdate()
                } catch (e: Exception) {
                    Log.w(TAG, "auto update check failed", e)
                }
                delay(CHECK_INTERVAL_MS)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private fun checkAndUpdate() {
        val config = AgentConfig.get(service)
        val serverUrl = config.serverUrl.trim()
        if (serverUrl.isEmpty()) return

        val httpBase = ServerUrlUtil.httpBaseFromWs(serverUrl).trimEnd('/')
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        val checkReq = Request.Builder()
            .url("$httpBase/api/agent/update/check")
            .get()
            .build()

        val body = client.newCall(checkReq).execute().use { resp ->
            if (!resp.isSuccessful) {
                Log.d(TAG, "update check HTTP ${resp.code}")
                return
            }
            resp.body?.string() ?: return
        }

        val json = JSONObject(body)
        if (!json.optBoolean("hasUpdate", false)) return

        val serverVersionCode = json.optInt("versionCode", 0)
        val localVersionCode = AppVersions.versionCodeLong(service)
        // versionCode<=0 表示服务端未提供，无法判定新旧 → 不自动更新（避免误装回旧包）
        if (serverVersionCode <= 0 || serverVersionCode <= localVersionCode) return

        // 同一版本本进程内只尝试一次，防止每 10 分钟反复下载 / 弹框
        if (serverVersionCode == attemptedVersionCode) return
        attemptedVersionCode = serverVersionCode

        val version = json.optString("version", serverVersionCode.toString())
        val rawDownloadUrl = json.optString("downloadUrl", "")
        if (rawDownloadUrl.isEmpty()) {
            Log.w(TAG, "update available but downloadUrl empty")
            return
        }
        val downloadUrl = resolveUrl(httpBase, rawDownloadUrl)

        Log.i(TAG, "auto update: server v$version (code $serverVersionCode) > local $localVersionCode, downloading")
        val apk = downloadApk(client, downloadUrl, version) ?: return
        launchInstaller(apk)
    }

    private fun resolveUrl(httpBase: String, raw: String): String {
        if (raw.startsWith("http://", true) || raw.startsWith("https://", true)) return raw
        val path = if (raw.startsWith("/")) raw else "/$raw"
        return httpBase + path
    }

    private fun downloadApk(client: OkHttpClient, url: String, version: String): File? {
        val dest = File(service.cacheDir, "auto_update_$version.apk")
        if (dest.exists()) dest.delete()
        // 下载可能较大，单独放宽读超时
        val dlClient = client.newBuilder().readTimeout(20, TimeUnit.MINUTES).build()
        val req = Request.Builder().url(url).get().build()
        try {
            dlClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "download HTTP ${resp.code}")
                    return null
                }
                val rb = resp.body ?: return null
                rb.byteStream().use { input ->
                    dest.outputStream().use { output -> input.copyTo(output) }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "download failed", e)
            dest.delete()
            return null
        }
        return dest
    }

    private fun launchInstaller(apk: File) {
        if (!apk.exists() || apk.length() == 0L) return
        // Android 8+ 无「安装未知应用」授权时，系统安装器会引导用户授权，仍属预期行为
        val intent = Intent(Intent.ACTION_VIEW).apply {
            val uri = FileProvider.getUriForFile(service, "${service.packageName}.fileprovider", apk)
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            service.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "launchInstaller failed", e)
        }
    }

    companion object {
        /** 校验间隔：10 分钟。 */
        private val CHECK_INTERVAL_MS = TimeUnit.MINUTES.toMillis(10)

        /** 服务启动后首次校验延迟，等连接与心跳稳定。 */
        private val FIRST_CHECK_DELAY_MS = TimeUnit.SECONDS.toMillis(30)
    }
}
