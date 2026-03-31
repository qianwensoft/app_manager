package com.appmanager.agent.service

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

    fun start() {
        job?.cancel()
        job = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                webSocket.send(HeartbeatMessage(deviceId = deviceId))
                delay(30_000L)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
