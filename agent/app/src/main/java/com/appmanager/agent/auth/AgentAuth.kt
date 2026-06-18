package com.appmanager.agent.auth

import android.content.Context
import com.appmanager.agent.AgentMenuStore
import com.appmanager.agent.config.AgentConfig
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Agent 端用户登录态：调用服务端 /api/auth/login 换取 JWT，
 * 把 token / 用户名 / 角色持久化到 [AgentConfig]，供个人中心展示与菜单点击守卫使用。
 */
object AgentAuth {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val mapType = object : TypeToken<Map<String, Any?>>() {}.type
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun isLoggedIn(context: Context): Boolean =
        AgentConfig.get(context).userToken.isNotBlank()

    /** 登录成功返回 null；失败返回错误信息（供 UI 展示）。阻塞调用，需在 IO 线程执行。 */
    fun login(context: Context, username: String, password: String): String? {
        val base = AgentMenuStore.getServerUrl(context).trim().trimEnd('/')
        if (base.isEmpty()) return "未配置服务器地址，请先扫码注册"

        val payload = Gson().toJson(mapOf("username" to username, "password" to password))
        val req = Request.Builder()
            .url("$base/api/auth/login")
            .post(payload.toRequestBody(jsonMedia))
            .build()

        return try {
            client.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                val map: Map<String, Any?> = runCatching {
                    Gson().fromJson<Map<String, Any?>>(body, mapType)
                }.getOrNull() ?: emptyMap()
                if (!resp.isSuccessful) {
                    return (map["error"] as? String)?.takeIf { it.isNotBlank() } ?: "登录失败（HTTP ${resp.code}）"
                }
                val token = (map["token"] as? String).orEmpty()
                if (token.isBlank()) return "登录响应缺少 token"
                @Suppress("UNCHECKED_CAST")
                val user = map["user"] as? Map<String, Any?>
                val name = (user?.get("username") as? String).orEmpty().ifEmpty { username }
                val role = (user?.get("role") as? String).orEmpty()
                val cur = AgentConfig.get(context)
                AgentConfig.save(context, cur.copy(userToken = token, userName = name, userRole = role))
                null
            }
        } catch (e: Exception) {
            "网络错误：${e.message ?: "请求失败"}"
        }
    }

    fun logout(context: Context) {
        val cur = AgentConfig.get(context)
        AgentConfig.save(context, cur.copy(userToken = "", userName = "", userRole = ""))
    }
}
