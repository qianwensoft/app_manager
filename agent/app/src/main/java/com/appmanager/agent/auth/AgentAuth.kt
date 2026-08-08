package com.appmanager.agent.auth

import android.content.Context
import android.content.Intent
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
 * Agent 端用户登录态管理。
 *
 * Token 体系：
 *   access token  — 短期 JWT（由 config.JWT.ExpireHour 决定），携带用户 ID / 角色。
 *   refresh token — 30 天有效的随机令牌，可无感换取新 access token。
 *
 * 广播常量（仅包内接收）：
 *   ACTION_LOGIN_SUCCESS  — 登录成功后发出，供 AgentService 触发菜单同步。
 *   ACTION_LOGOUT         — 用户主动退出时发出。
 *   ACTION_TOKEN_EXPIRED  — refresh token 也失效，需要重新登录时发出。
 */
object AgentAuth {

    const val ACTION_LOGIN_SUCCESS = "com.appmanager.agent.AUTH_LOGIN_SUCCESS"
    const val ACTION_LOGOUT        = "com.appmanager.agent.AUTH_LOGOUT"
    const val ACTION_TOKEN_EXPIRED = "com.appmanager.agent.AUTH_TOKEN_EXPIRED"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val mapType = object : TypeToken<Map<String, Any?>>() {}.type
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    // ── 登录状态判断 ──────────────────────────────────────────────────────────

    /**
     * token 存在且未过期（提前 60 秒视为过期，触发 refresh）。
     * 旧版 userTokenExpiry == 0 时兼容处理（仅判断 token 非空）。
     */
    fun isLoggedIn(context: Context): Boolean {
        val cfg = AgentConfig.get(context)
        if (cfg.userToken.isBlank()) return false
        val exp = cfg.userTokenExpiry
        if (exp <= 0) return true
        return System.currentTimeMillis() / 1000 < exp - 60
    }

    // ── 登录 ─────────────────────────────────────────────────────────────────

    /** 登录成功返回 null；失败返回错误信息。阻塞调用，需在 IO 线程执行。 */
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
                    return (map["error"] as? String)?.takeIf { it.isNotBlank() }
                        ?: "登录失败（HTTP ${resp.code}）"
                }
                val token = (map["token"] as? String).orEmpty()
                if (token.isBlank()) return "登录响应缺少 token"

                val refreshToken = (map["refresh_token"] as? String).orEmpty()
                val expiresAt    = (map["expires_at"]    as? Number)?.toLong() ?: 0L
                @Suppress("UNCHECKED_CAST")
                val user = map["user"] as? Map<String, Any?>
                val name = (user?.get("username") as? String).orEmpty().ifEmpty { username }
                val role = (user?.get("role") as? String).orEmpty()

                AgentConfig.save(
                    context,
                    AgentConfig.get(context).copy(
                        userToken      = token,
                        userName       = name,
                        userRole       = role,
                        refreshToken   = refreshToken,
                        userTokenExpiry = expiresAt,
                    )
                )
                // 通知 AgentService 触发菜单同步
                context.sendBroadcast(Intent(ACTION_LOGIN_SUCCESS).setPackage(context.packageName))
                null
            }
        } catch (e: Exception) {
            "网络错误：${e.message ?: "请求失败"}"
        }
    }

    // ── 登出 ─────────────────────────────────────────────────────────────────

    fun logout(context: Context) {
        val cur = AgentConfig.get(context)
        AgentConfig.save(
            context,
            cur.copy(
                userToken       = "",
                userName        = "",
                userRole        = "",
                refreshToken    = "",
                userTokenExpiry = 0L,
            )
        )
        context.sendBroadcast(Intent(ACTION_LOGOUT).setPackage(context.packageName))
    }

    // ── 自动续期 ─────────────────────────────────────────────────────────────

    /**
     * 若 access token 在 5 分钟内过期，自动用 refresh token 换新 access token（滚动续期）。
     * - 成功：更新 AgentConfig，返回 true。
     * - refresh token 也失效：广播 TOKEN_EXPIRED，清除本地 token，返回 false。
     * - 网络错误：静默返回 false（不广播，下次心跳再试）。
     *
     * 阻塞调用，需在 IO 线程执行。
     */
    fun refreshIfNeeded(context: Context): Boolean {
        val cfg = AgentConfig.get(context)
        if (cfg.userToken.isBlank()) return false

        val nowSec = System.currentTimeMillis() / 1000
        val exp    = cfg.userTokenExpiry
        // 距过期超过 5 分钟，无需刷新
        if (exp > 0 && nowSec < exp - 300) return true

        if (cfg.refreshToken.isBlank()) {
            // 无 refresh token，直接广播失效
            if (exp > 0 && nowSec >= exp) broadcastExpired(context)
            return false
        }

        val base = AgentMenuStore.getServerUrl(context).trim().trimEnd('/')
        val payload = Gson().toJson(mapOf("refresh_token" to cfg.refreshToken))
        val req = Request.Builder()
            .url("$base/api/auth/refresh")
            .post(payload.toRequestBody(jsonMedia))
            .build()

        return try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    broadcastExpired(context)
                    return false
                }
                val body = resp.body?.string().orEmpty()
                val map: Map<String, Any?> = Gson().fromJson(body, mapType)
                val newToken   = (map["token"]         as? String).orEmpty()
                val newRefresh = (map["refresh_token"] as? String).orEmpty()
                val newExp     = (map["expires_at"]    as? Number)?.toLong() ?: 0L
                if (newToken.isBlank()) {
                    broadcastExpired(context)
                    return false
                }
                @Suppress("UNCHECKED_CAST")
                val user = map["user"] as? Map<String, Any?>
                AgentConfig.save(
                    context,
                    AgentConfig.get(context).copy(
                        userToken       = newToken,
                        refreshToken    = newRefresh,
                        userTokenExpiry = newExp,
                        userName        = (user?.get("username") as? String)
                            ?.takeIf { it.isNotBlank() } ?: cfg.userName,
                        userRole        = (user?.get("role") as? String) ?: cfg.userRole,
                    )
                )
                true
            }
        } catch (_: Exception) {
            false // 网络错误静默处理，不广播
        }
    }

    private fun broadcastExpired(context: Context) {
        val cur = AgentConfig.get(context)
        AgentConfig.save(context, cur.copy(userToken = "", userTokenExpiry = 0L))
        context.sendBroadcast(Intent(ACTION_TOKEN_EXPIRED).setPackage(context.packageName))
    }
}
