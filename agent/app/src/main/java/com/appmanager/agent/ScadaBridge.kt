package com.appmanager.agent

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import com.appmanager.agent.config.AgentConfig
import org.json.JSONObject

/**
 * SCADA WebView JSBridge - 为组态编辑器提供与 Agent 的双向通信。
 *
 * 注入到 window.ScadaBridge，支持：
 * - 获取设备信息（deviceId, deviceToken, scanMode）
 * - 触发摄像头扫码
 * - 接收硬件扫码枪事件（通过 Activity 调用 onScanResult）
 * - Toast 提示
 *
 * 参考 FormAppBridge 实现，精简为 SCADA 核心功能。
 */
class ScadaBridge(
    private val activity: ScadaWebViewActivity,
    private val context: Context
) {
    companion object {
        private const val TAG = "ScadaBridge"
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        val info = JSONObject()
        info.put("device_id", android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ))
        info.put("model", android.os.Build.MODEL)
        info.put("brand", android.os.Build.BRAND)
        info.put("os_version", android.os.Build.VERSION.RELEASE)
        return info.toString()
    }

    @JavascriptInterface
    fun getDeviceToken(): String = AgentConfig.get(context).deviceToken

    /**
     * 返回扫码方式：hardware / camera。
     * SCADA 工作流据此决定是否显示摄像头扫码按钮（硬件模式下隐藏）。
     */
    @JavascriptInterface
    fun getScanMode(): String = AgentConfig.get(context).scanMode

    /**
     * 触发摄像头扫码（仅在 camera 模式下有效）。
     * 硬件模式下此方法无效，因为已经有扫码枪广播监听。
     */
    @JavascriptInterface
    fun scanBarcode() {
        if (AgentConfig.get(context).scanMode == AgentConfig.SCAN_MODE_HARDWARE) {
            Log.d(TAG, "scanBarcode() called in hardware mode, ignored")
            return
        }
        activity.runOnUiThread {
            activity.launchBarcodeScan()
        }
    }

    /**
     * 由 Activity 调用，将扫码结果注入到 WebView 的工作流引擎。
     * 通过 window.scadaEventBus.emit() 派发事件。
     *
     * @param data 扫码内容
     * @param eventType 事件类型（barcode / qrcode / nfc）
     * @param deviceId 设备 ID（可选，从 Bridge 获取）
     */
    fun onScanResult(data: String, eventType: String = "barcode") {
        activity.runOnUiThread {
            val deviceId = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            )
            val quotedData = JSONObject.quote(data)
            val quotedType = JSONObject.quote(eventType)
            val quotedDeviceId = JSONObject.quote(deviceId)
            
            // 调用 JS：window.scadaEventBus?.emit('agent_scan', { value, event_type, device_id })
            val js = """
                if (window.scadaEventBus && window.scadaEventBus.emit) {
                    window.scadaEventBus.emit('agent_scan', {
                        value: $quotedData,
                        event_type: $quotedType,
                        device_id: $quotedDeviceId
                    });
                }
            """.trimIndent()
            
            activity.getWebView()?.evaluateJavascript(js) { result ->
                Log.d(TAG, "onScanResult dispatched: data=$data, type=$eventType, result=$result")
            }
        }
    }

    @JavascriptInterface
    fun toast(message: String) {
        activity.runOnUiThread {
            android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun getServerUrl(): String = AgentMenuStore.getServerUrl(context)

    @JavascriptInterface
    fun getUserToken(): String = AgentConfig.get(context).userToken
}
