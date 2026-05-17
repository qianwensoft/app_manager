package com.appmanager.agent

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

class FormAppBridge(
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
    fun scanBarcode() {
        // 触发扫码（需要集成扫码库）
        // 扫码结果通过 onScanResult 回调
    }

    fun onScanResult(data: String) {
        webView.post {
            val js = "if(window.eventManager){window.eventManager.emit('barcode','$data')}"
            webView.evaluateJavascript(js, null)
        }
    }

    @JavascriptInterface
    fun toast(message: String) {
        android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show()
    }
}
