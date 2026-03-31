package com.appmanager.agent.service

import com.appmanager.agent.ws.AgentWebSocket
import com.appmanager.agent.ws.DeviceInfoMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class DeviceInfoCollector(
    private val context: android.content.Context,
    private val webSocket: AgentWebSocket,
    private val deviceId: String,
    private val intervalMs: Long = 10_000L
) {
    private var job: Job? = null

    fun start() {
        job?.cancel()
        job = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                try {
                    webSocket.send(
                        DeviceInfoMessage(
                            deviceId = deviceId,
                            data = collectDeviceInfoData(context)
                        )
                    )
                } catch (_: Exception) {
                    // 忽略单次上报失败
                }
                delay(intervalMs)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
