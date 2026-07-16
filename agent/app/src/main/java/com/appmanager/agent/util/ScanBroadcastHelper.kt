package com.appmanager.agent.util

import android.content.Context
import android.content.IntentFilter
import android.util.Log
import com.appmanager.agent.config.AgentConfig
import org.json.JSONArray

/**
 * 扫描广播事件辅助类
 * 合并硬编码的常见扫描事件和后台下发的自定义扫描事件
 */
object ScanBroadcastHelper {

    private const val TAG = "ScanBroadcastHelper"

    /**
     * 硬编码的常见扫描枪广播事件
     */
    private val BUILTIN_SCAN_ACTIONS = listOf(
        "com.android.server.scannerservice.broadcast",
        "nlscan.action.SCANNER_RESULT",
        "com.honeywell.decode.intent.action.EDIT_DATA",
        "com.honeywell.decode.intent.action.BARCODE_DATA",
        "android.intent.ACTION_DECODE_DATA",
        "com.sunmi.scanner.ACTION_DATA",
        "unitech.scanservice.data",
        "com.zebra.dw.action.ACTION_DECODE_DATA",
        "com.speedata.showdecodedata",
        "com.se4500.onDecodeComplete"
    )

    /**
     * 常见扫描结果的 extra 键名
     */
    val SCAN_EXTRA_KEYS = listOf(
        "data", "barcode_string", "decode_data", "SCAN_DATA", "scannerdata",
        "barcode", "BARCODE", "SCAN_BARCODE1", "barcodeData", "decodeData",
        "message"
    )

    /**
     * 获取所有扫描广播事件（内置 + 后台下发的自定义事件）
     */
    fun getAllScanActions(context: Context): List<String> {
        val actions = BUILTIN_SCAN_ACTIONS.toMutableList()

        try {
            // 从 AgentConfig 或菜单配置中读取后台下发的自定义扫描事件
            // 这里假设后台会在某个配置中下发 custom_scan_actions_json
            val config = AgentConfig.get(context)
            val customActionsJson = config.customScanActionsJson

            if (customActionsJson.isNotBlank()) {
                val jsonArray = JSONArray(customActionsJson)
                for (i in 0 until jsonArray.length()) {
                    val action = jsonArray.optString(i)?.trim()
                    if (!action.isNullOrBlank() && !actions.contains(action)) {
                        actions.add(action)
                        Log.d(TAG, "Added custom scan action: $action")
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load custom scan actions: ${e.message}")
        }

        return actions
    }

    /**
     * 创建包含所有扫描事件的 IntentFilter
     */
    fun createScanIntentFilter(context: Context): IntentFilter {
        val filter = IntentFilter()
        getAllScanActions(context).forEach { filter.addAction(it) }
        return filter
    }
}
