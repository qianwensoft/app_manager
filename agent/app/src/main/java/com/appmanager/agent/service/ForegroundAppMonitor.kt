package com.appmanager.agent.service

import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.appmanager.agent.util.ForegroundAppDetector
import kotlinx.coroutines.*

/**
 * 前台应用监听服务
 * 实时监听前台应用变化并通知 AgentService 上报
 */
class ForegroundAppMonitor(
    private val context: Context,
    private val onForegroundAppChanged: (String) -> Unit
) {
    private val tag = "ForegroundAppMonitor"
    private var monitorJob: Job? = null
    private var lastPackageName = ""
    private val handler = Handler(Looper.getMainLooper())

    /**
     * 启动监听
     */
    fun start() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            Log.w(tag, "API level < 21, monitor not supported")
            return
        }

        if (!ForegroundAppDetector.hasUsageStatsPermission(context)) {
            Log.w(tag, "PACKAGE_USAGE_STATS permission not granted, cannot start monitor")
            return
        }

        stop() // 确保之前的任务已停止

        monitorJob = CoroutineScope(Dispatchers.Default).launch {
            Log.i(tag, "Started foreground app monitor")

            while (isActive) {
                try {
                    val currentPackage = ForegroundAppDetector.getForegroundPackageName(context)

                    if (currentPackage.isNotEmpty() && currentPackage != lastPackageName) {
                        Log.d(tag, "Foreground app changed: $lastPackageName -> $currentPackage")
                        lastPackageName = currentPackage

                        // 回调通知前台应用变化
                        handler.post {
                            onForegroundAppChanged(currentPackage)
                        }
                    }

                    // 每 2 秒检查一次
                    delay(2000)
                } catch (e: Exception) {
                    Log.e(tag, "Error monitoring foreground app", e)
                    delay(5000) // 出错后延长间隔
                }
            }
        }
    }

    /**
     * 停止监听
     */
    fun stop() {
        monitorJob?.cancel()
        monitorJob = null
        lastPackageName = ""
        Log.i(tag, "Stopped foreground app monitor")
    }

    /**
     * 检查是否正在运行
     */
    fun isRunning(): Boolean {
        return monitorJob?.isActive == true
    }
}
