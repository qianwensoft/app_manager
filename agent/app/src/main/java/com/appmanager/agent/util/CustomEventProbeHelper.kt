package com.appmanager.agent.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.appmanager.agent.ws.AgentWebSocket
import java.nio.charset.Charset

/**
 * 事件分析探针：注册宽动作列表，将每次扫码广播的 action 与全部 extras 上报服务端。
 */
object CustomEventProbeHelper {

    private const val TAG = "CustomEventProbe"
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile
    private var receiver: BroadcastReceiver? = null

    @Volatile
    private var sessionId: String = ""

    @Volatile
    private var webSocket: AgentWebSocket? = null

    @Volatile
    private var deviceId: String = ""

    @Volatile
    private var patterns: List<String> = emptyList()

    fun bind(ws: AgentWebSocket, devId: String) {
        webSocket = ws
        deviceId = devId
    }

    fun isProbing(): Boolean = receiver != null

    fun start(context: Context, sid: String, actions: List<String>?, probePatterns: List<String>?) {
        val app = context.applicationContext
        runOnMain { startInternal(app, sid, actions, probePatterns) }
    }

    fun stop(context: Context) {
        val app = context.applicationContext
        runOnMain { stopInternal(app) }
    }

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block()
        else mainHandler.post(block)
    }

    private fun startInternal(
        appCtx: Context,
        sid: String,
        actions: List<String>?,
        probePatterns: List<String>?
    ) {
        CustomEventBroadcastHelper.stop(appCtx)
        stopInternal(appCtx)
        val acts = actions?.map { it.trim() }?.filter { it.isNotEmpty() }?.distinct() ?: emptyList()
        if (acts.isEmpty()) {
            Log.w(TAG, "no probe actions")
            return
        }
        sessionId = sid.trim()
        patterns = probePatterns?.map { it.trim() }?.filter { it.isNotEmpty() }?.distinct() ?: emptyList()
        val filter = IntentFilter()
        for (a in acts) filter.addAction(a)

        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val incoming = try { intent } catch (t: Throwable) {
                    Log.e(TAG, "onReceive intent failed", t)
                    return
                } ?: return
                val action = try { incoming.action } catch (t: Throwable) {
                    Log.e(TAG, "read action failed", t)
                    return
                } ?: return
                if (!matchesProbeAction(action)) return
                try {
                    val extras = collectExtras(incoming)
                    if (extras.isEmpty()) return
                    reportProbe(action, extras)
                    Log.i(TAG, "probe action=$action extras=${extras.keys}")
                } catch (t: Throwable) {
                    Log.e(TAG, "probe onReceive failed action=$action", t)
                }
            }
        }
        receiver = r
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appCtx.registerReceiver(r, filter, ContextCompat.RECEIVER_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                appCtx.registerReceiver(r, filter)
            }
            Log.i(TAG, "probe registered ${acts.size} actions session=$sessionId")
        } catch (e: Exception) {
            receiver = null
            sessionId = ""
            Log.e(TAG, "registerReceiver failed", e)
        }
    }

    private fun matchesProbeAction(action: String): Boolean {
        val pats = patterns
        if (pats.isEmpty()) return true
        val a = action.trim()
        if (a.isEmpty()) return false
        for (pat in pats) {
            if (pat == "*") return true
            if (pat == a) return true
            if (pat.endsWith(".*")) {
                val prefix = pat.dropLast(2)
                if (prefix.isNotEmpty() && (a == prefix || a.startsWith("$prefix."))) return true
            } else if (pat.contains("*")) {
                val parts = pat.split("*", limit = 2)
                if (parts.size == 2) {
                    val head = parts[0]
                    val tail = parts[1]
                    if (head.isEmpty() && tail.isNotEmpty() && a.endsWith(tail)) return true
                    if (tail.isEmpty() && head.isNotEmpty() && a.startsWith(head)) return true
                    if (head.isNotEmpty() && tail.isNotEmpty() && a.startsWith(head) && a.endsWith(tail)) return true
                }
            }
        }
        return false
    }

    private fun stopInternal(appCtx: Context) {
        val rec = receiver ?: return
        receiver = null
        sessionId = ""
        patterns = emptyList()
        try {
            appCtx.unregisterReceiver(rec)
        } catch (e: Exception) {
            Log.w(TAG, "unregisterReceiver", e)
        }
    }

    private fun collectExtras(intent: Intent): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        val b = intent.extras ?: return out
        for (key in b.keySet()) {
            val k = key?.trim().orEmpty()
            if (k.isEmpty()) continue
            try {
                val v = b.get(key) ?: continue
                extraToString(v)?.takeIf { it.isNotEmpty() }?.let { out[k] = it.take(500) }
            } catch (_: Throwable) {
                /* skip */
            }
        }
        intent.dataString?.trim()?.takeIf { it.isNotEmpty() }?.let {
            out["intent.data"] = it.take(500)
        }
        return out
    }

    private fun reportProbe(intentAction: String, extras: Map<String, String>) {
        val ws = webSocket ?: return
        val sid = sessionId
        if (sid.isEmpty()) return
        val payload = linkedMapOf<String, Any>(
            "type" to "custom_event_probe",
            "deviceId" to deviceId,
            "data" to linkedMapOf(
                "session_id" to sid,
                "intent_action" to intentAction,
                "extras" to extras
            )
        )
        try {
            ws.send(payload)
        } catch (t: Throwable) {
            Log.e(TAG, "reportProbe send failed", t)
        }
    }

    private fun extraToString(v: Any?): String? {
        if (v == null) return null
        return when (v) {
            is String -> v.trim().takeIf { it.isNotEmpty() }
            is CharSequence -> v.toString().trim().takeIf { it.isNotEmpty() }
            is ByteArray -> String(v, Charset.forName("UTF-8")).trim().takeIf { it.isNotEmpty() }
            is IntArray, is LongArray, is FloatArray, is DoubleArray -> null
            else -> v.toString().trim().takeIf { it.isNotEmpty() }
        }
    }
}
