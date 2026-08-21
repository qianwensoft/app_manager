package com.appmanager.agent.command

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import com.appmanager.agent.InstallStatusReceiver
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.ServerUrlUtil
import com.appmanager.agent.ws.Message
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.LinkedHashSet
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object AppCommandHandler {

    private const val TAG = "AppCommandHandler"

    fun install(msg: Message, service: AgentService) {
        val commandId = msg.commandId
        if (commandId.isNullOrBlank()) {
            Log.e(TAG, "install: missing commandId")
            return
        }
        val dataMap = msg.data as? Map<*, *>
        val downloadPath = dataMap?.get("download_path") as? String
        if (downloadPath.isNullOrBlank()) {
            AgentService.sendInstallTaskResult(commandId, false, "", "缺少 download_path")
            return
        }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                runInstall(service, commandId, downloadPath.trim())
            } catch (e: Exception) {
                Log.e(TAG, "Install error", e)
                AgentService.sendInstallTaskResult(commandId, false, "", e.message ?: "安装失败")
            }
        }
    }

    private fun runInstall(service: AgentService, commandId: String, downloadPath: String) {
        val config = AgentConfig.get(service)
        val token = config.deviceToken.trim()
        if (token.isEmpty()) {
            AgentService.sendInstallTaskResult(commandId, false, "", "未配置设备 Token")
            return
        }
        val serverUrl = config.serverUrl.trim()
        if (serverUrl.isEmpty()) {
            AgentService.sendInstallTaskResult(commandId, false, "", "未配置服务器地址")
            return
        }
        val base = ServerUrlUtil.httpBaseFromWs(serverUrl).trimEnd('/')
        val path = if (downloadPath.startsWith("/")) downloadPath else "/$downloadPath"
        val url = base + path

        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.MINUTES)
            .build()
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", token)
            .get()
            .build()

        val apkFile = File(service.cacheDir, "install_${System.currentTimeMillis()}.apk")
        try {
            // 上报开始下载，APK 大小未知时 percent=0，让前端进入「下载中」阶段
            AgentService.sendInstallTaskProgress(commandId, "downloading", 0, "开始下载 APK")
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) {
                    AgentService.sendInstallTaskProgress(
                        commandId, "downloading", 0, "下载失败 HTTP ${response.code}", error = true
                    )
                    AgentService.sendInstallTaskResult(
                        commandId,
                        false,
                        "",
                        "下载失败 HTTP ${response.code}"
                    )
                    return
                }
                val body = response.body ?: run {
                    AgentService.sendInstallTaskResult(commandId, false, "", "空响应体")
                    return
                }
                val total = body.contentLength().takeIf { it > 0 } ?: -1L
                apkFile.outputStream().use { out ->
                    val source = body.byteStream()
                    val buffer = ByteArray(8 * 1024)
                    var readSum = 0L
                    var lastReportPct = -1
                    var lastReportTs = 0L
                    while (true) {
                        val n = source.read(buffer)
                        if (n <= 0) break
                        out.write(buffer, 0, n)
                        readSum += n
                        if (total > 0) {
                            val pct = ((readSum * 100L) / total).toInt().coerceIn(0, 100)
                            val now = System.currentTimeMillis()
                            // 每 1% 或每 200ms 上报一次，避免刷屏
                            if (pct != lastReportPct && (now - lastReportTs) >= 200) {
                                AgentService.sendInstallTaskProgress(
                                    commandId, "downloading", pct,
                                    "下载 APK $pct%"
                                )
                                lastReportPct = pct
                                lastReportTs = now
                            }
                        }
                    }
                }
            }
            // 下载完成阶段
            AgentService.sendInstallTaskProgress(commandId, "downloading", 100, "APK 下载完成")

            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(
                androidx.core.content.FileProvider.getUriForFile(
                    service,
                    "${service.packageName}.fileprovider",
                    apkFile
                ),
                "application/vnd.android.package-archive"
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // 通知前端进入「系统安装界面」阶段
            AgentService.sendInstallTaskProgress(commandId, "opening", 0, "正在拉起系统安装界面")
            service.startActivity(intent)
            AgentService.sendInstallTaskResult(commandId, true, "已打开安装界面", "")
        } catch (e: Exception) {
            Log.e(TAG, "Install error", e)
            apkFile.delete()
            AgentService.sendInstallTaskResult(commandId, false, "", e.message ?: "安装失败")
        }
    }

    fun uninstall(msg: Message, service: AgentService) {
        try {
            val pkg = msg.payload?.get("packageName") as? String ?: throw Exception("Missing packageName")
            val intent = Intent(Intent.ACTION_DELETE)
            intent.data = Uri.parse("package:$pkg")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            service.startActivity(intent)
            CommandDispatcher.sendResult(service, msg.commandId, true)
        } catch (e: Exception) {
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "")
        }
    }

    fun startApp(msg: Message, service: AgentService) {
        try {
            val data = msg.data as? Map<*, *> ?: msg.payload
            val pkg = data?.get("packageName") as? String ?: throw Exception("Missing packageName")
            val intent = service.packageManager.getLaunchIntentForPackage(pkg)
                ?: throw Exception("无法启动：无启动 Activity（包名 $pkg）")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            service.startActivity(intent)
            CommandDispatcher.sendResult(service, msg.commandId, true)
        } catch (e: Exception) {
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "")
        }
    }

    fun stopApp(msg: Message, service: AgentService) {
        try {
            val pkg = msg.payload?.get("packageName") as? String ?: throw Exception("Missing packageName")
            val am = service.getSystemService(android.app.ActivityManager::class.java)
            am.killBackgroundProcesses(pkg)
            CommandDispatcher.sendResult(service, msg.commandId, true)
        } catch (e: Exception) {
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "")
        }
    }

    fun exportInstalledApk(service: AgentService, packageName: String, uploadPath: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                runExportInstalledApk(service, packageName, uploadPath)
            } catch (e: Exception) {
                Log.e(TAG, "exportInstalledApk", e)
                postPulledApkFailure(service, uploadPath, e.message ?: "导出失败")
            }
        }
    }

    private fun postPulledApkFailure(service: AgentService, uploadPath: String, err: String) {
        val config = AgentConfig.get(service)
        val token = config.deviceToken.trim()
        if (token.isEmpty()) return
        val serverUrl = config.serverUrl.trim()
        if (serverUrl.isEmpty()) return
        val base = ServerUrlUtil.httpBaseFromWs(serverUrl).trimEnd('/')
        val path = if (uploadPath.startsWith("/")) uploadPath else "/$uploadPath"
        val url = base + path
        val json = Gson().toJson(mapOf("error" to err))
        val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", token)
            .post(body)
            .build()
        try {
            client.newCall(req).execute().close()
        } catch (e: Exception) {
            Log.e(TAG, "postPulledApkFailure", e)
        }
    }

    private fun runExportInstalledApk(service: AgentService, packageName: String, uploadPath: String) {
        val pm = service.packageManager
        val appInfo = try {
            pm.getApplicationInfo(packageName, 0)
        } catch (_: PackageManager.NameNotFoundException) {
            postPulledApkFailure(service, uploadPath, "包未安装")
            return
        }
        val paths = LinkedHashSet<String>()
        appInfo.sourceDir?.let { paths.add(it) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            appInfo.splitSourceDirs?.filterNotNull()?.forEach { paths.add(it) }
        }
        val readable = paths.mapNotNull { p ->
            val f = File(p)
            if (f.isFile && f.canRead()) p else null
        }
        if (readable.isEmpty()) {
            postPulledApkFailure(
                service,
                uploadPath,
                "无法读取 APK 文件（多数 ROM 禁止普通应用读取其他应用的安装包路径）"
            )
            return
        }
        val versionName = try {
            val pi = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(packageName, 0)
            }
            pi.versionName ?: ""
        } catch (_: Exception) {
            ""
        }
        val safeVer = versionName.replace(Regex("[\\\\/:*?\"<>|]"), "_")

        val exportFile: File
        val exportName: String
        if (readable.size == 1) {
            exportFile = File(readable.first())
            exportName = "${packageName}_v${safeVer}.apk".replace(Regex("[\\\\/:*?\"<>|]"), "_")
        } else {
            val zipF = File(service.cacheDir, "export_${packageName.hashCode()}_splits.zip")
            if (zipF.exists()) zipF.delete()
            ZipOutputStream(zipF.outputStream().buffered()).use { zos ->
                readable.forEachIndexed { idx, p ->
                    val entryName = if (idx == 0) "base.apk" else "split_$idx.apk"
                    zos.putNextEntry(ZipEntry(entryName))
                    File(p).inputStream().use { it.copyTo(zos) }
                    zos.closeEntry()
                }
            }
            exportFile = zipF
            exportName = "${packageName}_v${safeVer}_splits.zip".replace(Regex("[\\\\/:*?\"<>|]"), "_")
        }

        val config = AgentConfig.get(service)
        val token = config.deviceToken.trim()
        if (token.isEmpty()) {
            postPulledApkFailure(service, uploadPath, "未配置设备 Token")
            return
        }
        val serverUrl = config.serverUrl.trim()
        if (serverUrl.isEmpty()) {
            postPulledApkFailure(service, uploadPath, "未配置服务器地址")
            return
        }
        val base = ServerUrlUtil.httpBaseFromWs(serverUrl).trimEnd('/')
        val path = if (uploadPath.startsWith("/")) uploadPath else "/$uploadPath"
        val url = base + path
        val body = exportFile.asRequestBody("application/octet-stream".toMediaType())
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.MINUTES)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", token)
            .header("X-Export-Filename", exportName)
            .post(body)
            .build()
        client.newCall(req).execute().use { response ->
            if (!response.isSuccessful) {
                Log.e(TAG, "export apk upload HTTP ${response.code}")
            }
        }
        if (readable.size > 1) {
            exportFile.delete()
        }
    }
}
