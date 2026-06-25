package com.appmanager.agent

import android.content.Context
import android.util.Log
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.CustomEventBroadcastHelper
import com.appmanager.agent.util.CustomEventProbeHelper
import com.appmanager.agent.util.ServerUrlUtil
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * WebSocket 连接后与服务器监听快照对齐：
 * - active + rules：恢复本机广播监听（断线重连兜底，与服务端 WS 推送互补）
 * - 未激活：停止监听（Web「删除/停用」命令丢失时的兜底）
 */
object CustomEventListenSync {
    private const val TAG = "CustomEventListenSync"

    fun syncFromServerAsync(
        scope: CoroutineScope,
        context: Context,
        serverUrl: String,
        deviceToken: String
    ) {
        scope.launch(Dispatchers.IO) {
            try {
                syncFromServerBlocking(context.applicationContext, serverUrl, deviceToken)
            } catch (e: Exception) {
                Log.w(TAG, "listen-state sync failed", e)
            }
        }
    }

    private fun syncFromServerBlocking(context: Context, serverUrl: String, deviceToken: String) {
        val base = ServerUrlUtil.httpBaseFromWs(serverUrl)
        val token = deviceToken.trim()
        if (base.isEmpty() || token.isEmpty()) return

        val json = AgentCatalogApi.getJson(base, "/api/agent/custom-events/listen-state", token)
        val data = JSONObject(json).optJSONObject("data")
        val active = data?.optBoolean("active", false) == true

        if (active && !CustomEventProbeHelper.isProbing()) {
            CustomEventBroadcastHelper.configureLoopGuard(loopGuardMapFromState(data))
            val rules = parseRulesFromListenState(data)
            if (rules != null) {
                CustomEventBroadcastHelper.start(context, rules)
                Log.i(TAG, "restored custom event listen from server snapshot (${rules.size} rules)")
                return
            }
            Log.w(TAG, "server listen active but no rules in snapshot")
        }

        if (!active && !CustomEventProbeHelper.isProbing()) {
            if (CustomEventBroadcastHelper.isListening()) {
                CustomEventBroadcastHelper.stop(context)
                Log.i(TAG, "stopped local custom event listen (server inactive or no snapshot)")
            }
        }
    }

    private fun loopGuardMapFromState(data: JSONObject?): Map<String, Any?>? {
        val g = data?.optJSONObject("loop_guard") ?: return null
        val key = g.optString("ignore_extra_key", "").trim()
        if (key.isEmpty()) return null
        return mapOf("loop_guard" to mapOf("ignore_extra_key" to key))
    }

    private fun parseRulesFromListenState(data: JSONObject?): List<CustomEventBroadcastHelper.EventRule>? {
        val arr = data?.optJSONArray("rules") ?: return null
        if (arr.length() == 0) return null
        val raw = ArrayList<Map<String, Any?>>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val eventType = o.optString("event_type", "").trim()
            if (eventType.isEmpty()) continue
            raw.add(
                mapOf(
                    "event_type" to eventType,
                    "actions" to jsonArrayToStringList(o.optJSONArray("actions")),
                    "extra_keys" to jsonArrayToStringList(o.optJSONArray("extra_keys"))
                )
            )
        }
        if (raw.isEmpty()) return null
        return CustomEventBroadcastHelper.parseRulesFromServer(mapOf("rules" to raw))
    }

    private fun jsonArrayToStringList(arr: JSONArray?): List<String> {
        if (arr == null || arr.length() == 0) return emptyList()
        val out = ArrayList<String>(arr.length())
        for (i in 0 until arr.length()) {
            val s = arr.optString(i, "").trim()
            if (s.isNotEmpty()) out.add(s)
        }
        return out
    }
}
