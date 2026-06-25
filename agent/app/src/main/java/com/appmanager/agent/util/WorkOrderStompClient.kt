package com.appmanager.agent.util

import android.content.Context
import android.util.Log
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.ServerUrlUtil
import io.reactivex.disposables.CompositeDisposable
import io.reactivex.disposables.Disposable
import org.json.JSONObject
import ua.naiksoftware.stomp.Stomp
import ua.naiksoftware.stomp.StompClient
import ua.naiksoftware.stomp.dto.LifecycleEvent

/**
 * 工单 STOMP 实时更新客户端
 */
object WorkOrderStompClient {

    private const val TAG = "WorkOrderStompClient"
    private var stompClient: StompClient? = null
    private val compositeDisposable = CompositeDisposable()
    private var lifecycleDisposable: Disposable? = null
    private val listeners = mutableListOf<WorkOrderUpdateListener>()

    interface WorkOrderUpdateListener {
        fun onWorkOrderUpdated(workOrderId: Int, action: String)
    }

    /**
     * 连接 STOMP 服务器
     */
    fun connect(context: Context) {
        if (stompClient?.isConnected == true) {
            Log.d(TAG, "STOMP already connected")
            return
        }

        try {
            val cfg = AgentConfig.get(context)
            val wsUrl = cfg.serverUrl.trim()
            if (wsUrl.isBlank()) {
                Log.e(TAG, "Server URL is blank")
                return
            }

            // 从 Agent WebSocket URL 构造 STOMP URL
            // 情况1: ws://host:port/ws/agent -> ws://host:port/ws/stomp
            // 情况2: ws://host:port -> ws://host:port/ws/stomp
            val baseStompUrl = if (wsUrl.contains("/ws/")) {
                // 包含 /ws/ 路径，替换为 /ws/stomp
                wsUrl.replaceAfter("/ws/", "stomp").replace("/ws/agent", "/ws/stomp")
            } else {
                // 没有路径，添加 /ws/stomp
                wsUrl.trimEnd('/') + "/ws/stomp"
            }

            // STOMP 认证：优先使用用户登录的 JWT token，否则尝试使用 device token
            // 用户登录后的 token 存储在 AgentConfig.userToken
            val authToken = cfg.userToken.trim().ifEmpty { cfg.deviceToken.trim() }
            val stompUrl = if (authToken.isNotEmpty()) {
                "$baseStompUrl?token=$authToken"
            } else {
                baseStompUrl
            }

            Log.d(TAG, "Agent URL: $wsUrl")
            Log.d(TAG, "Auth token type: ${if (cfg.userToken.isNotEmpty()) "user JWT" else if (cfg.deviceToken.isNotEmpty()) "device" else "none"}")
            Log.d(TAG, "Connecting to STOMP: ${baseStompUrl}?token=***")

            stompClient = Stomp.over(Stomp.ConnectionProvider.OKHTTP, stompUrl)

            // 监听生命周期事件
            lifecycleDisposable = stompClient?.lifecycle()?.subscribe { event ->
                when (event.type) {
                    LifecycleEvent.Type.OPENED -> {
                        Log.d(TAG, "STOMP connection opened")
                        subscribeToWorkOrders()
                    }
                    LifecycleEvent.Type.CLOSED -> {
                        Log.d(TAG, "STOMP connection closed")
                    }
                    LifecycleEvent.Type.ERROR -> {
                        Log.e(TAG, "STOMP connection error", event.exception)
                    }
                    else -> {
                        Log.d(TAG, "STOMP lifecycle: ${event.type}")
                    }
                }
            }

            stompClient?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect STOMP", e)
        }
    }

    /**
     * 订阅工单更新主题
     */
    private fun subscribeToWorkOrders() {
        val topic = "/topic/work-orders"
        Log.d(TAG, "Subscribing to: $topic")

        stompClient?.topic(topic)?.subscribe({ message ->
            try {
                val payload = message.payload
                Log.d(TAG, "Received work order update: $payload")

                val json = JSONObject(payload)
                val workOrderId = json.optInt("id", 0)
                val event = json.optString("event", "update")

                if (workOrderId > 0) {
                    notifyListeners(workOrderId, event)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse work order update", e)
            }
        }, { error ->
            Log.e(TAG, "STOMP topic subscription error", error)
        })?.let {
            compositeDisposable.add(it)
        }
    }

    /**
     * 断开连接
     */
    fun disconnect() {
        Log.d(TAG, "Disconnecting STOMP")
        compositeDisposable.clear()
        lifecycleDisposable?.dispose()
        stompClient?.disconnect()
        stompClient = null
    }

    /**
     * 添加监听器
     */
    fun addListener(listener: WorkOrderUpdateListener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener)
        }
    }

    /**
     * 移除监听器
     */
    fun removeListener(listener: WorkOrderUpdateListener) {
        listeners.remove(listener)
    }

    /**
     * 通知所有监听器
     */
    private fun notifyListeners(workOrderId: Int, action: String) {
        listeners.forEach { listener ->
            try {
                listener.onWorkOrderUpdated(workOrderId, action)
            } catch (e: Exception) {
                Log.e(TAG, "Error notifying listener", e)
            }
        }
    }

    /**
     * 检查连接状态
     */
    fun isConnected(): Boolean {
        return stompClient?.isConnected == true
    }
}
