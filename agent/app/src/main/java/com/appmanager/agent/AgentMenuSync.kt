package com.appmanager.agent

import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object AgentMenuSync {
    private const val TAG = "AgentMenuSync"

    private val manifestClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val manifestJsonType = object : TypeToken<Map<String, Any>>() {}.type

    /**
     * 连接建立后拉取菜单快照，补齐 WS 推送丢失或离线期间的变更。
     */
    fun fetchManifestAsync(
        scope: CoroutineScope,
        context: Context,
        serverUrl: String,
        deviceToken: String
    ) {
        scope.launch(Dispatchers.IO) {
            try {
                fetchManifestBlocking(context.applicationContext, serverUrl, deviceToken)
            } catch (e: Exception) {
                Log.w(TAG, "menu-manifest failed", e)
            }
        }
    }

    private fun fetchManifestBlocking(context: Context, serverUrl: String, deviceToken: String) {
        val base = serverUrl.trim().trimEnd('/')
        val tok = deviceToken.trim()
        if (base.isEmpty() || tok.isEmpty()) return
        val since = AgentMenuStore.revision(context)
        val url = "$base/api/agent/menu-manifest?since=$since"
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", tok)
            .get()
            .build()
        manifestClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                Log.w(TAG, "menu-manifest HTTP ${resp.code}")
                return
            }
            val body = resp.body?.string() ?: return
            val map: Map<String, Any> = Gson().fromJson(body, manifestJsonType) ?: return
            if (map["unchanged"] as? Boolean == true) {
                Log.d(TAG, "menu-manifest unchanged since=$since")
                return
            }
            applyFromServer(context, map)
        }
    }

    fun applyFromServer(context: Context, data: Map<*, *>) {
        val rev = (data["revision"] as? Number)?.toLong() ?: 0L
        val menus = data["menus"] ?: return
        val json = Gson().toJson(menus)
        AgentMenuStore.save(context.applicationContext, rev, json)
        Log.i(TAG, "menus synced revision=$rev bytes=${json.length}")
        MenuIntentReceiver.reregister(context.applicationContext)
        context.applicationContext.sendBroadcast(
            Intent(DeviceProfileSync.ACTION_UI_REFRESH).setPackage(context.packageName)
        )
    }
}
