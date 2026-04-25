package com.appmanager.agent.util

import android.util.Log
import com.appmanager.agent.ws.AgentWebSocket
import com.appmanager.agent.ws.DeviceEventMessage

object EventReporter {
    private const val TAG = "EventReporter"

    private var webSocket: AgentWebSocket? = null
    private var deviceId: String = ""

    fun init(ws: AgentWebSocket, deviceId: String) {
        this.webSocket = ws
        this.deviceId = deviceId
    }

    fun report(eventType: String, eventData: String) {
        try {
            webSocket?.send(
                DeviceEventMessage(
                    deviceId = deviceId,
                    eventType = eventType,
                    eventData = eventData
                )
            )
        } catch (t: Throwable) {
            Log.e(TAG, "report failed eventType=$eventType len=${eventData.length}", t)
        }
    }
}
