package com.appmanager.agent.util

import com.appmanager.agent.ws.AgentWebSocket
import com.appmanager.agent.ws.DeviceEventMessage

object EventReporter {
    private var webSocket: AgentWebSocket? = null
    private var deviceId: String = ""

    fun init(ws: AgentWebSocket, deviceId: String) {
        this.webSocket = ws
        this.deviceId = deviceId
    }

    fun report(eventType: String, eventData: String) {
        webSocket?.send(DeviceEventMessage(
            deviceId = deviceId,
            eventType = eventType,
            eventData = eventData
        ))
    }
}
