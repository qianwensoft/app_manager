package com.appmanager.agent.util

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * 工单类型配置存储和模板渲染工具
 */
object WorkOrderTypeStore {

    private const val TAG = "WorkOrderTypeStore"
    private const val PREFS_NAME = "work_order_types"
    private const val KEY_TYPES = "types_json"
    private const val KEY_TAGS = "tags_json"

    data class WorkOrderType(
        val code: String,
        val name: String,
        val boardCardTemplate: String = "",
        val enabled: Boolean = true
    )

    data class WorkOrderTag(
        val code: String,
        val name: String,
        val color: String = ""
    )

    private var cachedTypes: List<WorkOrderType>? = null
    private var cachedTags: List<WorkOrderTag>? = null

    /**
     * 从服务器加载工单类型配置
     */
    fun loadFromServer(context: Context, onComplete: (Boolean) -> Unit = {}) {
        Thread {
            try {
                val cfg = com.appmanager.agent.config.AgentConfig.get(context)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                if (base.isBlank()) {
                    Log.e(TAG, "Server URL is blank")
                    onComplete(false)
                    return@Thread
                }

                // 优先使用用户 JWT token（这些 API 需要认证），否则使用 device token
                val authToken = cfg.userToken.trim().ifEmpty { cfg.deviceToken.trim() }
                if (authToken.isEmpty()) {
                    Log.e(TAG, "No auth token available (neither user nor device token)")
                    onComplete(false)
                    return@Thread
                }

                Log.d(TAG, "Loading work order types from server: $base (using ${if (cfg.userToken.isNotEmpty()) "user JWT" else "device token"})")

                val typesJson: String
                val tagsJson: String

                if (cfg.userToken.isNotEmpty()) {
                    // 使用 JWT token（标准 Authorization Bearer header）
                    typesJson = AgentCatalogApi.getJsonWithJWT(base, "/api/work-orders/types", authToken)
                    tagsJson = AgentCatalogApi.getJsonWithJWT(base, "/api/work-orders/tag-dict", authToken)
                } else {
                    // 使用 device token（X-Device-Token header）
                    typesJson = AgentCatalogApi.getJson(base, "/api/work-orders/types", authToken)
                    tagsJson = AgentCatalogApi.getJson(base, "/api/work-orders/tag-dict", authToken)
                }

                Log.d(TAG, "Types response: ${typesJson.take(200)}")
                val typesObj = JSONObject(typesJson)
                val typesArr = typesObj.optJSONArray("data") ?: JSONArray()

                Log.d(TAG, "Tags response: ${tagsJson.take(200)}")
                val tagsObj = JSONObject(tagsJson)
                val tagsArr = tagsObj.optJSONArray("data") ?: JSONArray()

                Log.d(TAG, "Parsed ${typesArr.length()} types and ${tagsArr.length()} tags")

                // 保存到本地
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                prefs.putString(KEY_TYPES, typesArr.toString())
                prefs.putString(KEY_TAGS, tagsArr.toString())
                prefs.apply()

                // 更新缓存
                cachedTypes = parseTypes(typesArr)
                cachedTags = parseTags(tagsArr)
                Log.d(TAG, "Loaded ${cachedTypes?.size ?: 0} types and ${cachedTags?.size ?: 0} tags from server")
                onComplete(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load work order types from server", e)
                onComplete(false)
            }
        }.start()
    }

    /**
     * 获取所有工单类型（优先使用缓存，缓存为空则从本地读取）
     */
    fun getTypes(context: Context): List<WorkOrderType> {
        if (cachedTypes == null) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY_TYPES, null)
            if (json != null) {
                try {
                    val arr = JSONArray(json)
                    cachedTypes = parseTypes(arr)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse cached types", e)
                    cachedTypes = emptyList()
                }
            } else {
                cachedTypes = emptyList()
            }
        }
        return cachedTypes ?: emptyList()
    }

    /**
     * 获取所有标签（优先使用缓存，缓存为空则从本地读取）
     */
    fun getTags(context: Context): List<WorkOrderTag> {
        if (cachedTags == null) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY_TAGS, null)
            if (json != null) {
                try {
                    val arr = JSONArray(json)
                    cachedTags = parseTags(arr)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse cached tags", e)
                    cachedTags = emptyList()
                }
            } else {
                cachedTags = emptyList()
            }
        }
        return cachedTags ?: emptyList()
    }

    /**
     * 根据类型代码获取类型配置
     */
    fun getType(context: Context, code: String): WorkOrderType? {
        return getTypes(context).find { it.code == code }
    }

    /**
     * 获取类型名称
     */
    fun getTypeName(context: Context, code: String): String {
        return getType(context, code)?.name ?: code.ifEmpty { "-" }
    }

    /**
     * 获取类型的看板卡片模板
     */
    fun getCardTemplate(context: Context, code: String): String {
        return getType(context, code)?.boardCardTemplate ?: ""
    }

    private fun parseTypes(arr: JSONArray): List<WorkOrderType> {
        val list = mutableListOf<WorkOrderType>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            if (obj.optBoolean("enabled", true)) {
                list.add(
                    WorkOrderType(
                        code = obj.optString("code", ""),
                        name = obj.optString("name", ""),
                        boardCardTemplate = obj.optString("board_card_template", ""),
                        enabled = obj.optBoolean("enabled", true)
                    )
                )
            }
        }
        return list
    }

    private fun parseTags(arr: JSONArray): List<WorkOrderTag> {
        val list = mutableListOf<WorkOrderTag>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            list.add(
                WorkOrderTag(
                    code = obj.optString("code", ""),
                    name = obj.optString("name", ""),
                    color = obj.optString("color", "")
                )
            )
        }
        return list
    }

    /**
     * 根据标签 code 获取标签名称
     */
    fun getTagName(context: Context, code: String): String {
        val tag = getTags(context).find { it.code == code }
        val name = tag?.name ?: code
        if (tag == null && code.isNotEmpty()) {
            Log.d(TAG, "Tag not found: $code, available tags: ${getTags(context).map { "${it.code}:${it.name}" }}")
        }
        return name
    }

    /**
     * 根据标签 code 获取标签颜色
     */
    fun getTagColor(context: Context, code: String): String {
        return getTags(context).find { it.code == code }?.color ?: ""
    }

    /**
     * 渲染工单卡片模板
     * 将模板中的 {{key}} 替换为工单字段值
     */
    fun renderCardTemplate(
        context: Context,
        template: String,
        workOrder: Map<String, Any?>
    ): List<String> {
        if (template.isBlank()) return emptyList()

        val lines = template.split('\n')
        return lines.mapNotNull { line ->
            val rendered = line.replace(Regex("""\{\{\s*([\w.]+)\s*\}\}""")) { matchResult ->
                val key = matchResult.groupValues[1].trim()
                getFieldValue(context, key, workOrder)
            }
            // 过滤全空行
            if (rendered.trim().isNotEmpty()) rendered else null
        }
    }

    /**
     * 获取工单字段值
     * 支持特殊字段：type_name, status_label, tags
     */
    private fun getFieldValue(context: Context, key: String, workOrder: Map<String, Any?>): String {
        return when (key) {
            "type_name" -> getTypeName(context, workOrder["type_code"] as? String ?: "")
            "status_label" -> getStatusLabel(workOrder["status"] as? String ?: "")
            "priority_label" -> getPriorityLabel(workOrder["priority"] as? String ?: "")
            "tags" -> {
                val tags = workOrder["tags"] as? List<*>
                tags?.mapNotNull { code ->
                    val tagCode = code.toString()
                    getTagName(context, tagCode)
                }?.joinToString("、") ?: ""
            }
            else -> workOrder[key]?.toString() ?: ""
        }
    }

    private fun getStatusLabel(status: String): String = when (status) {
        "open" -> "待处理"
        "in_progress" -> "进行中"
        "resolved" -> "已解决"
        "closed" -> "已关闭"
        "reopened" -> "重新打开"
        else -> status
    }

    private fun getPriorityLabel(priority: String): String = when (priority) {
        "normal" -> "普通"
        "high" -> "较高"
        "urgent" -> "紧急"
        else -> priority
    }

    /**
     * 获取默认卡片显示内容（模板为空时的回退）
     */
    fun getDefaultCardLines(context: Context, workOrder: Map<String, Any?>): List<String> {
        val lines = mutableListOf<String>()

        // 标题
        val title = workOrder["title"] as? String
        if (!title.isNullOrBlank()) {
            lines.add(title)
        }

        // 工单号 · 状态
        val code = workOrder["code"] as? String ?: ""
        val status = getStatusLabel(workOrder["status"] as? String ?: "")
        lines.add("$code · $status")

        // 业务单号（如果有）
        val businessNo = workOrder["business_no"] as? String
        if (!businessNo.isNullOrBlank()) {
            lines.add("业务单号：$businessNo")
        }

        // 其他编码（如果有）
        val otherCodes = workOrder["other_codes"] as? String
        if (!otherCodes.isNullOrBlank()) {
            lines.add("其他编码：$otherCodes")
        }

        // 设备名称（如果有）
        val deviceName = workOrder["device_name"] as? String
        if (!deviceName.isNullOrBlank()) {
            lines.add("设备：$deviceName")
        }

        // 类型（如果有）
        val typeCode = workOrder["type_code"] as? String
        if (!typeCode.isNullOrBlank()) {
            val typeName = getTypeName(context, typeCode)
            lines.add("类型：$typeName")
        }

        // 标签（如果有）
        val tags = workOrder["tags"] as? List<*>
        if (!tags.isNullOrEmpty()) {
            val tagNames = tags.mapNotNull { code ->
                val tagCode = code.toString()
                getTagName(context, tagCode)
            }.joinToString("、")
            if (tagNames.isNotBlank()) {
                lines.add("标签：$tagNames")
            }
        }

        return lines
    }
}
