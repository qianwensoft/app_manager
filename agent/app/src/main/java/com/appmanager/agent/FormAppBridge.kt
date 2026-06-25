package com.appmanager.agent

import android.content.Context
import android.speech.tts.TextToSpeech
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.printer.PrinterManager
import com.appmanager.agent.printer.ProtocolBuilder
import com.appmanager.agent.util.CustomEventBroadcastHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class FormAppBridge(
    private val activity: FormAppActivity,
    private val context: Context,
    private val webView: WebView,
    private val formAppCode: String
) {
    // ── 语音播报（TextToSpeech，懒初始化，中文优先） ──────────────────
    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false
    private val pendingSpeak = ArrayList<String>()

    private fun ensureTts() {
        if (tts != null) return
        synchronized(this) {
            if (tts != null) return
            tts = TextToSpeech(context.applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    // 优先简体中文，缺数据时回退默认语言，避免静默失败
                    runCatching {
                        val r = tts?.setLanguage(Locale.SIMPLIFIED_CHINESE)
                        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                            tts?.setLanguage(Locale.getDefault())
                        }
                    }
                    ttsReady = true
                    synchronized(pendingSpeak) {
                        pendingSpeak.forEachIndexed { idx, t ->
                            // 第一条 flush 清队列，其余追加，避免互相顶掉只剩最后一条
                            val mode = if (idx == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
                            tts?.speak(t, mode, null, "form-app-speak-$idx")
                        }
                        pendingSpeak.clear()
                    }
                } else {
                    // 初始化失败（设备无 TTS 引擎/被包可见性过滤/引擎被禁用）：
                    // 否则文本会一直堆在队列里，表现为完全没声音又无任何提示。
                    // 丢弃队列并提示用户，避免「静默失败」难以排查。
                    Log.w("FormAppBridge", "TTS init failed, status=$status")
                    synchronized(pendingSpeak) { pendingSpeak.clear() }
                    runCatching { tts?.shutdown() }
                    tts = null
                    activity.runOnUiThread {
                        android.widget.Toast.makeText(
                            context, "语音播报不可用：设备未安装可用的 TTS 引擎", android.widget.Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
        }
    }

    private fun flushSpeak(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "form-app-speak")
    }

    /**
     * form-app 事件系统「语音播报」动作调用：把文本用系统 TTS 念出来。
     * TTS 初始化是异步的，未就绪前的文本入队，就绪后立即播报。
     */
    @JavascriptInterface
    fun speak(text: String) {
        val msg = text.trim()
        if (msg.isEmpty()) return
        ensureTts()
        if (ttsReady) {
            flushSpeak(msg)
        } else {
            synchronized(pendingSpeak) { pendingSpeak.add(msg) }
        }
    }

    /** 由 FormAppActivity 在销毁时调用，释放 TTS 资源。 */
    fun release() {
        runCatching {
            tts?.stop()
            tts?.shutdown()
        }
        tts = null
        ttsReady = false
    }

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

    /** 返回当前登录用户的 JWT token，供 form-app 运行时在需要用户身份的接口中附带 Authorization 头。 */
    @JavascriptInterface
    fun getUserToken(): String = AgentConfig.get(context).userToken

    /** 返回服务端 HTTP base URL（由 serverUrl ws→http 转换），供 form-app 运行时构造登录请求。 */
    @JavascriptInterface
    fun getServerUrl(): String = AgentMenuStore.getServerUrl(context)

    /**
     * 扫码方式：hardware / camera。form-app 运行时据此决定是否显示扫码悬浮按钮——
     * 硬件模式仅用扫码枪广播，隐藏摄像头扫码按钮。
     */
    @JavascriptInterface
    fun getScanMode(): String = AgentConfig.get(context).scanMode

    @JavascriptInterface
    fun scanBarcode() {
        // 硬件扫码模式不应触发摄像头；表单侧已隐藏按钮，这里再兜底一层
        if (AgentConfig.get(context).scanMode == AgentConfig.SCAN_MODE_HARDWARE) return
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

    /**
     * form-app 触发蓝牙打印。payloadJson 见 ProtocolBuilder 注释约定。
     * 在 @JavascriptInterface 后台线程同步执行，返回 {"success":bool,"error":string} JSON。
     */
    @JavascriptInterface
    fun print(payloadJson: String): String {
        return try {
            val payload = JSONObject(payloadJson)
            val cfg = AgentConfig.get(context)
            val mac = payload.optString("mac", "").ifEmpty { cfg.defaultPrinterMac }
            val transport = payload.optString("transport", "").ifEmpty { cfg.defaultPrinterTransport }
            if (!payload.has("protocol") || payload.optString("protocol").isEmpty()) {
                payload.put("protocol", cfg.defaultPrinterProtocol)
            }
            if (mac.isEmpty()) {
                return JSONObject().put("success", false).put("error", "未配置默认打印机").toString()
            }
            val bytes = ProtocolBuilder.build(payload)
            when (val r = PrinterManager.print(context, mac, transport, bytes)) {
                is PrinterManager.PrintResult.Success ->
                    JSONObject().put("success", true).toString()
                is PrinterManager.PrintResult.Failure ->
                    JSONObject().put("success", false).put("error", r.message).toString()
            }
        } catch (t: Throwable) {
            JSONObject().put("success", false).put("error", (t.message ?: "打印失败")).toString()
        }
    }

    /** 返回已配对蓝牙打印机 JSON 数组 [{name,mac}]。 */
    @JavascriptInterface
    fun listPrinters(): String {
        val arr = JSONArray()
        try {
            PrinterManager.listPairedPrinters(context).forEach {
                arr.put(JSONObject().put("name", it.name).put("mac", it.mac))
            }
        } catch (_: Throwable) { /* 返回空数组 */ }
        return arr.toString()
    }

    /** 设置默认打印机：json { mac, name, protocol, transport }。 */
    @JavascriptInterface
    fun setDefaultPrinter(json: String) {
        try {
            val o = JSONObject(json)
            val mac = o.optString("mac", "")
            if (mac.isEmpty()) return
            val cur = AgentConfig.get(context)
            AgentConfig.save(context, cur.copy(
                defaultPrinterMac = mac,
                defaultPrinterName = o.optString("name", cur.defaultPrinterName),
                defaultPrinterProtocol = o.optString("protocol", cur.defaultPrinterProtocol).ifEmpty { cur.defaultPrinterProtocol },
                defaultPrinterTransport = o.optString("transport", cur.defaultPrinterTransport).ifEmpty { cur.defaultPrinterTransport }
            ))
        } catch (_: Throwable) { /* 忽略 */ }
    }

    /**
     * 跨 form-app 事件中继（第 7a 步：同设备跨 app）。
     *
     * 前端调用：AndroidBridge.emitCrossAppEvent(jsonPayload)
     * jsonPayload 结构：{ event, payload, origin, hop, _target: { formCode } }
     *
     * 功能：
     * 1. 解析 _target.formCode（目标 form-app）
     * 2. 从 FormAppRegistry 查找目标 WebView
     * 3. 移除扩展字段 _target（不转发给接收端）
     * 4. 调用目标 WebView 的 window.dispatchCrossDeviceEvent(cleanPayload)
     *
     * 幂等/去重/防回环由 TS 接收端 (crossDevice/receiver.ts) 处理。
     */
    @JavascriptInterface
    fun emitCrossAppEvent(jsonPayload: String) {
        try {
            // 1. 解析载荷
            val json = JSONObject(jsonPayload)
            val targetFormCode = json.optJSONObject("_target")?.optString("formCode", "") ?: ""
            if (targetFormCode.isEmpty()) {
                Log.w("FormAppBridge", "emitCrossAppEvent: _target.formCode 缺失")
                return
            }

            // 2. 查找目标 WebView
            val targetWebView = FormAppRegistry.find(targetFormCode)
            if (targetWebView == null) {
                Log.w("FormAppBridge", "emitCrossAppEvent: 目标 form-app 未运行: $targetFormCode")
                return
            }

            // 3. 移除扩展字段 _target（不转发给接收端）
            json.remove("_target")

            // 补全 origin.deviceId（同设备内可选，补一个便于诊断）
            val originObj = json.optJSONObject("origin")
            if (originObj != null && !originObj.has("deviceId")) {
                val deviceId = android.provider.Settings.Secure.getString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ANDROID_ID
                )
                originObj.put("deviceId", deviceId)
            }

            val cleanPayload = json.toString()

            // 4. 调用目标 WebView 的 JS（需在其线程）
            targetWebView.post {
                // 转义单引号防止注入（JSONObject.quote 会加外层双引号，这里手动转义）
                val escaped = cleanPayload
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                val jsCode = "if(window.dispatchCrossDeviceEvent){window.dispatchCrossDeviceEvent('$escaped')}"
                targetWebView.evaluateJavascript(jsCode, null)
            }

            Log.d("FormAppBridge", "emitCrossAppEvent: $formAppCode → $targetFormCode, event: ${json.optString("event")}")
        } catch (e: Exception) {
            Log.e("FormAppBridge", "emitCrossAppEvent 失败", e)
        }
    }
}
