package com.appmanager.agent.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.nio.charset.Charset

/**
 * 按服务端下发的 [EventRule] 注册广播：匹配 **广播动作 (action)**，按顺序从 Intent extra **数据标签** 取值并上报。
 */
object CustomEventBroadcastHelper {

    private const val TAG = "CustomEventIntent"

    data class EventRule(
        val eventType: String,
        val actions: List<String>,
        val extraKeys: List<String>
    )

    @Volatile
    private var receiver: BroadcastReceiver? = null

    @Volatile
    private var activeRules: List<EventRule> = emptyList()

    fun getActiveRules(): List<EventRule> = activeRules

    fun isListening(): Boolean = receiver != null

    /** 解析服务端 command data 中的 rules 数组。 */
    fun parseRulesFromServer(data: Map<*, *>?): List<EventRule>? {
        val raw = data?.get("rules") as? List<*> ?: return null
        val out = ArrayList<EventRule>()
        for (x in raw) {
            val m = x as? Map<*, *> ?: continue
            val et = (m["event_type"] as? String)?.trim() ?: continue
            if (et.isEmpty()) continue
            val acts = (m["actions"] as? List<*>)
                ?.mapNotNull { it?.toString()?.trim() }
                ?.filter { it.isNotEmpty() }
                ?: emptyList()
            val keys = (m["extra_keys"] as? List<*>)
                ?.mapNotNull { it?.toString()?.trim() }
                ?.filter { it.isNotEmpty() }
                ?: emptyList()
            if (acts.isEmpty() || keys.isEmpty()) continue
            out.add(EventRule(et, acts, keys))
        }
        return out.ifEmpty { null }
    }

    /** 无 rules 时的内置兜底（与旧版默认一致）。 */
    private fun defaultRules(): List<EventRule> {
        return listOf(
            EventRule(
                eventType = "pda_scan_broadcast",
                actions = listOf(
                    "com.android.server.scannerservice.broadcast",
                    "nlscan.action.SCANNER_RESULT",
                    "com.honeywell.decode.intent.action.EDIT_DATA",
                    "com.honeywell.decode.intent.action.BARCODE_DATA",
                    "android.intent.ACTION_DECODE_DATA",
                    "com.sunmi.scanner.ACTION_DATA",
                    "unitech.scanservice.data",
                    "com.zebra.dw.action.ACTION_DECODE_DATA"
                ),
                extraKeys = listOf(
                    "data", "barcode_string", "decode_data", "SCAN_DATA", "scannerdata",
                    "barcode", "BARCODE", "SCAN_BARCODE1", "barcodeData", "decodeData"
                )
            )
        )
    }

    fun start(context: Context, rules: List<EventRule>?) {
        stop(context)
        val use = if (rules.isNullOrEmpty()) defaultRules() else rules
        activeRules = use

        val appCtx = context.applicationContext
        val filter = IntentFilter()
        val seen = HashSet<String>()
        for (r in use) {
            for (a in r.actions) {
                if (seen.add(a)) {
                    filter.addAction(a)
                }
            }
        }
        if (seen.isEmpty()) {
            Log.w(TAG, "no actions to register")
            return
        }

        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                val action = intent.action ?: return
                for (rule in activeRules) {
                    if (action !in rule.actions) continue
                    val pair = extractFromIntent(rule.extraKeys, intent) ?: continue
                    val (value, usedKey) = pair
                    val payload = JSONObject().apply {
                        put("value", value)
                        put("intent_action", action)
                        put("extra_key", usedKey)
                    }
                    EventReporter.report(rule.eventType, payload.toString())
                    Log.i(TAG, "event=${rule.eventType} action=$action key=$usedKey len=${value.length}")
                    return
                }
                Log.v(TAG, "no rule matched action=$action extras=${intent.extras?.keySet()}")
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
            Log.i(TAG, "registered ${seen.size} actions, ${use.size} rules")
        } catch (e: Exception) {
            receiver = null
            activeRules = emptyList()
            Log.e(TAG, "registerReceiver failed", e)
        }
    }

    fun stop(context: Context) {
        val rec = receiver ?: return
        receiver = null
        activeRules = emptyList()
        try {
            context.applicationContext.unregisterReceiver(rec)
        } catch (e: Exception) {
            Log.w(TAG, "unregisterReceiver", e)
        }
    }

    private fun extractFromIntent(keys: List<String>, intent: Intent): Pair<String, String>? {
        val b = intent.extras
        if (b != null) {
            for (k in keys) {
                if (!b.containsKey(k)) continue
                val v = b.get(k) ?: continue
                val s = extraToString(v) ?: continue
                if (s.isNotEmpty()) return Pair(s, k)
            }
        }
        intent.dataString?.trim()?.takeIf { it.isNotEmpty() }?.let { return Pair(it, "intent.data") }
        return null
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
