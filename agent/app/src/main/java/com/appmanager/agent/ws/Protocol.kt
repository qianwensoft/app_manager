package com.appmanager.agent.ws

import com.google.gson.annotations.SerializedName

// ─── 消息基类 ───────────────────────────────────────────────────────────────
data class Message(
    val type: String,
    val action: String? = null,
    @SerializedName("commandId") val commandId: String? = null,
    val payload: Map<String, Any>? = null,
    val data: Any? = null,
    val deviceId: String? = null
)

// ─── 上行：Agent → Server ────────────────────────────────────────────────────
data class RegisterMessage(
    val type: String = "register",
    val deviceId: String,
    val token: String,
    val agentVersion: String = "1.0.0"
)

data class HeartbeatMessage(
    val type: String = "heartbeat",
    val deviceId: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class DeviceInfoMessage(
    val type: String = "device_info",
    val deviceId: String,
    val data: DeviceInfoData,
    /** Web 请求即时上报时回传，服务端用于唤醒 HTTP 等待 */
    @SerializedName("push_request_id") val pushRequestId: String? = null
)

data class DeviceInfoData(
    val battery: Int,
    @SerializedName("cpu_usage") val cpuUsage: Float,
    @SerializedName("memory_used") val memoryUsed: Long,
    @SerializedName("memory_total") val memoryTotal: Long,
    /** /data 分区，MB，与服务端 Device.total_storage 一致 */
    @SerializedName("storage_used") val storageUsed: Long = 0L,
    @SerializedName("storage_total") val storageTotal: Long = 0L,
    @SerializedName("network_type") val networkType: String,
    val ip: String,
    val model: String,
    val brand: String,
    @SerializedName("os_version") val osVersion: String,
    @SerializedName("sdk_version") val sdkVersion: Int,
    @SerializedName("wifi_ssid") val wifiSsid: String? = null,
    @SerializedName("wifi_signal") val wifiSignal: Int? = null,
    @SerializedName("wifi_speed") val wifiSpeed: Int? = null,
    @SerializedName("network_connected") val networkConnected: Boolean = false,
    @SerializedName("agent_alias") val agentAlias: String = "",
    @SerializedName("group_name") val groupName: String = "",
    val resolution: String = "",
    @SerializedName("allow_remote_screen") val allowRemoteScreen: Boolean = false,
    /** Agent APK 版本，供服务端设备档案展示 */
    @SerializedName("agent_version") val agentVersion: String = ""
)

data class ScreenFrameMessage(
    val type: String = "screen_frame",
    val deviceId: String,
    val data: ScreenFrameData
)

data class ScreenFrameData(
    val format: String = "jpeg",
    val width: Int,
    val height: Int,
    val data: String  // base64
)

data class CommandResultMessage(
    val type: String = "command_result",
    val commandId: String,
    val success: Boolean,
    val output: String = ""
)

data class DeviceEventMessage(
    val type: String = "device_event",
    val deviceId: String,
    val eventType: String,
    val eventData: String
)

// ─── WebRTC 信令 ──────────────────────────────────────────────────────────────
data class WebRTCSignalMessage(
    val type: String = "webrtc_signal",
    val deviceId: String,
    val data: WebRTCSignalData
)

data class WebRTCSignalData(
    val type: String,          // "offer" | "answer" | "candidate"
    val sdp: String? = null,
    val candidate: String? = null,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null
)

// ─── 下行：Server → Agent ────────────────────────────────────────────────────
object CommandAction {
    const val START_SCREEN   = "start_screen"
    const val STOP_SCREEN    = "stop_screen"
    const val START_SHELL    = "start_shell"
    const val STOP_SHELL     = "stop_shell"
    const val SHELL_INPUT    = "shell_input"
    const val START_LOGCAT   = "start_logcat"
    const val STOP_LOGCAT    = "stop_logcat"
    const val START_RECORDING = "start_recording"
    const val STOP_RECORDING  = "stop_recording"
    const val INSTALL_APP    = "install_app"
    const val UNINSTALL_APP  = "uninstall_app"
    const val START_APP      = "start_app"
    const val STOP_APP       = "stop_app"
    const val REBOOT         = "reboot"
    const val GET_INFO       = "get_info"
    const val CAPTURE_SCREENSHOT = "capture_screenshot"
    const val SPEED_TEST_PING = "speed_test_ping"
    const val SPEED_TEST_THROUGHPUT = "speed_test_throughput"
    const val LIST_INSTALLED_APPS = "list_installed_apps"
    /** 将已安装包的 APK（多 split 时为 zip）POST 到服务端供浏览器下载 */
    const val EXPORT_INSTALLED_APK = "export_installed_apk"
    /** 立即采集并上报 device_info（含 Wi‑Fi SSID 等），供 Web 刷新 */
    const val PUSH_DEVICE_INFO = "push_device_info"
}
