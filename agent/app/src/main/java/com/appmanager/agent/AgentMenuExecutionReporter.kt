package com.appmanager.agent

import android.content.Context
import android.util.Log
import com.appmanager.agent.config.AgentConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object AgentMenuExecutionReporter {
    private const val TAG = "AgentMenuExecReporter"
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun report(
        context: Context,
        intentAction: String,
        eventType: String,
        scanValue: String,
        targetUrl: String,
        status: String,
        errorMessage: String = ""
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val cfg = AgentConfig.get(context)
                val base = cfg.serverUrl.trim().trimEnd('/')
                val token = cfg.deviceToken.trim()
                if (base.isEmpty() || token.isEmpty()) return@launch
                val body = JSONObject()
                    .put("intent_action", intentAction)
                    .put("event_type", eventType)
                    .put("scan_value", scanValue)
                    .put("target_url", targetUrl)
                    .put("status", status)
                    .put("error_message", errorMessage)
                    .put("bundle_revision", AgentMenuStore.revision(context).toInt())
                val req = Request.Builder()
                    .url("$base/api/agent/menu-execution/report")
                    .header("X-Device-Token", token)
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "report failed: HTTP ${resp.code}")
                    }
                }
            }.onFailure { e ->
                Log.w(TAG, "report failed", e)
            }
        }
    }
}
