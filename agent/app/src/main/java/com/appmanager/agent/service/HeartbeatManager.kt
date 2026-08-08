package com.appmanager.agent.service

import android.content.Context
import android.util.Log
import com.appmanager.agent.ws.AgentWebSocket
import com.appmanager.agent.ws.HeartbeatMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class HeartbeatManager(
    private val webSocket: AgentWebSocket,
    private val deviceId: String
) {
    private var job: Job? = null
    private var context: Context? = null
    private var serverUrl: String = ""

    companion object {
        private const val TAG = "HeartbeatManager"
    }

    fun setContext(ctx: Context, url: String) {
        this.context = ctx
        this.serverUrl = url
    }

    fun start() {
        job?.cancel()
        job = CoroutineScope(Dispatchers.IO).launch {
            var heartbeatCount = 0
            while (isActive) {
                webSocket.send(HeartbeatMessage(deviceId = deviceId))
                heartbeatCount++

                // 每 10 次心跳（5 分钟）检查一次 X5 内核更新（仅当用户启用自动更新时）
                if (heartbeatCount % 10 == 0 && context != null && serverUrl.isNotEmpty()) {
                    val autoUpdate = com.appmanager.agent.x5.X5Preferences.isAutoUpdateEnabled(context!!)
                    if (autoUpdate) {
                        try {
                            com.appmanager.agent.x5.X5KernelManager.checkAndUpdate(
                                context = context!!,
                                serverUrl = serverUrl,
                                token = deviceId
                            )
                        } catch (e: Exception) {
                            Log.e(TAG, "X5 kernel check failed", e)
                        }
                    }
                    // 每 5 分钟检查一次 userToken 是否即将过期，自动 refresh
                    try {
                        com.appmanager.agent.auth.AgentAuth.refreshIfNeeded(context!!)
                    } catch (e: Exception) {
                        Log.e(TAG, "Token refresh check failed", e)
                    }
                }

                delay(30_000L)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
