package com.appmanager.agent.command

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.util.Log
import com.appmanager.agent.InstallStatusReceiver
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.ServerUrlUtil
import com.appmanager.agent.ws.Message
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

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

        client.newCall(req).execute().use { response ->
            if (!response.isSuccessful) {
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

            val installer = service.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            val sessionId = installer.createSession(params)
            val session = installer.openSession(sessionId)
            try {
                session.openWrite("base.apk", 0, -1).use { out ->
                    body.byteStream().use { input -> input.copyTo(out) }
                }
                val callback = Intent(service, InstallStatusReceiver::class.java).apply {
                    putExtra(InstallStatusReceiver.EXTRA_COMMAND_ID, commandId)
                }
                val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        PendingIntent.FLAG_IMMUTABLE
                    } else {
                        0
                    }
                val pendingIntent = PendingIntent.getBroadcast(
                    service,
                    commandId.hashCode(),
                    callback,
                    piFlags
                )
                session.commit(pendingIntent.intentSender)
            } catch (e: Exception) {
                try {
                    session.abandon()
                } catch (_: Exception) {
                }
                throw e
            } finally {
                session.close()
            }
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
}
