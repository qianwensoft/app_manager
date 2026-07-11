package com.appmanager.agent

import android.content.Context
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.ServerUrlUtil
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken

/**
 * 持久化服务端下发的 Agent 菜单（[agent_menu_sync]），供首页磁贴与 WebView 打开。
 */
object AgentMenuStore {
    private const val PREF = "agent_menu_store"
    private const val KEY_MENUS = "menus_json"
    private const val KEY_BUNDLE = "bundle_json"
    private const val KEY_REVISION = "revision"
    private const val KEY_LAST_SYNC = "last_sync_time"

    private val listType = object : TypeToken<List<Map<String, Any?>>>() {}.type

    fun save(context: Context, revision: Long, menusJson: String, bundleJson: String) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putLong(KEY_REVISION, revision)
            .putString(KEY_MENUS, menusJson)
            .putString(KEY_BUNDLE, bundleJson)
            .putLong(KEY_LAST_SYNC, System.currentTimeMillis())
            .apply()
    }

    fun revision(context: Context): Long =
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(KEY_REVISION, 0L)

    fun bundleJSON(context: Context): String? =
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_BUNDLE, null)

    /** 距离上次同步的时间（毫秒）。 */
    fun timeSinceLastSync(context: Context): Long {
        val lastSync = context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(KEY_LAST_SYNC, 0L)
        if (lastSync == 0L) return Long.MAX_VALUE
        return System.currentTimeMillis() - lastSync
    }

    private fun loadList(context: Context): List<Map<String, Any?>> {
        val json = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .getString(KEY_MENUS, null) ?: return emptyList()
        return try { Gson().fromJson(json, listType) } catch (_: Exception) { emptyList() }
    }

    /** 用 serverUrl 将 preview_path 拼成完整 URL；兼容旧字段 preview_url。 */
    fun resolveMenuUrl(context: Context, m: Map<String, Any?>): String? = resolvePreviewUrl(context, m)

    private fun resolvePreviewUrl(context: Context, m: Map<String, Any?>): String? {
        // 优先读新字段 preview_path（相对路径或完整 URL）
        val path = m["preview_path"] as? String
        if (!path.isNullOrBlank()) {
            // 如果是完整 URL（http:// 或 https://），直接返回
            if (path.startsWith("http://") || path.startsWith("https://")) {
                return path
            }
            // 否则作为相对路径，用 serverUrl 拼绝对地址
            val cfg = AgentConfig.get(context)
            // 菜单下发的 form_app_base_url 优先于本地 formAppBaseUrl 配置
            val menuFormBase = (m["form_app_base_url"] as? String)?.trim()?.trimEnd('/').orEmpty()
            val localFormBase = cfg.formAppBaseUrl.trim().trimEnd('/')
            val formBase = menuFormBase.ifEmpty { localFormBase }
            if (formBase.isNotEmpty() && path.startsWith("/form-app/")) {
                return formBase + path
            }
            val serverUrl = cfg.serverUrl.trim().trimEnd('/')
            val httpBase = ServerUrlUtil.httpBaseFromWs(serverUrl)
            if (httpBase.isNotEmpty()) return httpBase + path
        }
        // 回退兼容旧版本服务端下发的 preview_url
        return (m["preview_url"] as? String)?.takeIf { it.isNotBlank() }
    }

    /** 首页展示用：第一个「显示在首页」且有预览路径的菜单。 */
    fun getFirstHomePreviewUrl(context: Context): String? {
        for (m in loadList(context)) {
            val home = m["show_on_agent_home"] as? Boolean ?: false
            if (!home) continue
            val url = resolvePreviewUrl(context, m)
            if (!url.isNullOrBlank()) return url
        }
        return null
    }

    /**
     * 按 [intentAction] 查找菜单的 preview_url。
     */
    fun getPreviewUrlByIntent(context: Context, intentAction: String): String? {
        if (intentAction.isBlank()) return null
        for (m in loadList(context)) {
            if ((m["intent_action"] as? String)?.trim() == intentAction) {
                val url = resolvePreviewUrl(context, m)
                if (!url.isNullOrBlank()) return url
            }
        }
        return null
    }

    /** 返回全部已下发菜单（供菜单列表展示）。 */
    fun getAllMenuItems(context: Context): List<Map<String, Any?>> = loadList(context)

    /** 返回全部已注册的 intent_action（非空），供动态注册广播接收器。 */
    fun getAllIntentActions(context: Context): List<String> =
        loadList(context).mapNotNull { (it["intent_action"] as? String)?.trim()?.takeIf { a -> a.isNotEmpty() } }.distinct()

    data class MenuItem(
        val targetType: String?,
        val targetRef: String?,
        val formAppCode: String?,
        val formAppPageKey: String?,
    )

    fun getMenuByIntent(context: Context, intentAction: String): MenuItem? {
        if (intentAction.isBlank()) return null
        for (m in loadList(context)) {
            if ((m["intent_action"] as? String)?.trim() == intentAction) {
                return MenuItem(
                    targetType = m["target_type"] as? String,
                    targetRef = m["target_ref"] as? String,
                    formAppCode = m["form_app_code"] as? String,
                    formAppPageKey = m["form_app_page_key"] as? String
                )
            }
        }
        return null
    }

    fun getServerUrl(context: Context): String {
        val serverUrl = AgentConfig.get(context).serverUrl.trim().trimEnd('/')
        return ServerUrlUtil.httpBaseFromWs(serverUrl)
    }

    /** 首页第一个 form_app_entry 菜单（无 preview_path 的表单入口）。 */
    fun getFirstHomeFormAppMenu(context: Context): Map<String, Any?>? {
        for (m in loadList(context)) {
            val home = m["show_on_agent_home"] as? Boolean ?: false
            if (!home) continue
            if (m["target_type"] == "form_app_entry") return m
        }
        return null
    }

    fun launchFormAppEntry(context: Context, m: Map<String, Any?>, newTask: Boolean = false) {
        val code = (m["form_app_code"] as? String)?.trim().orEmpty()
            .ifEmpty { (m["target_ref"] as? String)?.trim().orEmpty() }
        if (code.isEmpty()) return
        val pageKey = (m["form_app_page_key"] as? String)?.trim().orEmpty().ifEmpty { "form" }
        val menuFormBase = (m["form_app_base_url"] as? String)?.trim()?.trimEnd('/').orEmpty()
        val intent = android.content.Intent(context, FormAppActivity::class.java)
            .putExtra("form_app_code", code)
            .putExtra("page_key", pageKey)
            .putExtra("server_url", getServerUrl(context))
        if (menuFormBase.isNotEmpty()) intent.putExtra("form_app_base_url", menuFormBase)
        if (newTask) intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun resolveByScanEvent(
        context: Context,
        intentAction: String,
        eventType: String,
        scanValue: String
    ): String? {
        val rows = loadList(context)
        for (m in rows) {
            val action = (m["intent_action"] as? String)?.trim().orEmpty()
            if (action != intentAction) continue
            val cfgRaw = (m["scan_config_json"] as? String)?.trim().orEmpty()
            if (cfgRaw.isEmpty()) {
                return resolvePreviewUrl(context, m)
            }
            val cfg = runCatching { Gson().fromJson(cfgRaw, JsonObject::class.java) }.getOrNull() ?: continue
            val mode = cfg.get("mode")?.asString?.trim().orEmpty().ifEmpty { "router" }
            if (mode == "exclusive") {
                // 独占模式交由页面内处理扫描输入，仅负责打开目标页。
                return resolvePreviewUrl(context, m)
            }
            val rules = cfg.getAsJsonArray("matchers") ?: return resolvePreviewUrl(context, m)
            for (rule in rules) {
                val r = rule?.asJsonObject ?: continue
                val evt = r.get("event_type")?.asString?.trim()
                if (!evt.isNullOrBlank() && evt != eventType) continue
                val kind = r.get("kind")?.asString?.trim().orEmpty()
                val expected = r.get("value")?.asString ?: ""
                val matched = when (kind) {
                    "prefix" -> scanValue.startsWith(expected)
                    "regex" -> runCatching { Regex(expected).containsMatchIn(scanValue) }.getOrDefault(false)
                    "equals" -> scanValue == expected
                    "enum" -> {
                        val arr = r.getAsJsonArray("values")
                        arr?.any { it?.asString == scanValue } == true
                    }
                    else -> true
                }
                if (matched) return resolvePreviewUrl(context, m)
            }
        }
        return null
    }
}
