package com.appmanager.agent

import android.content.Context
import com.appmanager.agent.config.AgentConfig
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * 持久化服务端下发的 Agent 菜单（[agent_menu_sync]），供首页磁贴与 WebView 打开。
 */
object AgentMenuStore {
    private const val PREF = "agent_menu_store"
    private const val KEY_MENUS = "menus_json"
    private const val KEY_REVISION = "revision"

    private val listType = object : TypeToken<List<Map<String, Any?>>>() {}.type

    fun save(context: Context, revision: Long, menusJson: String) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putLong(KEY_REVISION, revision)
            .putString(KEY_MENUS, menusJson)
            .apply()
    }

    fun revision(context: Context): Long =
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(KEY_REVISION, 0L)

    private fun loadList(context: Context): List<Map<String, Any?>> {
        val json = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .getString(KEY_MENUS, null) ?: return emptyList()
        return try { Gson().fromJson(json, listType) } catch (_: Exception) { emptyList() }
    }

    /** 用 serverUrl 将 preview_path 拼成完整 URL；兼容旧字段 preview_url。 */
    private fun resolvePreviewUrl(context: Context, m: Map<String, Any?>): String? {
        // 优先读新字段 preview_path（相对路径），用 serverUrl 拼绝对地址
        val path = m["preview_path"] as? String
        if (!path.isNullOrBlank()) {
            val serverUrl = AgentConfig.get(context).serverUrl.trim().trimEnd('/')
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
}
