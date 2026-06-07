package com.appmanager.agent

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.CustomEventBroadcastHelper
import org.json.JSONObject

class FormAppBridge(
    private val activity: FormAppActivity,
    private val context: Context,
    private val webView: WebView
) {
    @JavascriptInterface
    fun getDeviceInfo(): String {
        val info = JSONObject()
        info.put("device_id", android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ))
        info.put("model", android.os.Build.MODEL)
        return info.toString()
    }

    @JavascriptInterface
    fun getDeviceToken(): String = AgentConfig.get(context).deviceToken

    @JavascriptInterface
    fun scanBarcode() {
        activity.runOnUiThread { activity.launchBarcodeScan() }
    }

    fun onScanResult(data: String, eventType: String = "barcode") {
        webView.post {
            val quoted = JSONObject.quote(data)
            val typeQuoted = JSONObject.quote(eventType)
            val js = "if(window.eventManager){window.eventManager.emit($typeQuoted,$quoted)}"
            webView.evaluateJavascript(js, null)
        }
    }

    @JavascriptInterface
    fun toast(message: String) {
        android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show()
    }

    /**
     * 由 form-app 运行时调用：在当前页面需要独占扫码时，屏蔽/恢复 Agent 全局自定义事件广播监听。
     * 避免同一次扫码既触发 form-app 路由跳转，又被 Custom Event 系统上报到服务端触发其他流程。
     */
    @JavascriptInterface
    fun blockGlobalEvents(blocked: Boolean) {
        if (blocked) {
            CustomEventBroadcastHelper.stop(context)
        } else {
            // 恢复监听（使用默认规则，服务端动态规则在重连后由 CustomEventListenSync 重新下发）
            CustomEventBroadcastHelper.start(context, null)
        }
    }
}
