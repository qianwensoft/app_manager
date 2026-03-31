package com.appmanager.agent.ws

import android.util.Log
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.Buffer
import java.util.concurrent.TimeUnit

class AgentWebSocket(
    private val serverUrl: String,
    private val deviceToken: String,
    private val onMessage: (Message) -> Unit,
    private val onConnected: () -> Unit = {},
    private val onDisconnected: () -> Unit = {}
) {
    private val TAG = "AgentWebSocket"
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)  // 不超时，保持长连接
        .build()

    private var ws: WebSocket? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    private val maxReconnectAttempts = Int.MAX_VALUE
    private var isRunning = false

    fun connect() {
        isRunning = true
        reconnectAttempt = 0
        doConnect()
    }

    private fun doConnect() {
        val request = Request.Builder()
            .url("$serverUrl/ws/agent/$deviceToken")
            .header("X-Device-Token", deviceToken)
            .build()

        ws = client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                reconnectAttempt = 0
                onConnected()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg = gson.fromJson(text, Message::class.java)
                    onMessage(msg)
                } catch (e: Exception) {
                    Log.e(TAG, "Parse message error: $e")
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "WebSocket failure: ${formatWsFailure(t, response)}", t)
                onDisconnected()
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closed: $code $reason")
                onDisconnected()
                if (isRunning && code != 1000) scheduleReconnect()
            }
        })
    }

    /** OkHttp 部分失败 throwable.message 为 null，避免日志里只看到 “failure: null”。 */
    private fun formatWsFailure(t: Throwable, response: Response?): String {
        val parts = mutableListOf<String>()
        parts.add(t.javaClass.simpleName)
        t.message?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        t.cause?.message?.takeIf { it.isNotBlank() }?.let { parts.add("cause=${it}") }
        if (response != null) {
            parts.add("http=${response.code} ${response.message}")
        }
        return parts.joinToString(" | ")
    }

    private fun scheduleReconnect() {
        if (!isRunning) return
        reconnectJob?.cancel()
        reconnectJob = CoroutineScope(Dispatchers.IO).launch {
            // 指数退避：5s, 10s, 20s ... 最长 60s
            val delayMs = minOf(5000L * (1 shl reconnectAttempt.coerceAtMost(3)), 60_000L)
            reconnectAttempt++
            Log.i(TAG, "Reconnect in ${delayMs}ms (attempt $reconnectAttempt)")
            delay(delayMs)
            if (isActive && isRunning) doConnect()
        }
    }

    fun send(obj: Any) {
        try {
            val json = gson.toJson(obj)
            val result = ws?.send(json)
            if (result != true) Log.w(TAG, "Send failed (ws closed?)")
        } catch (e: Exception) {
            Log.e(TAG, "send failed: $e", e)
        }
    }

    /** 二进制帧（如投屏 JPEG），避免 Base64 + JSON 膨胀与主线程 Gson 压力。 */
    fun sendBinary(bytes: ByteArray) {
        try {
            val payload = Buffer().write(bytes).readByteString()
            val result = ws?.send(payload)
            if (result != true) Log.w(TAG, "sendBinary failed (ws closed?)")
        } catch (e: Exception) {
            Log.e(TAG, "sendBinary failed: $e", e)
        }
    }

    fun disconnect() {
        isRunning = false
        reconnectJob?.cancel()
        ws?.close(1000, "Client disconnect")
        ws = null
    }
}
