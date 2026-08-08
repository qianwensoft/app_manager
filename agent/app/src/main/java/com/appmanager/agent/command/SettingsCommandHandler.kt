package com.appmanager.agent.command

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ws.Message
import org.json.JSONObject

/**
 * 基于 WRITE_SECURE_SETTINGS 权限的系统配置命令处理器。
 * 无需 Device Owner，ADB 一次性授权后即可使用：
 *   adb shell pm grant com.appmanager.agent android.permission.WRITE_SECURE_SETTINGS
 */
object SettingsCommandHandler {

    private const val TAG = "SettingsCommandHandler"

    // ── 权限检查辅助 ──────────────────────────────────────────────────────────

    private fun hasWriteSecure(service: AgentService): Boolean =
        service.checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun requireWriteSecure(msg: Message, service: AgentService): Boolean {
        if (!hasWriteSecure(service)) {
            CommandDispatcher.sendResult(
                service, msg.commandId, false,
                "缺少 WRITE_SECURE_SETTINGS 权限，请执行：\nadb shell pm grant ${service.packageName} android.permission.WRITE_SECURE_SETTINGS"
            )
            return false
        }
        return true
    }

    // ── ADB 调试开关 ──────────────────────────────────────────────────────────

    /** action: mdm_set_adb  data: { "enabled": bool } */
    fun setAdb(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val enabled = (msg.data as? Map<*, *>)?.get("enabled") as? Boolean ?: false
        try {
            Settings.Global.putInt(service.contentResolver, Settings.Global.ADB_ENABLED, if (enabled) 1 else 0)
            CommandDispatcher.sendResult(service, msg.commandId, true, "USB 调试已${if (enabled) "开启" else "关闭"}")
        } catch (e: Exception) {
            Log.e(TAG, "setAdb", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 动画缩放（0.0 = 关闭）────────────────────────────────────────────────

    /** action: mdm_set_animation  data: { "scale": 0.0 }  0=关/0.5=快/1.0=正常 */
    fun setAnimation(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val scale = (msg.data as? Map<*, *>)?.get("scale")?.toString()?.toFloatOrNull() ?: 1.0f
        try {
            val cr = service.contentResolver
            Settings.Global.putFloat(cr, Settings.Global.ANIMATOR_DURATION_SCALE, scale)
            Settings.Global.putFloat(cr, Settings.Global.TRANSITION_ANIMATION_SCALE, scale)
            Settings.Global.putFloat(cr, Settings.Global.WINDOW_ANIMATION_SCALE, scale)
            val label = when {
                scale <= 0f -> "已关闭"
                scale <= 0.5f -> "快速(${scale}x)"
                else -> "正常(${scale}x)"
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, "动画缩放: $label")
        } catch (e: Exception) {
            Log.e(TAG, "setAnimation", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 位置模式 ─────────────────────────────────────────────────────────────

    /** action: mdm_set_location_mode  data: { "mode": 0 }  0=关/1=省电/2=网络/3=高精度 */
    fun setLocationMode(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val mode = (msg.data as? Map<*, *>)?.get("mode")?.toString()?.toIntOrNull() ?: 0
        try {
            if (Build.VERSION.SDK_INT >= 19) {
                Settings.Secure.putInt(service.contentResolver, Settings.Secure.LOCATION_MODE, mode)
            } else {
                val providers = when (mode) {
                    0 -> ""
                    1 -> "network"
                    2 -> "network"
                    else -> "gps,network"
                }
                Settings.Secure.putString(service.contentResolver, Settings.Secure.LOCATION_PROVIDERS_ALLOWED, providers)
            }
            val label = when (mode) {
                0 -> "已关闭"; 1 -> "仅传感器"; 2 -> "省电(网络)"; 3 -> "高精度"; else -> mode.toString()
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, "位置模式: $label")
        } catch (e: Exception) {
            Log.e(TAG, "setLocationMode", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 无障碍服务静默开关 ────────────────────────────────────────────────────

    /**
     * action: mdm_enable_accessibility
     * data: { "enabled": bool, "component": "com.pkg/.Service" }
     * 留空 component 默认操作 Agent 自身的 TouchAccessibilityService。
     */
    fun enableAccessibility(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val data = msg.data as? Map<*, *>
        val enabled = data?.get("enabled") as? Boolean ?: true
        val component = (data?.get("component") as? String)?.trim()
            ?.ifEmpty { null }
            ?: "${service.packageName}/.service.TouchAccessibilityService"

        try {
            val cr = service.contentResolver
            val current = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
            val newVal = if (enabled) {
                if (component in current) current
                else (current.split(":") + component).filter { it.isNotBlank() }.joinToString(":")
            } else {
                current.split(":").filter { it.isNotBlank() && it != component }.joinToString(":")
            }
            Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, newVal)
            Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, if (enabled && newVal.isNotEmpty()) 1 else 0)
            CommandDispatcher.sendResult(service, msg.commandId, true,
                "无障碍服务 $component ${if (enabled) "已启用" else "已停用"}")
        } catch (e: Exception) {
            Log.e(TAG, "enableAccessibility", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 自动时间 / 时区 ───────────────────────────────────────────────────────

    /** action: mdm_set_auto_time  data: { "auto_time": bool, "auto_time_zone": bool } */
    fun setAutoTime(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val data = msg.data as? Map<*, *>
        try {
            val cr = service.contentResolver
            val autoTime = data?.get("auto_time") as? Boolean
            val autoZone = data?.get("auto_time_zone") as? Boolean
            val results = mutableListOf<String>()
            if (autoTime != null) {
                Settings.Global.putInt(cr, Settings.Global.AUTO_TIME, if (autoTime) 1 else 0)
                results += "自动时间: ${if (autoTime) "开" else "关"}"
            }
            if (autoZone != null) {
                Settings.Global.putInt(cr, Settings.Global.AUTO_TIME_ZONE, if (autoZone) 1 else 0)
                results += "自动时区: ${if (autoZone) "开" else "关"}"
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, results.joinToString("，"))
        } catch (e: Exception) {
            Log.e(TAG, "setAutoTime", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── WiFi ─────────────────────────────────────────────────────────────────

    /** action: mdm_set_wifi  data: { "enabled": bool }  Android 10+ 需 DO 权限 */
    @Suppress("DEPRECATION")
    fun setWifi(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val enabled = (msg.data as? Map<*, *>)?.get("enabled") as? Boolean ?: true
        try {
            val wm = service.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val ok = wm.setWifiEnabled(enabled)
            if (ok) {
                CommandDispatcher.sendResult(service, msg.commandId, true, "WiFi 已${if (enabled) "开启" else "关闭"}")
            } else {
                // Android 10+ 非 DO 无法调用 setWifiEnabled，尝试 Settings.Global
                Settings.Global.putInt(service.contentResolver, "wifi_on", if (enabled) 1 else 0)
                CommandDispatcher.sendResult(service, msg.commandId, true, "WiFi 设置已写入（Android 10+ 可能需要 Device Owner）")
            }
        } catch (e: Exception) {
            Log.e(TAG, "setWifi", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, "WiFi 切换失败（Android 10+ 需 Device Owner）: ${e.message}")
        }
    }

    // ── 蓝牙 ─────────────────────────────────────────────────────────────────

    /** action: mdm_set_bluetooth  data: { "enabled": bool } */
    @Suppress("DEPRECATION")
    fun setBluetooth(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val enabled = (msg.data as? Map<*, *>)?.get("enabled") as? Boolean ?: true
        try {
            val adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            val ok = if (enabled) adapter?.enable() == true else adapter?.disable() == true
            CommandDispatcher.sendResult(service, msg.commandId, ok,
                if (ok) "蓝牙已${if (enabled) "开启" else "关闭"}" else "蓝牙操作失败（可能需要 BLUETOOTH_CONNECT 权限）")
        } catch (e: Exception) {
            Log.e(TAG, "setBluetooth", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 飞行模式 ─────────────────────────────────────────────────────────────

    /** action: mdm_set_airplane  data: { "enabled": bool } */
    fun setAirplaneMode(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val enabled = (msg.data as? Map<*, *>)?.get("enabled") as? Boolean ?: false
        try {
            Settings.Global.putInt(service.contentResolver, Settings.Global.AIRPLANE_MODE_ON, if (enabled) 1 else 0)
            // 广播让系统立即响应（MIUI / 部分 ROM 需要）
            service.sendBroadcast(Intent(Intent.ACTION_AIRPLANE_MODE_CHANGED).apply {
                putExtra("state", enabled)
            })
            CommandDispatcher.sendResult(service, msg.commandId, true,
                "飞行模式已${if (enabled) "开启" else "关闭"}（部分系统机型可能需要手动确认）")
        } catch (e: Exception) {
            Log.e(TAG, "setAirplaneMode", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 充电时保持唤醒 ────────────────────────────────────────────────────────

    /** action: mdm_set_stay_on  data: { "mode": 7 }  0=关/1=USB/2=AC/4=无线/7=全部 */
    fun setStayOn(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val mode = (msg.data as? Map<*, *>)?.get("mode")?.toString()?.toIntOrNull() ?: 0
        try {
            Settings.Global.putInt(service.contentResolver, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, mode)
            val label = when (mode) {
                0 -> "已关闭"; 1 -> "USB 充电时保持"; 2 -> "AC 充电时保持"
                4 -> "无线充电时保持"; 7 -> "所有充电方式保持"; else -> "mode=$mode"
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, "屏幕常亮: $label")
        } catch (e: Exception) {
            Log.e(TAG, "setStayOn", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 未知来源安装 ──────────────────────────────────────────────────────────

    /** action: mdm_set_unknown_sources  data: { "enabled": bool } */
    fun setUnknownSources(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val enabled = (msg.data as? Map<*, *>)?.get("enabled") as? Boolean ?: false
        try {
            if (Build.VERSION.SDK_INT < 26) {
                @Suppress("DEPRECATION")
                Settings.Secure.putInt(service.contentResolver, Settings.Secure.INSTALL_NON_MARKET_APPS, if (enabled) 1 else 0)
                CommandDispatcher.sendResult(service, msg.commandId, true, "未知来源安装已${if (enabled) "允许" else "禁止"}")
            } else {
                CommandDispatcher.sendResult(service, msg.commandId, false,
                    "Android 8+ 未知来源安装改为逐应用授权，需通过 Device Owner setPackageInstallersAllowlist 或系统设置管理")
            }
        } catch (e: Exception) {
            Log.e(TAG, "setUnknownSources", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 勿扰模式（Do Not Disturb） ────────────────────────────────────────────

    /** action: mdm_set_zen_mode  data: { "mode": 0 }  0=正常/1=优先/2=仅闹钟/3=完全静音 */
    fun setZenMode(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val mode = (msg.data as? Map<*, *>)?.get("mode")?.toString()?.toIntOrNull() ?: 0
        try {
            Settings.Global.putInt(service.contentResolver, "zen_mode", mode)
            val label = when (mode) {
                0 -> "正常"; 1 -> "优先打扰"; 2 -> "仅闹钟"; 3 -> "完全静音"; else -> "mode=$mode"
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, "勿扰模式: $label")
        } catch (e: Exception) {
            Log.e(TAG, "setZenMode", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 通用 Settings.Global 写入 ─────────────────────────────────────────────

    /** action: mdm_set_global_setting  data: { "key": "xxx", "value": "yyy" } */
    fun setGlobalSetting(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val data = msg.data as? Map<*, *>
        val key   = (data?.get("key")   as? String)?.trim()
        val value = (data?.get("value") as? String)
        if (key.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "key 不能为空")
            return
        }
        try {
            Settings.Global.putString(service.contentResolver, key, value)
            CommandDispatcher.sendResult(service, msg.commandId, true, "Global.$key = $value")
        } catch (e: Exception) {
            Log.e(TAG, "setGlobalSetting", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 通用 Settings.Secure 写入 ─────────────────────────────────────────────

    /** action: mdm_set_secure_setting  data: { "key": "xxx", "value": "yyy" } */
    fun setSecureSetting(msg: Message, service: AgentService) {
        if (!requireWriteSecure(msg, service)) return
        val data = msg.data as? Map<*, *>
        val key   = (data?.get("key")   as? String)?.trim()
        val value = (data?.get("value") as? String)
        if (key.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "key 不能为空")
            return
        }
        try {
            Settings.Secure.putString(service.contentResolver, key, value)
            CommandDispatcher.sendResult(service, msg.commandId, true, "Secure.$key = $value")
        } catch (e: Exception) {
            Log.e(TAG, "setSecureSetting", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 读取当前系统设置快照 ───────────────────────────────────────────────────

    /** action: mdm_get_system_settings — 返回所有受管系统设置的当前值 */
    fun getSystemSettings(msg: Message, service: AgentService) {
        val cr = service.contentResolver
        val snapshot = JSONObject().apply {
            // Global
            put("adb_enabled",            Settings.Global.getInt(cr, Settings.Global.ADB_ENABLED, 0))
            put("auto_time",              Settings.Global.getInt(cr, Settings.Global.AUTO_TIME, 1))
            put("auto_time_zone",         Settings.Global.getInt(cr, Settings.Global.AUTO_TIME_ZONE, 1))
            put("airplane_mode_on",       Settings.Global.getInt(cr, Settings.Global.AIRPLANE_MODE_ON, 0))
            put("stay_on_while_plugged",  Settings.Global.getInt(cr, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, 0))
            put("animator_duration_scale",Settings.Global.getFloat(cr, Settings.Global.ANIMATOR_DURATION_SCALE, 1f))
            put("transition_animation_scale", Settings.Global.getFloat(cr, Settings.Global.TRANSITION_ANIMATION_SCALE, 1f))
            put("window_animation_scale", Settings.Global.getFloat(cr, Settings.Global.WINDOW_ANIMATION_SCALE, 1f))
            put("zen_mode",               Settings.Global.getInt(cr, "zen_mode", 0))
            // Secure
            put("location_mode",          Settings.Secure.getInt(cr, Settings.Secure.LOCATION_MODE, 3))
            put("enabled_accessibility_services", Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: "")
            put("accessibility_enabled",  Settings.Secure.getInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 0))
            put("ntp_server",             Settings.Global.getString(cr, "ntp_server") ?: "")
            put("has_write_secure_settings", hasWriteSecure(service))
        }
        CommandDispatcher.sendResult(service, msg.commandId, true, snapshot.toString())
    }
}
